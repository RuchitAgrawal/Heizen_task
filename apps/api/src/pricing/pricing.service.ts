import { Injectable } from '@nestjs/common';
import {
  Cents, PriceUpdatesInput, ResolvedPrice, TierDef, TierGridRow, TierInput, resolvePrice, wouldCreateCycle,
} from '@fernleaf/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { conflict, invalid, notFound } from '../common/errors';

type Db = Tx | PrismaService;

/** Effective prices of every dish and option on one tier. null = not sold on this tier. */
export interface PriceBook {
  tierId: string;
  tierName: string;
  dish: Map<string, ResolvedPrice>;
  option: Map<string, ResolvedPrice>;
}

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}

  private async tierMap(db: Db): Promise<Map<string, TierDef & { name: string; isDefault: boolean }>> {
    const tiers = await db.priceTier.findMany();
    return new Map(tiers.map((t) => [t.id, t]));
  }

  async defaultTier(db: Db = this.prisma) {
    const t = await db.priceTier.findFirst({ where: { isDefault: true } });
    if (!t) throw conflict('NO_DEFAULT_TIER', 'No default price tier is set');
    return t;
  }

  /** Company tier, else default. */
  async tierForCompany(companyTierId: string | null, db: Db = this.prisma) {
    if (companyTierId) {
      const t = await db.priceTier.findUnique({ where: { id: companyTierId } });
      if (t) return { tier: t, isCompanyTier: true };
    }
    return { tier: await this.defaultTier(db), isCompanyTier: false };
  }

  /**
   * Resolves the whole catalogue on one tier in three queries. The catalogue is small
   * (tens to low hundreds of items), so this is cheaper than per-item lookups and keeps
   * menu and order pricing on exactly the same code path.
   */
  async priceBook(tierId: string, db: Db = this.prisma): Promise<PriceBook> {
    const [tiers, dishes, options, dishPrices, optionPrices] = await Promise.all([
      this.tierMap(db),
      db.dish.findMany({ select: { id: true, costCents: true } }),
      db.option.findMany({ select: { id: true, costCents: true } }),
      db.dishPrice.findMany(),
      db.optionPrice.findMany(),
    ]);
    const tier = tiers.get(tierId);
    if (!tier) throw notFound('Price tier');

    const group = <T extends { tierId: string; cents: number }>(rows: T[], key: (r: T) => string) => {
      const m = new Map<string, Map<string, Cents>>();
      for (const r of rows) {
        const k = key(r);
        if (!m.has(k)) m.set(k, new Map());
        m.get(k)!.set(r.tierId, r.cents);
      }
      return m;
    };
    const dp = group(dishPrices, (r) => r.dishId);
    const op = group(optionPrices, (r) => r.optionId);
    const empty = new Map<string, Cents>();

    return {
      tierId,
      tierName: tier.name,
      dish: new Map(dishes.map((d) => [d.id, resolvePrice(tierId, tiers, d.costCents, dp.get(d.id) ?? empty)])),
      option: new Map(options.map((o) => [o.id, resolvePrice(tierId, tiers, o.costCents, op.get(o.id) ?? empty)])),
    };
  }

  async listTiers() {
    const tiers = await this.prisma.priceTier.findMany({
      orderBy: [{ isDefault: 'desc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { baseTier: { select: { id: true, name: true } }, _count: { select: { companies: true } } },
    });
    const activeDishes = await this.prisma.dish.findMany({ where: { active: true }, select: { id: true } });
    // Missing-price count per tier, so gaps are visible from the tier list.
    return Promise.all(
      tiers.map(async (t) => {
        const book = await this.priceBook(t.id);
        const missing = activeDishes.filter((d) => book.dish.get(d.id)?.cents == null).length;
        return { ...t, missingDishPrices: missing };
      }),
    );
  }

  private async checkTier(id: string | null, input: TierInput, db: Db) {
    if (input.rule !== 'TIER_MARKUP') return;
    const tiers = await this.tierMap(db);
    if (!tiers.has(input.baseTierId!)) throw invalid('Unknown base tier', { baseTierId: 'Unknown tier' });
    if (id && wouldCreateCycle(id, input.baseTierId!, tiers)) {
      throw invalid('Tiers cannot derive from each other in a loop', { baseTierId: 'This would create a loop' });
    }
  }

  private tierData(input: TierInput) {
    return {
      name: input.name,
      rule: input.rule,
      multiplierBp: input.rule === 'MANUAL' ? null : input.multiplierBp,
      baseTierId: input.rule === 'TIER_MARKUP' ? input.baseTierId : null,
    };
  }

  async createTier(input: TierInput) {
    await this.checkTier(null, input, this.prisma);
    const hasDefault = await this.prisma.priceTier.count({ where: { isDefault: true } });
    return this.prisma.priceTier.create({ data: { ...this.tierData(input), isDefault: hasDefault === 0 } });
  }

  async updateTier(id: string, input: TierInput) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.priceTier.findUnique({ where: { id } }))) throw notFound('Price tier');
      await this.checkTier(id, input, tx);
      return tx.priceTier.update({ where: { id }, data: this.tierData(input) });
    });
  }

  async setDefault(id: string) {
    return this.prisma.$transaction(async (tx) => {
      if (!(await tx.priceTier.findUnique({ where: { id } }))) throw notFound('Price tier');
      await tx.priceTier.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      return tx.priceTier.update({ where: { id }, data: { isDefault: true } });
    });
  }

  async grid(tierId: string): Promise<{ tier: { id: string; name: string }; rows: TierGridRow[] }> {
    const [book, dishes, options, dishPrices, optionPrices] = await Promise.all([
      this.priceBook(tierId),
      this.prisma.dish.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      this.prisma.option.findMany({ orderBy: [{ active: 'desc' }, { name: 'asc' }] }),
      this.prisma.dishPrice.findMany({ where: { tierId } }),
      this.prisma.optionPrice.findMany({ where: { tierId } }),
    ]);
    const storedD = new Map(dishPrices.map((p) => [p.dishId, p.cents]));
    const storedO = new Map(optionPrices.map((p) => [p.optionId, p.cents]));
    const rows: TierGridRow[] = [
      ...dishes.map((d) => {
        const r = book.dish.get(d.id)!;
        return { kind: 'dish' as const, itemId: d.id, name: d.name, sku: d.sku, active: d.active, costCents: d.costCents, storedCents: storedD.get(d.id) ?? null, effectiveCents: r.cents, source: r.source };
      }),
      ...options.map((o) => {
        const r = book.option.get(o.id)!;
        return { kind: 'option' as const, itemId: o.id, name: o.name, sku: null, active: o.active, costCents: o.costCents, storedCents: storedO.get(o.id) ?? null, effectiveCents: r.cents, source: r.source };
      }),
    ];
    return { tier: { id: tierId, name: book.tierName }, rows };
  }

  /** Bulk edit. Only future orders see the change: orders store their own prices. */
  async updatePrices(tierId: string, input: PriceUpdatesInput) {
    await this.prisma.$transaction(async (tx) => {
      if (!(await tx.priceTier.findUnique({ where: { id: tierId } }))) throw notFound('Price tier');
      for (const u of input.updates) {
        if (u.kind === 'dish') {
          const where = { tierId_dishId: { tierId, dishId: u.itemId } };
          if (u.cents === null) await tx.dishPrice.deleteMany({ where: { tierId, dishId: u.itemId } });
          else await tx.dishPrice.upsert({ where, create: { tierId, dishId: u.itemId, cents: u.cents }, update: { cents: u.cents } });
        } else {
          const where = { tierId_optionId: { tierId, optionId: u.itemId } };
          if (u.cents === null) await tx.optionPrice.deleteMany({ where: { tierId, optionId: u.itemId } });
          else await tx.optionPrice.upsert({ where, create: { tierId, optionId: u.itemId, cents: u.cents }, update: { cents: u.cents } });
        }
      }
    });
    return this.grid(tierId);
  }
}
