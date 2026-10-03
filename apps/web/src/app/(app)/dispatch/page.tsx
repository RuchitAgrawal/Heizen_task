'use client';

import Link from 'next/link';
import { Fragment, Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, post } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { day, time } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { DropBoard } from '@/lib/drops';
import { Button, Chip, Empty, ErrorText, Field, Input, Loading, Num, PageHeader, Select, Table, Td, Th, Tr, URGENCY } from '@/components/ui';
import { STAGE_LABEL, STAGE_TONE } from '@/components/stages';

function DispatchBoard() {
  const { clock, can } = useSession();
  const tz = clock.timeZone;
  const router = useRouter();
  const params = useSearchParams();
  const date = params.get('date') ?? clock.today;
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({ queryKey: ['dispatch', date], queryFn: () => api<DropBoard>('/dispatch/board', { query: { date } }), refetchInterval: 15_000 });
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: () => api<{ id: string; name: string }[]>('/staff/drivers') });
  const act = useAction((fn: () => Promise<unknown>) => fn(), { invalidate: [['dispatch', date]] });
  const canWork = can('dispatch.work');

  if (!q.data) return <Loading />;
  return (
    <>
      <PageHeader title={`Dispatch, ${day(date)}`}>
        <Field label="Delivery date"><Input type="date" value={date} onChange={(e) => router.replace(`/dispatch?date=${e.target.value}`)} /></Field>
      </PageHeader>
      <p className="mb-4 text-sm text-stone-500">A drop is every order for one company, address and delivery time. It moves as one.</p>
      <div className="mb-4"><ErrorText>{act.error}</ErrorText></div>
      {q.data.drops.length === 0 ? <Empty>No confirmed orders for this date.</Empty> : (
        <Table>
          <thead>
            <Tr><Th>Slot</Th><Th>Company and address</Th><Th className="text-right">Orders</Th><Th className="text-right">Meals</Th><Th>Stage</Th><Th>Leave by</Th><Th>Driver</Th><Th /></Tr>
          </thead>
          <tbody>
            {q.data.drops.map((d) => {
              const u = URGENCY[d.urgency];
              const next =
                d.stage === 'KITCHEN_READY' ? { label: 'Mark dispatch ready', run: () => post(`/dispatch/drops/${d.id}/advance`, { stage: 'DISPATCH_READY' }) }
                : d.stage === 'DISPATCH_READY' ? { label: 'Send out', run: () => post(`/dispatch/drops/${d.id}/advance`, { stage: 'OUT_FOR_DELIVERY' }), needsDriver: true }
                : null;
              return (
                <Fragment key={d.id}>
                  <Tr className="cursor-pointer hover:bg-stone-50" onClick={() => setOpen(open === d.id ? null : d.id)}>
                    <Td className="font-semibold"><Num>{d.deliveryTime}</Num></Td>
                    <Td><div className="font-medium">{d.company.name}</div><div className="text-xs text-stone-500">{d.address.label}, {d.address.line1}</div></Td>
                    <Td className="text-right"><Num>{d.orderCount}</Num></Td>
                    <Td className="text-right"><Num>{d.mealCount}</Num></Td>
                    <Td>
                      <div className="flex flex-wrap gap-1">
                        <Chip tone={STAGE_TONE[d.stage]}>{STAGE_LABEL[d.stage]}</Chip>
                        {(d.urgency === 'LATE' || d.urgency === 'AT_RISK') && <Chip tone={u.tone}>{u.label}</Chip>}
                        {d.stage === 'DELIVERED' && d.onTime === false && <Chip tone="red">Late</Chip>}
                      </div>
                      {(d.stage === 'WAITING' || d.stage === 'COOKING') && <div className="mt-1 text-xs text-stone-500">{d.stageCounts.KITCHEN_READY + d.stageCounts.DISPATCH_READY} of {d.orderCount} ready</div>}
                    </Td>
                    <Td><Num>{d.stage === 'DELIVERED' ? `Delivered ${time(d.deliveredAt, tz)}` : time(d.plannedDispatchReadyAt, tz)}</Num></Td>
                    <Td onClick={(e) => e.stopPropagation()}>
                      {canWork && !['OUT_FOR_DELIVERY', 'DELIVERED'].includes(d.stage) ? (
                        <Select aria-label="Driver" value={d.driver?.id ?? ''} onChange={(e) => act.run(() => post(`/dispatch/drops/${d.id}/driver`, { driverId: e.target.value || null }))} className="w-40">
                          <option value="">No driver</option>
                          {drivers.data?.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}
                        </Select>
                      ) : d.driver?.name ?? <span className="text-amber-700">No driver</span>}
                    </Td>
                    <Td className="text-right" onClick={(e) => e.stopPropagation()}>
                      {canWork && next && (
                        <Button variant="primary" disabled={act.isPending || (next.needsDriver && !d.driver)} title={next.needsDriver && !d.driver ? 'Assign a driver first' : undefined} onClick={() => act.run(next.run)}>{next.label}</Button>
                      )}
                      {canWork && d.stage === 'OUT_FOR_DELIVERY' && (
                        <Button onClick={() => { const note = window.prompt('Record delivery on the driver’s behalf. Note (optional):'); if (note !== null) act.run(() => post(`/dispatch/drops/${d.id}/deliver`, { note, photoDataUrl: null })); }}>Record delivery</Button>
                      )}
                    </Td>
                  </Tr>
                  {open === d.id && (
                    <tr>
                      <td colSpan={8} className="bg-stone-50 px-6 py-3 text-sm">
                        {d.company.driverInstructions && <p className="mb-2"><span className="text-stone-500">Instructions:</span> {d.company.driverInstructions}</p>}
                        {d.deliveryNote && <p className="mb-2"><span className="text-stone-500">Driver note:</span> {d.deliveryNote}</p>}
                        {d.hasPhoto && <a className="mb-2 inline-block text-emerald-800 underline" href={`/api/dispatch/drops/${d.id}/photo`} target="_blank">Delivery photo</a>}
                        <Table>
                          <tbody>
                            {d.orders.map((o) => (
                              <Tr key={o.id}>
                                <Td className="w-20"><Link className="hover:underline" href={`/orders/${o.id}`}>#{o.number}</Link></Td>
                                <Td className="w-48">{o.employee}</Td>
                                <Td>{o.items.map((i) => `${i.quantity}× ${i.dishName} (${i.label})`).join(', ')}</Td>
                                <Td className="w-40">{o.packaging}</Td>
                                <Td className="w-36"><Chip tone={STAGE_TONE[o.stage]}>{STAGE_LABEL[o.stage]}</Chip></Td>
                              </Tr>
                            ))}
                          </tbody>
                        </Table>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </Table>
      )}
    </>
  );
}

export default function DispatchPage() {
  return <Suspense><DispatchBoard /></Suspense>;
}
