export interface Drop {
  id: string; deliveryDate: string; deliveryTime: string; deliveryAt: string | null;
  company: { id: string; name: string; driverInstructions: string };
  address: { label: string; line1: string; line2: string; city: string; postalCode: string };
  driver: { id: string; name: string } | null;
  stage: string; urgency: string; plannedDispatchReadyAt: string | null;
  deliveredAt: string | null; onTime: boolean | null; deliveryNote: string; hasPhoto: boolean;
  orderCount: number; mealCount: number; stageCounts: Record<string, number>;
  orders: { id: string; number: number; employee: string; packaging: string; stage: string; onTime: boolean | null; items: { dishName: string; quantity: number; label: string }[] }[];
}
export interface DropBoard { date: string; now: string; drops: Drop[] }
