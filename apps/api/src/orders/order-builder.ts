import { Injectable } from '@nestjs/common';
import {
  CombinationInput, GroupRule, IsoDate, MenuDish, OrderDraftInput, combinationSignature, cutoffInstant,
  formatMinutes, isWorkingDay, plannedTimes, priceCombination, validateCombinations, todayIn,
  asWeekdays, sumCents,
} from '@fernleaf/shared';
import type { Tx } from '../common/prisma.service';
import { Clock } from '../common/clock';
import { invalid, notFound, AppError } from '../common/errors';
import { fromDbDate } from '../common/dates';
import { SettingsService } from '../settings/settings.service';
import { MenuService } from '../menu/menu.service';
import { can, AuthUser } from '../auth/auth.types';
import { HttpStatus } from '@nestjs/common';

export interface BuiltCombination {
  quantity: number;
  unitCents: number;
  totalCents: number;
  signature: string;
  label: string;
  stationId: string | null;
  choices: {
    groupId: string; groupName: string; optionId: string; optionName: string;
    portionSizeId: string | null; portionName: string | null; optionCents: number; portionExtraCents: number;
  }[];
}

export interface BuiltLine {
  dishId: string; dishName: string; dishSku: string; temperature: 'HOT' | 'COLD';
  stationId: string | null; stationName: string | null; dishPriceCents: number;
  quantity: number; totalCents: number; sortOrder: number; combinations: BuiltCombination[];
}

export interface BuiltOrder {
  employeeId: string;
  companyId: string;
  deliveryDate: IsoDate;
  deliveryTimeMin: number;
  addressId: string;
  addressText: string;
  packagingTypeId: string;
  packagingName: string;
  notes: string;
  priceTierId: string;
  priceTierName: string;
  totalCents: number;
  deliveryAt: Date;
  plannedDispatchReadyAt: Date;
  plannedKitchenReadyAt: Date;
  defaultDriverId: string | null;
  lines: BuiltLine[];
}

export const cutoffPassed = () =>
  new AppError(HttpStatus.CONFLICT, 'CUTOFF_PASSED', 'Ordering for this date has closed. Only an admin can change it now.');

/**
 * Turns a request into a fully validated, fully priced order, or throws with field errors.
 * Runs inside the caller's transaction. Every rule in section 4 that applies to creating or
 * editing an order is checked here, regardless of what the form already checked.
 */
@Injectable()
export class OrderBuilder {
  constructor(
    private readonly settings: SettingsService,
    private readonly menu: MenuService,
    private readonly clock: Clock,
  ) {}

