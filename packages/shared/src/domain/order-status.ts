export const ORDER_STATUSES = ['DRAFT', 'PLACED', 'CONFIRMED', 'DELIVERED', 'CANCELLED', 'REJECTED'] as const;
export type OrderStatus = (typeof ORDER_STATUSES)[number];

/** Statuses that count as owed by the company. */
export const BILLABLE_STATUSES: readonly OrderStatus[] = ['CONFIRMED', 'DELIVERED'];
/** Statuses editable and cancellable before cut-off. */
export const EDITABLE_STATUSES: readonly OrderStatus[] = ['DRAFT', 'PLACED'];

export const DISPATCH_STAGES = ['KITCHEN_READY', 'DISPATCH_READY', 'OUT_FOR_DELIVERY', 'DELIVERED'] as const;
export type DispatchStage = (typeof DISPATCH_STAGES)[number];
