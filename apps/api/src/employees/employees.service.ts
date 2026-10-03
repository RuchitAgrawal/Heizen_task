import { Injectable } from '@nestjs/common';
import { CsvImportResult, EmployeeInput, Page, employeeSchema } from '@fernleaf/shared';
import { PrismaService, Tx } from '../common/prisma.service';
import { invalid, notFound } from '../common/errors';
import { parseCsv } from './csv';

const TRUE = new Set(['yes', 'y', 'true', '1']);

@Injectable()
export class EmployeesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { page: number; pageSize: number; q?: string; companyId?: string }): Promise<Page<unknown>> {
    const where = {
      ...(params.companyId ? { companyId: params.companyId } : {}),
      ...(params.q
        ? { OR: [{ name: { contains: params.q, mode: 'insensitive' as const } }, { email: { contains: params.q, mode: 'insensitive' as const } }] }
        : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.employee.findMany({
        where,
        include: { company: { select: { id: true, name: true } }, allergens: true, dietaryTags: true },
        orderBy: { name: 'asc' },
        skip: (params.page - 1) * params.pageSize,
        take: params.pageSize,
      }),
      this.prisma.employee.count({ where }),
    ]);
    return { items, total, page: params.page, pageSize: params.pageSize };
  }

  async get(id: string) {
    const e = await this.prisma.employee.findUnique({
      where: { id },
      include: { company: { include: { addresses: { where: { active: true } } } }, allergens: true, dietaryTags: true },
    });
    if (!e) throw notFound('Employee');
    return e;
  }

  /** An employee's email must be on one of the company's domains: that is how employees map to companies. */
  private async checkDomain(tx: Tx, companyId: string, email: string) {
    const company = await tx.company.findUnique({ where: { id: companyId }, include: { domains: true } });
    if (!company) throw invalid('Unknown company', { companyId: 'Unknown company' });
    const domain = email.split('@')[1] ?? '';
    if (!company.domains.some((d) => d.domain === domain)) {
      throw invalid(`Email must be on ${company.domains.map((d) => '@' + d.domain).join(' or ')}`, {
        email: `Use a ${company.name} email address`,
      });
    }
  }

  private data(input: EmployeeInput) {
    const { allergenIds, dietaryTagIds, ...rest } = input;
    return { rest, allergenIds, dietaryTagIds };
  }

  create(input: EmployeeInput) {
    return this.prisma.$transaction(async (tx) => {
      await this.checkDomain(tx, input.companyId, input.email);
      const { rest, allergenIds, dietaryTagIds } = this.data(input);
      return tx.employee.create({
        data: {
          ...rest,
          allergens: { connect: allergenIds.map((id) => ({ id })) },
          dietaryTags: { connect: dietaryTagIds.map((id) => ({ id })) },
        },
      });
    });
  }

  /**
   * Moving to another company changes their menu, prices and calendar from the next order on.
   * Past orders keep the company they were placed under (Order.companyId).
   */
  update(id: string, input: EmployeeInput) {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.employee.findUnique({ where: { id }, include: { ownerOf: true } });
      if (!existing) throw notFound('Employee');
      await this.checkDomain(tx, input.companyId, input.email);
      if (existing.ownerOf && existing.companyId !== input.companyId) {
        throw invalid(`${existing.name} owns ${existing.ownerOf.name}. Pick a new owner there first.`, { companyId: 'Owner of current company' });
      }
      const { rest, allergenIds, dietaryTagIds } = this.data(input);
      return tx.employee.update({
        where: { id },
        data: {
          ...rest,
          allergens: { set: allergenIds.map((x) => ({ id: x })) },
          dietaryTags: { set: dietaryTagIds.map((x) => ({ id: x })) },
        },
      });
    });
  }

  /**
   * Columns: name, email, can_choose_address, can_change_time, can_change_packaging, allergens, dietary
   * (allergens and dietary are ";"-separated names). Each row is validated and saved on its own:
   * a bad row is reported and skipped, the rest go in. Existing emails in this company are updated.
   */
  async importCsv(companyId: string, text: string): Promise<CsvImportResult> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) throw notFound('Company');
    const rows = parseCsv(text);
    if (rows.length === 0) throw invalid('The file is empty');
    const header = rows[0].map((h) => h.trim().toLowerCase());
    const col = (name: string) => header.indexOf(name);
    if (col('name') < 0 || col('email') < 0) throw invalid('Header row needs at least "name" and "email" columns');

    const [allergens, tags] = await Promise.all([this.prisma.allergen.findMany(), this.prisma.dietaryTag.findMany()]);
    const byName = (list: { id: string; name: string }[]) => new Map(list.map((x) => [x.name.toLowerCase(), x.id]));
    const allergenIds = byName(allergens);
    const tagIds = byName(tags);

    const result: CsvImportResult = { created: 0, updated: 0, errors: [] };
    const seen = new Set<string>();

    for (let i = 1; i < rows.length; i++) {
      const rowNo = i + 1; // 1-based, counting the header, as a spreadsheet shows it
      const r = rows[i];
      const cell = (name: string) => (col(name) >= 0 ? (r[col(name)] ?? '').trim() : '');
      const names = (name: string, map: Map<string, string>) => {
        const list = cell(name).split(';').map((s) => s.trim()).filter(Boolean);
        const unknown = list.filter((n) => !map.has(n.toLowerCase()));
        if (unknown.length) throw new Error(`Unknown ${name}: ${unknown.join(', ')}`);
        return list.map((n) => map.get(n.toLowerCase())!);
      };
      try {
        const parsed = employeeSchema.safeParse({
          companyId,
          name: cell('name'),
          email: cell('email'),
          canChooseAddress: TRUE.has(cell('can_choose_address').toLowerCase()),
          canChangeDeliveryTime: TRUE.has(cell('can_change_time').toLowerCase()),
          canChangePackaging: TRUE.has(cell('can_change_packaging').toLowerCase()),
          allergenIds: names('allergens', allergenIds),
          dietaryTagIds: names('dietary', tagIds),
        });
        if (!parsed.success) {
          throw new Error(parsed.error.issues.map((x) => `${x.path.join('.')}: ${x.message}`).join('; '));
        }
        const input = parsed.data;
        if (seen.has(input.email)) throw new Error(`${input.email} appears earlier in the file`);
        seen.add(input.email);

        const existing = await this.prisma.employee.findUnique({ where: { email: input.email } });
        if (existing && existing.companyId !== companyId) throw new Error(`${input.email} belongs to another company`);
        if (existing) {
          await this.update(existing.id, input);
          result.updated++;
        } else {
          await this.create(input);
          result.created++;
        }
      } catch (e) {
        const body = (e as { getResponse?: () => { message?: string; fieldErrors?: Record<string, string> } }).getResponse?.();
        const message = body ? [body.message, ...Object.values(body.fieldErrors ?? {})].join(': ') : (e as Error).message;
        result.errors.push({ row: rowNo, message });
      }
    }
    return result;
  }
}
