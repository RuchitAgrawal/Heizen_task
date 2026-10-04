/**
 * Resets the database to the demo state: base data here, then demo orders around today
 * via DemoService (the same code the API runs on boot and nightly).
 * Run: pnpm --filter api db:seed. Destroys existing data.
 */
import 'reflect-metadata';
import { PrismaClient } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { NestFactory } from '@nestjs/core';
import { ROLE_PRESETS, parseHhMm } from '@fernleaf/shared';
import { ALLERGENS, CATEGORIES, COMPANIES, DIETARY, DISHES, OPTIONS, PACKAGING, PORTIONS, STATIONS } from './seed-data';

const prisma = new PrismaClient();

async function reset() {
  // This truncates every table. Refuse anything but a local database unless told explicitly.
  const host = new URL(process.env.DATABASE_URL ?? '').hostname;
  if (!['localhost', '127.0.0.1'].includes(host) && process.env.SEED_ALLOW_REMOTE !== 'true') {
    throw new Error(`Refusing to reset ${host}. Set SEED_ALLOW_REMOTE=true to seed a remote database.`);
  }
  const tables = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'`;
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map((t) => `"${t.tablename}"`).join(', ')} RESTART IDENTITY CASCADE`);
}

const slugEmail = (name: string, domain: string) => `${name.toLowerCase().replace(/[^a-z ]/g, '').trim().replace(/\s+/g, '.')}@${domain}`;

async function main() {
  await reset();

  // Roles and staff. The four review accounts use exactly the credentials in the brief.
  const roles: Record<string, string> = {};
  for (const [key, preset] of Object.entries(ROLE_PRESETS)) {
    roles[key] = (await prisma.role.create({ data: { key, name: preset.label, permissions: preset.permissions } })).id;
  }
  const hash = await bcrypt.hash('Test@1234', 10);
  const staff = [
    { email: 'admin@test.com', name: 'Asha Admin', role: 'admin' },
    { email: 'kitchen@test.com', name: 'Kiran Kitchen', role: 'kitchen' },
    { email: 'dispatch@test.com', name: 'Dev Dispatch', role: 'dispatch' },
    { email: 'driver@test.com', name: 'Dana Driver', role: 'driver' },
    { email: 'marco.driver@fernleaf.kitchen', name: 'Marco Silva', role: 'driver' },
    { email: 'lena.kitchen@fernleaf.kitchen', name: 'Lena Hoffmann', role: 'kitchen' },
  ];
  const staffIds: Record<string, string> = {};
  for (const s of staff) {
    staffIds[s.email] = (await prisma.staffUser.create({ data: { email: s.email, name: s.name, passwordHash: hash, roleId: roles[s.role] } })).id;
  }

  // Reference data
  const ids = async <T extends { id: string; name: string }>(names: string[], create: (name: string, i: number) => Promise<T>) =>
    Object.fromEntries(await Promise.all(names.map(async (n, i) => [n, (await create(n, i)).id] as const)));
  const allergen = await ids(ALLERGENS, (name, i) => prisma.allergen.create({ data: { name, sortOrder: i } }));
  const dietary = await ids(DIETARY, (name, i) => prisma.dietaryTag.create({ data: { name, sortOrder: i } }));
  const station = await ids(STATIONS, (name, i) => prisma.kitchenStation.create({ data: { name, sortOrder: i } }));
  const portion = await ids(PORTIONS, (name, i) => prisma.portionSize.create({ data: { name, sortOrder: i } }));
  const packaging = await ids(PACKAGING, (name, i) => prisma.packagingType.create({ data: { name, sortOrder: i } }));
  const connect = (names: string[] | undefined, map: Record<string, string>) => ({ connect: (names ?? []).map((n) => ({ id: map[n] })) });

  // Tiers: Standard is typed in; Enterprise is Standard − 8%; Partner is cost × 2.6
  const standard = await prisma.priceTier.create({ data: { name: 'Standard', isDefault: true, rule: 'MANUAL', sortOrder: 0 } });
  const enterprise = await prisma.priceTier.create({ data: { name: 'Enterprise', rule: 'TIER_MARKUP', multiplierBp: 9_200, baseTierId: standard.id, sortOrder: 1 } });
  const partner = await prisma.priceTier.create({ data: { name: 'Partner', rule: 'COST_MULTIPLIER', multiplierBp: 26_000, sortOrder: 2 } });

  // Options
  const option: Record<string, string> = {};
  for (const o of OPTIONS) {
    const row = await prisma.option.create({
      data: {
        name: o.name,
        costCents: o.cost,
        allergens: connect(o.allergens, allergen),
        dietaryTags: connect(o.dietary, dietary),
        portionSizes: o.portions ? { connect: PORTIONS.map((p) => ({ id: portion[p] })) } : undefined,
        prices: {
          create: [
            { tierId: standard.id, cents: o.price },
            // Choices that are free on Standard stay free for partners instead of cost × 2.6.
            ...(o.price === 0 ? [{ tierId: partner.id, cents: 0 }] : []),
          ],
        },
      },
    });
    option[o.name] = row.id;
  }

  // Dishes, groups, menu
  const category: Record<string, string> = {};
  for (const [i, c] of CATEGORIES.entries()) {
    category[c.slug] = (await prisma.category.create({ data: { ...c, sortOrder: i } })).id;
  }
  const dish: Record<string, string> = {};
  const catOrder: Record<string, number> = {};
  for (const d of DISHES) {
    const row = await prisma.dish.create({
      data: {
        sku: d.sku,
        name: d.name,
        description: d.description,
        temperature: d.temp,
        costCents: d.cost,
        stationId: d.station ? station[d.station] : null,
        minOrderQty: d.minQty ?? null,
        active: d.active ?? true,
        allergens: connect(d.allergens, allergen),
        dietaryTags: connect(d.dietary, dietary),
        prices: d.price === null ? undefined : { create: [{ tierId: standard.id, cents: d.price }] },
        groups: {
          create: (d.groups ?? []).map((g, gi) => ({
            name: g.name,
            required: g.required,
            sortOrder: gi,
            usesPortions: !!g.portions,
            items: { create: g.options.map((o, oi) => ({ optionId: option[o], sortOrder: oi })) },
            portions: g.portions
              ? { create: Object.entries(g.portions).map(([size, extraCents]) => ({ portionSizeId: portion[size], extraCents })) }
              : undefined,
          })),
        },
      },
    });
    dish[d.sku] = row.id;
    for (const slug of d.categories) {
      catOrder[slug] = (catOrder[slug] ?? 0) + 1;
      await prisma.categoryItem.create({ data: { categoryId: category[slug], dishId: row.id, sortOrder: catOrder[slug] } });
    }
  }
  // A staff override on a derived tier: the thali is rounder on Enterprise.
  await prisma.dishPrice.create({ data: { tierId: enterprise.id, dishId: dish['1006'], cents: 1450 } });

  // Companies and employees
  const tierId = { Standard: standard.id, Enterprise: enterprise.id, Partner: partner.id };
  for (const [ci, c] of COMPANIES.entries()) {
    const company = await prisma.company.create({
      data: {
        name: c.name,
        billingName: `${c.people[0]} (Finance)`,
        billingEmail: `accounts@${c.domains[0]}`,
        billingPhone: `+1 212 555 01${String(ci).padStart(2, '0')}`,
        workingDays: c.workingDays,
        defaultDeliveryTimeMin: parseHhMm(c.time)!,
        deliveryLeadMin: c.lead,
        defaultPackagingTypeId: packaging[PACKAGING[ci % PACKAGING.length]],
        driverInstructions: c.instructions,
        defaultDriverId: ci === 2 ? staffIds['marco.driver@fernleaf.kitchen'] : staffIds['driver@test.com'],
        priceTierId: c.tier ? tierId[c.tier] : null,
        domains: { create: c.domains.map((domain) => ({ domain })) },
        addresses: { create: c.addresses.map((a, i) => ({ ...a, isDefault: i === 0 })) },
        hiddenCategories: { create: (c.hiddenCategories ?? []).map((s) => ({ categoryId: category[s] })) },
        hiddenDishes: { create: (c.hiddenDishes ?? []).map((s) => ({ dishId: dish[s] })) },
      },
    });
    const employees = [];
    for (const [pi, name] of c.people.entries()) {
      employees.push(
        await prisma.employee.create({
          data: {
            companyId: company.id,
            name,
            email: slugEmail(name, c.domains[0]),
            canChooseAddress: c.addresses.length > 1 && pi % 3 === 0,
            canChangeDeliveryTime: pi % 4 === 0,
            canChangePackaging: pi % 5 === 0,
            allergens: connect(pi % 6 === 1 ? ['Nuts'] : pi % 6 === 3 ? ['Dairy'] : pi % 7 === 2 ? ['Gluten'] : [], allergen),
            dietaryTags: connect(pi % 4 === 1 ? ['Vegan'] : pi % 5 === 2 ? ['Jain'] : pi % 3 === 2 ? ['Vegetarian'] : [], dietary),
          },
        }),
      );
    }
    await prisma.company.update({ where: { id: company.id }, data: { ownerEmployeeId: employees[0].id } });
  }

  // Settings: New York kitchen open 7 days, cut-off 2 working days before at 16:00
  // Seven days so the demo has deliveries on any review day; weekends are lighter because
  // only Kestrel (Mon-Sat) and Copperleaf (Wed-Sun) take weekend deliveries.
  await prisma.kitchenSettings.upsert({ where: { id: 1 }, update: { workingDays: [1, 2, 3, 4, 5, 6, 7] }, create: { id: 1, workingDays: [1, 2, 3, 4, 5, 6, 7] } });
  const holidays = [
    ['2026-11-26', 'Thanksgiving'],
    ['2026-12-25', 'Christmas Day'],
    ['2027-01-01', 'New Year’s Day'],
  ];
  for (const [date, name] of holidays) await prisma.kitchenHoliday.create({ data: { date: new Date(`${date}T00:00:00Z`), name } });

  await prisma.$disconnect();
  if (process.env.SEED_ORDERS === 'false') return;

  // Demo orders through the real order code
  process.env.DEMO_SKIP_BOOT = 'true';
  const { AppModule } = await import('../src/app.module');
  const { DemoService } = await import('../src/demo/demo.service');
  const app = await NestFactory.createApplicationContext(AppModule, { logger: ['error', 'warn', 'log'] });
  const summary = await app.get(DemoService).ensure();
  console.log('Demo orders:', summary);
  await app.close();
}

main().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
  process.exit(1);
});
