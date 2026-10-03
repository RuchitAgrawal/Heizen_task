import type { PrismaService } from '../src/common/prisma.service';

/** Looks up seed rows by their human names so tests read like the business. */
export async function fixtures(prisma: PrismaService) {
  const dish = async (sku: string) => {
    const d = await prisma.dish.findUniqueOrThrow({
      where: { sku },
      include: { groups: { include: { items: { include: { option: true } }, portions: { include: { portionSize: true } } } } },
    });
    const group = (name: string) => {
      const g = d.groups.find((x) => x.name === name);
      if (!g) throw new Error(`No group ${name} on ${d.name}`);
      const option = (n: string) => g.items.find((i) => i.option.name === n)!.optionId;
      const portion = (n: string) => g.portions.find((p) => p.portionSize.name === n)!.portionSizeId;
      return { id: g.id, option, portion };
    };
    return { id: d.id, group };
  };
  const employee = (where: { company: string; canChangeDeliveryTime?: boolean }) =>
    prisma.employee.findFirstOrThrow({
      where: {
        company: { name: where.company },
        ...(where.canChangeDeliveryTime !== undefined ? { canChangeDeliveryTime: where.canChangeDeliveryTime } : {}),
        ownerOf: null,
      },
      orderBy: { email: 'asc' },
    });
  return { dish, employee };
}

/** Pulls the API error body out of a thrown AppError. */
export async function apiError(p: Promise<unknown>) {
  try {
    await p;
  } catch (e) {
    return (e as { getResponse: () => { code: string; message: string; fieldErrors?: Record<string, string> } }).getResponse();
  }
  throw new Error('Expected the call to fail');
}
