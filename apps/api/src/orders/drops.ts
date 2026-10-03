import type { Tx } from '../common/prisma.service';
import { toDbDate } from '../common/dates';

/**
 * Finds or creates the drop for (date, company, address, time). A new drop starts with the
 * company's default driver. Orders whose time or address changes are re-linked here, which
 * moves them to the right drop automatically.
 */
export async function linkDrop(
  tx: Tx,
  key: { deliveryDate: string; companyId: string; addressId: string; deliveryTimeMin: number },
  defaultDriverId: string | null,
): Promise<string> {
  // Pick the key fields explicitly: callers pass whole orders.
  const k = {
    deliveryDate: toDbDate(key.deliveryDate),
    companyId: key.companyId,
    addressId: key.addressId,
    deliveryTimeMin: key.deliveryTimeMin,
  };
  const drop = await tx.drop.upsert({
    where: { deliveryDate_companyId_addressId_deliveryTimeMin: k },
    create: { ...k, driverId: defaultDriverId },
    update: {},
  });
  return drop.id;
}
