import type { Tx } from '../common/prisma.service';
import type { AuthUser } from '../auth/auth.types';

export async function logEvent(tx: Tx, orderId: string, type: string, message: string, actor?: AuthUser | null) {
  await tx.orderEvent.create({ data: { orderId, type, message, actorId: actor?.id, actorName: actor?.name ?? 'System' } });
}

export async function logEvents(tx: Tx, orderIds: string[], type: string, message: string, actor?: AuthUser | null) {
  if (!orderIds.length) return;
  await tx.orderEvent.createMany({
    data: orderIds.map((orderId) => ({ orderId, type, message, actorId: actor?.id, actorName: actor?.name ?? 'System' })),
  });
}
