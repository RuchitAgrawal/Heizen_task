/** Response shapes the web reads. Request shapes come from @fernleaf/shared zod schemas. */
export interface Named { id: string; name: string }

export interface OrderRow {
  id: string; number: number; status: string; deliveryDate: string; deliveryTimeMin: number; totalCents: number;
  employee: Named; company: Named; invoice: { id: string; number: number; status: string } | null; _count: { lines: number };
}

export interface OrderDetail {
  id: string; number: number; status: string; version: number; deliveryDate: string; deliveryTimeMin: number;
  addressId: string; addressText: string; packagingTypeId: string; packagingName: string; notes: string;
  priceTierName: string; totalCents: number; cutoffAt: string;
  deliveryAt: string; plannedKitchenReadyAt: string; plannedDispatchReadyAt: string;
  placedAt: string | null; confirmedAt: string | null; kitchenStartedAt: string | null; kitchenReadyAt: string | null;
  dispatchReadyAt: string | null; outForDeliveryAt: string | null; deliveredAt: string | null; onTime: boolean | null;
  invoicedCents: number | null;
  employee: Named & { email: string };
  company: Named & { deliveryLeadMin: number };
  lines: {
    id: string; dishId: string; dishName: string; dishSku: string; stationName: string | null; dishPriceCents: number; quantity: number; totalCents: number;
    combinations: { id: string; quantity: number; unitCents: number; totalCents: number; label: string; startedAt: string | null; doneAt: string | null;
      choices: { groupId: string; groupName: string; optionId: string; optionName: string; portionSizeId: string | null; portionName: string | null; optionCents: number; portionExtraCents: number }[] }[];
  }[];
  events: { id: string; type: string; message: string; actorName: string | null; at: string }[];
  drop: { id: string; driver: Named | null; deliveredAt: string | null; deliveryNote: string; onTime: boolean | null } | null;
  invoice: { id: string; number: number; status: string } | null;
  adjustments: { id: string; amountCents: number; reason: string; invoiceId: string | null; createdAt: string }[];
  allowed: { edit: boolean; cancel: boolean; reject: boolean; override: boolean; forceComplete: boolean; adjust: boolean };
}

export interface CompanyDetail {
  id: string; name: string; billingName: string; billingEmail: string; billingPhone: string;
  ownerEmployeeId: string | null; workingDays: number[]; defaultDeliveryTimeMin: number; deliveryLeadMin: number;
  defaultPackagingTypeId: string; driverInstructions: string; defaultDriverId: string | null; priceTierId: string | null;
  domains: { id: string; domain: string }[];
  addresses: { id: string; label: string; line1: string; line2: string; city: string; postalCode: string; isDefault: boolean }[];
  holidays: { id: string; date: string; name: string }[];
  hiddenCategories: { categoryId: string }[];
  hiddenDishes: { dishId: string }[];
  owner: (Named & { email: string }) | null;
  _count: { employees: number };
}

export interface Reference {
  allergens: RefItem[]; 'dietary-tags': RefItem[]; stations: RefItem[]; 'portion-sizes': RefItem[]; 'packaging-types': RefItem[];
}
export interface RefItem { id: string; name: string; sortOrder: number; active: boolean }
