'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { Suspense, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, post } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { day, hhmm, time } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, Chip, Empty, ErrorText, Field, Input, Loading, Num, PageHeader, Table, Td, Th, Tr, URGENCY } from '@/components/ui';

interface Unit {
  id: string; quantity: number; dishName: string; temperature: 'HOT' | 'COLD'; label: string; stationId: string;
  startedAt: string | null; doneAt: string | null; urgency: string;
  order: { id: string; number: number; status: string; company: string; employee: string; deliveryTimeMin: number; plannedKitchenReadyAt: string };
}
interface Board {
  date: string; units: Unit[];
  stations: { id: string; name: string; units: number; notStarted: number; inProgress: number; done: number; late: number; atRisk: number }[];
  batches: { dishName: string; label: string; stationId: string; quantity: number; remaining: number; earliestDue: string }[];
}

function KitchenBoard() {
  const { clock, can } = useSession();
  const tz = clock.timeZone;
  const router = useRouter();
  const params = useSearchParams();
  const date = params.get('date') ?? clock.today;
  const station = params.get('station') ?? '';
  const [view, setView] = useState<'orders' | 'batches'>('orders');
  const [hideDone, setHideDone] = useState(true);
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v);
    else next.delete(k);
    router.replace(`/kitchen?${next}`);
  };

  const q = useQuery({ queryKey: ['kitchen', date], queryFn: () => api<Board>('/kitchen/board', { query: { date } }), refetchInterval: 15_000 });
  const act = useAction(({ id, what }: { id: string; what: 'start' | 'done' }) => post(`/kitchen/units/${id}/${what}`), { invalidate: [['kitchen', date]] });
  const canWork = can('kitchen.work');

  const orders = useMemo(() => {
    const units = (q.data?.units ?? []).filter((u) => (!station || u.stationId === station) && (!hideDone || !u.doneAt));
    const by = new Map<string, Unit[]>();
    for (const u of units) by.set(u.order.id, [...(by.get(u.order.id) ?? []), u]);
    return [...by.values()];
  }, [q.data, station, hideDone]);

  if (!q.data) return <Loading />;
  const stationName = new Map(q.data.stations.map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader title={`Kitchen board, ${day(date)}`}>
        <Field label="Delivery date"><Input type="date" value={date} onChange={(e) => set('date', e.target.value)} /></Field>
      </PageHeader>

      <div className="mb-5 flex flex-wrap gap-2">
        <StationTab active={!station} onClick={() => set('station', '')} label="All stations" count={q.data.stations.reduce((a, s) => a + s.notStarted + s.inProgress, 0)} />
        {q.data.stations.filter((s) => s.units > 0).map((s) => (
          <StationTab key={s.id} active={station === s.id} onClick={() => set('station', s.id)} label={s.name} count={s.notStarted + s.inProgress} late={s.late} />
        ))}
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-4 text-sm">
        <div className="flex rounded-md bg-stone-100 p-0.5">
          {(['orders', 'batches'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={clsx('rounded px-3 py-1', view === v ? 'bg-white font-medium shadow-sm' : 'text-stone-600')}>{v === 'orders' ? 'By order' : 'Batched'}</button>
          ))}
        </div>
        {view === 'orders' && <label className="flex items-center gap-2"><input type="checkbox" className="accent-emerald-800" checked={hideDone} onChange={(e) => setHideDone(e.target.checked)} /> Hide finished units</label>}
        {!canWork && <span className="text-stone-500">Read only</span>}
      </div>
      <div className="mb-4"><ErrorText>{act.error}</ErrorText></div>

      {view === 'batches' ? (
        <Table>
          <thead><Tr><Th>Dish</Th><Th>Combination</Th><Th>Station</Th><Th className="text-right">Total</Th><Th className="text-right">Left</Th><Th className="text-right">First due</Th></Tr></thead>
          <tbody>
            {q.data.batches.filter((b) => !station || b.stationId === station).map((b) => (
              <Tr key={`${b.stationId}${b.dishName}${b.label}`} className={b.remaining === 0 ? 'text-stone-400' : ''}>
                <Td className="font-medium">{b.dishName}</Td><Td>{b.label}</Td><Td>{stationName.get(b.stationId)}</Td>
                <Td className="text-right"><Num>{b.quantity}</Num></Td><Td className="text-right"><Num>{b.remaining}</Num></Td><Td className="text-right"><Num>{time(b.earliestDue, tz)}</Num></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      ) : orders.length === 0 ? (
        <Empty>{q.data.units.length ? 'Everything here is done.' : 'No confirmed orders for this date. Orders appear after cut-off confirms them.'}</Empty>
      ) : (
        <div className="flex flex-col gap-6">
          {orders.map((units) => {
            const o = units[0].order;
            const u = URGENCY[units.some((x) => x.urgency === 'LATE') ? 'LATE' : units.some((x) => x.urgency === 'AT_RISK') ? 'AT_RISK' : units.every((x) => x.doneAt) ? 'DONE' : 'ON_TRACK'];
            return (
              <div key={o.id}>
                <div className="mb-1 flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
                  <Link href={`/orders/${o.id}`} className="font-semibold hover:underline">#{o.number}</Link>
                  <span>{o.company}</span>
                  <span className="text-stone-500">{o.employee}</span>
                  <span className="text-stone-500">ready by <Num className="font-medium text-stone-900">{time(o.plannedKitchenReadyAt, tz)}</Num>, delivery {hhmm(o.deliveryTimeMin)}</span>
                  {u.label !== 'On track' && <Chip tone={u.tone}>{u.label}</Chip>}
                </div>
                <Table>
                  <tbody>
                    {units.map((x) => (
                      <Tr key={x.id}>
                        <Td className="w-12 text-right text-base font-semibold"><Num>{x.quantity}×</Num></Td>
                        <Td><div className="font-medium">{x.dishName}</div><div className="text-xs text-stone-500">{x.label}</div></Td>
                        <Td className="w-32 text-stone-600">{stationName.get(x.stationId)}</Td>
                        <Td className="w-24">{x.temperature === 'COLD' ? <Chip tone="blue">Cold</Chip> : <Chip tone="amber">Hot</Chip>}</Td>
                        <Td className="w-40 text-xs text-stone-500">{x.doneAt ? `Done ${time(x.doneAt, tz)}` : x.startedAt ? `Started ${time(x.startedAt, tz)}` : ''}</Td>
                        <Td className="w-44 text-right">
                          {canWork && o.status === 'CONFIRMED' && !x.doneAt && (
                            <div className="flex justify-end gap-2">
                              {!x.startedAt && <Button disabled={act.isPending} onClick={() => act.run({ id: x.id, what: 'start' })}>Start</Button>}
                              <Button variant="primary" disabled={act.isPending} onClick={() => act.run({ id: x.id, what: 'done' })}>Done</Button>
                            </div>
                          )}
                        </Td>
                      </Tr>
                    ))}
                  </tbody>
                </Table>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}

function StationTab({ active, onClick, label, count, late }: { active: boolean; onClick: () => void; label: string; count: number; late?: number }) {
  return (
    <button onClick={onClick} className={clsx('flex h-9 items-center gap-2 rounded-md px-3 text-sm', active ? 'bg-emerald-800 text-white' : 'bg-stone-100 text-stone-800 hover:bg-stone-200')}>
      {label} <Num className="opacity-70">{count}</Num>
      {late ? <span className="rounded bg-red-600 px-1.5 text-xs text-white">{late} late</span> : null}
    </button>
  );
}

export default function KitchenPage() {
  return <Suspense><KitchenBoard /></Suspense>;
}
