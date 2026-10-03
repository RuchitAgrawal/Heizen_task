import { Injectable } from '@nestjs/common';
import { CompanyInput, IsoDate } from '@fernleaf/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { conflict, invalid, notFound } from '../common/errors';
import { fromDbDate, toDbDate } from '../common/dates';

@Injectable()
export class CompaniesService {
  constructor(private readonly prisma: PrismaService) {}

  list(q?: string) {
    return this.prisma.company.findMany({
      where: q ? { name: { contains: q, mode: 'insensitive' } } : {},
      orderBy: { name: 'asc' },
      include: {
        domains: true,
        priceTier: { select: { id: true, name: true } },
        owner: { select: { id: true, name: true } },
        _count: { select: { employees: true } },
      },
    });
  }

  async get(id: string) {
    const c = await this.prisma.company.findUnique({
      where: { id },
      include: {
        domains: true,
        addresses: { where: { active: true }, orderBy: [{ isDefault: 'desc' }, { label: 'asc' }] },
        holidays: { orderBy: { date: 'asc' } },
        owner: { select: { id: true, name: true, email: true } },
        priceTier: true,
        defaultDriver: { select: { id: true, name: true } },
        defaultPackagingType: true,
        hiddenCategories: true,
        hiddenDishes: true,
        _count: { select: { employees: true } },
      },
    });
    if (!c) throw notFound('Company');
    return { ...c, holidays: c.holidays.map((h) => ({ id: h.id, date: fromDbDate(h.date), name: h.name })) };
  }

  /** Cross-row rules the schema cannot check on its own. */
  private async check(tx: Tx, id: string | null, input: CompanyInput) {
    const taken = await tx.companyDomain.findMany({
      where: { domain: { in: input.domains }, ...(id ? { companyId: { not: id } } : {}) },
      include: { company: { select: { name: true } } },
    });
    if (taken.length) {
      throw invalid('A domain belongs to another company', {
        domains: taken.map((t) => `${t.domain} is used by ${t.company.name}`).join('; '),
      });
    }
    if (input.ownerEmployeeId) {
      const owner = await tx.employee.findUnique({ where: { id: input.ownerEmployeeId } });
      if (!owner || owner.companyId !== id) {
        throw invalid('The owner must be one of this company’s employees', { ownerEmployeeId: 'Pick an employee of this company' });
      }
    }
    if (input.defaultDriverId) {
      const driver = await tx.staffUser.findFirst({
        where: { id: input.defaultDriverId, active: true, role: { permissions: { has: 'deliveries.own' } } },
      });
      if (!driver) throw invalid('Default driver must be an active driver', { defaultDriverId: 'Not a driver' });
    }
    if (input.addresses.filter((a) => a.isDefault).length > 1) {
      throw invalid('Only one address can be the default', { addresses: 'Pick one default address' });
    }
  }

  private scalars(input: CompanyInput) {
    return {
      name: input.name,
      billingName: input.billingName,
      billingEmail: input.billingEmail,
      billingPhone: input.billingPhone,
      ownerEmployeeId: input.ownerEmployeeId,
      workingDays: [...new Set(input.workingDays)].sort(),
      defaultDeliveryTimeMin: input.defaultDeliveryTimeMin,
      deliveryLeadMin: input.deliveryLeadMin,
      defaultPackagingTypeId: input.defaultPackagingTypeId,
      driverInstructions: input.driverInstructions,
      defaultDriverId: input.defaultDriverId,
      priceTierId: input.priceTierId,
    };
  }

  async create(input: CompanyInput) {
    if (input.ownerEmployeeId) throw invalid('Add employees before choosing an owner', { ownerEmployeeId: 'Set after creating' });
    return this.prisma.$transaction(async (tx) => {
      await this.check(tx, null, input);
      const anyDefault = input.addresses.some((a) => a.isDefault);
      return tx.company.create({
        data: {
          ...this.scalars(input),
          domains: { create: input.domains.map((domain) => ({ domain })) },
          addresses: {
            create: input.addresses.map(({ id: _id, ...a }, i) => ({ ...a, isDefault: anyDefault ? a.isDefault : i === 0 })),
          },
          hiddenCategories: { create: input.hiddenCategoryIds.map((categoryId) => ({ categoryId })) },
          hiddenDishes: { create: input.hiddenDishIds.map((dishId) => ({ dishId })) },
        },
      });
    });
  }

  async update(id: string, input: CompanyInput) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.company.findUnique({ where: { id }, include: { addresses: true } });
      if (!existing) throw notFound('Company');
      await this.check(tx, id, input);

      await tx.companyDomain.deleteMany({ where: { companyId: id, domain: { notIn: input.domains } } });
      for (const domain of input.domains) {
        await tx.companyDomain.upsert({ where: { domain }, create: { domain, companyId: id }, update: {} });
      }

      // Addresses are referenced by orders and drops, so removed ones are deactivated, not deleted.
      const keep = new Set(input.addresses.map((a) => a.id).filter(Boolean));
      await tx.companyAddress.updateMany({
        where: { companyId: id, id: { notIn: [...keep] as string[] } },
        data: { active: false, isDefault: false },
      });
      // Clear defaults first so the one-default index is never violated mid-update.
      await tx.companyAddress.updateMany({ where: { companyId: id }, data: { isDefault: false } });
      const anyDefault = input.addresses.some((a) => a.isDefault);
      for (const [i, { id: addrId, ...a }] of input.addresses.entries()) {
        const data = { ...a, isDefault: anyDefault ? a.isDefault : i === 0, active: true };
        if (addrId) {
          if (!existing.addresses.some((x) => x.id === addrId)) throw invalid('Unknown address', { addresses: 'Unknown address' });
          await tx.companyAddress.update({ where: { id: addrId }, data });
        } else {
          await tx.companyAddress.create({ data: { ...data, companyId: id } });
        }
      }

      await tx.companyHiddenCategory.deleteMany({ where: { companyId: id } });
      await tx.companyHiddenDish.deleteMany({ where: { companyId: id } });
      await tx.companyHiddenCategory.createMany({ data: input.hiddenCategoryIds.map((categoryId) => ({ companyId: id, categoryId })) });
      await tx.companyHiddenDish.createMany({ data: input.hiddenDishIds.map((dishId) => ({ companyId: id, dishId })) });

      return tx.company.update({ where: { id }, data: this.scalars(input) });
    });
  }

  async addHoliday(companyId: string, date: IsoDate, name: string) {
    if (!(await this.prisma.company.findUnique({ where: { id: companyId } }))) throw notFound('Company');
    const dup = await this.prisma.companyHoliday.findUnique({ where: { companyId_date: { companyId, date: toDbDate(date) } } });
    if (dup) throw conflict('DUPLICATE', `${date} is already a holiday`);
    await this.prisma.companyHoliday.create({ data: { companyId, date: toDbDate(date), name } });
  }

  async removeHoliday(companyId: string, holidayId: string) {
    await this.prisma.companyHoliday.deleteMany({ where: { id: holidayId, companyId } });
  }
}