  async build(tx: Tx, input: OrderDraftInput, user: AuthUser, opts: { requireLines: boolean }): Promise<BuiltOrder> {
    const override = can(user, 'orders.override');
    const errors: Record<string, string> = {};

    const employee = await tx.employee.findUnique({
      where: { id: input.employeeId },
      include: {
        company: {
          include: {
            addresses: { where: { active: true } },
            holidays: true,
            defaultPackagingType: true,
          },
        },
      },
    });
    if (!employee) throw notFound('Employee');
    if (!employee.active) throw invalid('This employee is inactive', { employeeId: 'Inactive employee' });
    const company = employee.company;
    if (!company.active) throw invalid('This company is inactive', { employeeId: 'Company is inactive' });

    // Date: company calendar decides delivery days; kitchen calendar decides cut-off
    const settings = await this.settings.get(tx);
    const cutoffSettings = await this.settings.cutoffSettings(tx);
    const date = input.deliveryDate;
    const today = todayIn(settings.timeZone, this.clock.now());
    const companyCal = { workingDays: asWeekdays(company.workingDays), holidays: new Set(company.holidays.map((h) => fromDbDate(h.date))) };
    if (date < today && !override) errors.deliveryDate = 'Delivery date is in the past';
    else if (!isWorkingDay(date, companyCal)) errors.deliveryDate = `${company.name} does not take deliveries on this day`;
    else if (!isWorkingDay(date, cutoffSettings)) errors.deliveryDate = 'The kitchen is closed on this day';
    if (Object.keys(errors).length) throw invalid('Pick another delivery date', errors);
    if (this.clock.now() >= cutoffInstant(date, cutoffSettings) && !override) throw cutoffPassed();

    // Address, time, packaging: company default unless the employee may choose
    const defaultAddress = company.addresses.find((a) => a.isDefault) ?? company.addresses[0];
    if (!defaultAddress) throw invalid(`${company.name} has no delivery address`);
    const addressId = input.addressId ?? defaultAddress.id;
    const address = company.addresses.find((a) => a.id === addressId);
    if (!address) errors.addressId = 'Not one of this company’s addresses';
    else if (addressId !== defaultAddress.id && !employee.canChooseAddress && !override) {
      errors.addressId = 'This employee cannot choose their delivery address';
    }

    const deliveryTimeMin = input.deliveryTimeMin ?? company.defaultDeliveryTimeMin;
    if (deliveryTimeMin !== company.defaultDeliveryTimeMin && !employee.canChangeDeliveryTime && !override) {
      errors.deliveryTimeMin = `This employee gets the company time, ${formatMinutes(company.defaultDeliveryTimeMin)}`;
    }

    const packagingTypeId = input.packagingTypeId ?? company.defaultPackagingTypeId;
    const packaging = await tx.packagingType.findUnique({ where: { id: packagingTypeId } });
    if (!packaging || (!packaging.active && packagingTypeId !== company.defaultPackagingTypeId)) {
      errors.packagingTypeId = 'Unknown packaging';
    } else if (packagingTypeId !== company.defaultPackagingTypeId && !employee.canChangePackaging && !override) {
      errors.packagingTypeId = 'This employee cannot change packaging';
    }

    // Lines: everything is checked against the employee's own menu and tier
    if (opts.requireLines && input.lines.length === 0) errors.lines = 'Add at least one dish';
    const { menu, dishes } = await this.menu.orderableDishes(employee.id, tx);
    const stations = new Map((await tx.kitchenStation.findMany()).map((s) => [s.id, s.name]));
    const dishRows = new Map(
      (await tx.dish.findMany({ where: { id: { in: input.lines.map((l) => l.dishId) } } })).map((d) => [d.id, d]),
    );
    const seenDishes = new Set<string>();
    const lines: BuiltLine[] = [];

    input.lines.forEach((line, i) => {
      const at = `lines.${i}`;
      const dish = dishes.get(line.dishId);
      const row = dishRows.get(line.dishId);
      if (!dish || !row) {
        errors[`${at}.dishId`] = 'This dish is not on this employee’s menu';
        return;
      }
      if (seenDishes.has(dish.id)) {
        errors[`${at}.dishId`] = `${dish.name} is already on the order; add combinations to that line`;
        return;
      }
      seenDishes.add(dish.id);
      if (dish.minOrderQty && line.quantity < dish.minOrderQty) {
        errors[`${at}.quantity`] = `${dish.name} has a minimum of ${dish.minOrderQty}`;
      }
      const rules = groupRules(dish);
      for (const issue of validateCombinations(line.quantity, line.combinations as CombinationInput[], rules)) {
        const key = `${at}.${issue.path}`;
        errors[key] = errors[key] ? `${errors[key]}; ${issue.message}` : issue.message;
      }
      if (Object.keys(errors).some((k) => k.startsWith(`${at}.`))) return;

      let combinations: BuiltCombination[];
      try {
        combinations = line.combinations.map((c) => priceCombo(dish, row.stationId, c));
      } catch {
        errors[`${at}.quantity`] = 'This line total is too large';
        return;
      }
      lines.push({
        dishId: dish.id,
        dishName: dish.name,
        dishSku: row.sku,
        temperature: dish.temperature,
        stationId: row.stationId,
        stationName: row.stationId ? (stations.get(row.stationId) ?? null) : null,
        dishPriceCents: dish.priceCents,
        quantity: line.quantity,
        totalCents: sumCents(combinations.map((c) => c.totalCents)),
        sortOrder: i,
        combinations,
      });
    });

    if (Object.keys(errors).length) throw invalid('Some parts of the order need attention', errors);

    const planned = plannedTimes(date, deliveryTimeMin, settings.timeZone, company.deliveryLeadMin, settings.kitchenBufferMin);
    let totalCents: number;
    try {
      totalCents = sumCents(lines.map((l) => l.totalCents));
    } catch {
      throw invalid('The order total is too large', { lines: 'Reduce quantities or split this into multiple orders' });
    }
    return {
      employeeId: employee.id,
      companyId: company.id,
      deliveryDate: date,
      deliveryTimeMin,
      addressId,
      addressText: formatAddress(address!),
      packagingTypeId,
      packagingName: packaging!.name,
      notes: input.notes,
      priceTierId: menu.tier.id,
      priceTierName: menu.tier.name,
      totalCents,
      ...planned,
      defaultDriverId: company.defaultDriverId,
      lines,
    };
  }
}

export function formatAddress(a: { label: string; line1: string; line2: string; city: string; postalCode: string }) {
  return [a.label, a.line1, a.line2, `${a.city} ${a.postalCode}`].filter(Boolean).join(', ');
}

function groupRules(dish: MenuDish): GroupRule[] {
  return dish.groups.map((g) => ({
    id: g.id,
    name: g.name,
    required: g.required,
    usesPortions: g.usesPortions,
    optionIds: g.options.map((o) => o.id),
    portionExtras: new Map(g.portions.map((p) => [p.portionSizeId, p.extraCents])),
  }));
}

function priceCombo(dish: MenuDish, stationId: string | null, c: CombinationInput): BuiltCombination {
  const groups = new Map(dish.groups.map((g) => [g.id, g]));
  // Present choices in the dish's group order so labels read the same everywhere.
  const ordered = [...c.choices].sort(
    (a, b) => dish.groups.findIndex((g) => g.id === a.groupId) - dish.groups.findIndex((g) => g.id === b.groupId),
  );
  const choices = ordered.map((ch) => {
    const g = groups.get(ch.groupId)!;
    const o = g.options.find((x) => x.id === ch.optionId)!;
    const p = ch.portionSizeId ? g.portions.find((x) => x.portionSizeId === ch.portionSizeId)! : null;
    return {
      groupId: g.id, groupName: g.name, optionId: o.id, optionName: o.name,
      portionSizeId: p?.portionSizeId ?? null, portionName: p?.name ?? null,
      optionCents: o.priceCents, portionExtraCents: p?.extraCents ?? 0,
    };
  });
  const { unitCents, totalCents } = priceCombination(
    dish.priceCents,
    choices.map((x) => x.optionCents + x.portionExtraCents),
    c.quantity,
  );
  return {
    quantity: c.quantity,
    unitCents,
    totalCents,
    signature: combinationSignature(c.choices),
    label: choices.map((x) => (x.portionName ? `${x.optionName} (${x.portionName})` : x.optionName)).join(', ') || 'As listed',
    stationId,
    choices,
  };
}
