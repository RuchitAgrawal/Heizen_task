'use client';

import { use, useState } from 'react';
import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api, post } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { dateTime, day, hhmm, money, time } from '@/lib/format';
import { useTz } from '@/lib/session';
import type { CompanyDetail, OrderDetail, Reference } from '@/lib/types';
import { Button, Chip, ErrorText, Field, Input, LinkButton, Loading, Num, PageHeader, Section, Select, StatusChip, Table, Td, Th, Tr } from '@/components/ui';
import { parseHhMm } from '@fernleaf/shared';

export default function OrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const tz = useTz();
  const q = useQuery({ queryKey: ['order', id], queryFn: () => api<OrderDetail>(`/orders/${id}`) });
  const keys = [['order', id], ['orders']];
  const act = useAction((fn: () => Promise<unknown>) => fn(), { invalidate: keys });
  const [panel, setPanel] = useState<'override' | 'adjust' | null>(null);

  if (!q.data) return <Loading />;
  const o = q.data;
  const a = o.allowed;
  const withReason = (verb: string, path: string) => () => {
    const reason = window.prompt(`Reason to ${verb} order #${o.number} (optional)`);
    if (reason === null) return;
    act.run(() => post(`/orders/${o.id}/${path}`, { version: o.version, reason }));
  };

  const plan: [string, string | null, string | null][] = [
    ['Kitchen started', null, o.kitchenStartedAt],
    ['Kitchen ready', o.plannedKitchenReadyAt, o.kitchenReadyAt],
    ['Dispatch ready', o.plannedDispatchReadyAt, o.dispatchReadyAt],
    ['Out for delivery', null, o.outForDeliveryAt],
    ['Delivered', o.deliveryAt, o.deliveredAt],
  ];

  return (
    <>
      <PageHeader title={<span className="flex items-center gap-3">Order #{o.number} <StatusChip status={o.status} /></span>}>
        {a.edit && <LinkButton href={`/orders/new?edit=${o.id}`}>Edit</LinkButton>}
        {a.edit && o.status === 'DRAFT' && <Button variant="primary" disabled={act.isPending} onClick={() => act.run(() => post(`/orders/${o.id}/place`, { version: o.version }))}>Place order</Button>}
        {a.override && <Button onClick={() => setPanel(panel === 'override' ? null : 'override')}>Change delivery</Button>}
        {a.forceComplete && <Button onClick={() => window.confirm('Mark every remaining prep unit done?') && act.run(() => post(`/kitchen/orders/${o.id}/force-complete`))}>Force complete kitchen</Button>}
        {a.adjust && <Button onClick={() => setPanel(panel === 'adjust' ? null : 'adjust')}>Billing adjustment</Button>}
        {a.reject && <Button variant="danger" onClick={withReason('reject', 'reject')}>Reject</Button>}
        {a.cancel && <Button variant="danger" onClick={withReason('cancel', 'cancel')}>Cancel order</Button>}
      </PageHeader>
      <div className="mb-4"><ErrorText>{act.error}</ErrorText></div>
      {panel === 'override' && <OverridePanel order={o} onDone={() => setPanel(null)} />}
      {panel === 'adjust' && <AdjustPanel order={o} onDone={() => setPanel(null)} />}

      <div className="mb-10 grid gap-x-12 gap-y-4 text-sm sm:grid-cols-2 lg:grid-cols-4">
        <Info label="Employee">{o.employee.name}<div className="text-stone-500">{o.employee.email}</div></Info>
        <Info label="Company"><Link className="hover:underline" href={`/companies/${o.company.id}`}>{o.company.name}</Link><div className="text-stone-500">{o.priceTierName} prices</div></Info>
        <Info label="Delivery">{day(o.deliveryDate)}, {hhmm(o.deliveryTimeMin)}<div className="text-stone-500">{o.addressText}</div></Info>
        <Info label="Packaging">{o.packagingName}</Info>
        <Info label="Cut-off">{dateTime(o.cutoffAt, tz)}</Info>
        <Info label="Driver">{o.drop?.driver?.name ?? 'Not assigned'}</Info>
        <Info label="Invoice">{o.invoice ? <Link className="hover:underline" href={`/billing/invoices/${o.invoice.id}`}>#{o.invoice.number}, {o.invoice.status.toLowerCase()}</Link> : 'Not invoiced'}</Info>
        {o.notes && <Info label="Notes">{o.notes}</Info>}
      </div>

      <Section title="Lines">
        <Table>
          <thead><Tr><Th>Dish</Th><Th>Combination</Th><Th className="text-right">Qty</Th><Th className="text-right">Unit price</Th><Th className="text-right">Total</Th></Tr></thead>
          <tbody>
            {o.lines.map((l) =>
              l.combinations.map((c, i) => (
                <Tr key={c.id}>
                  <Td>{i === 0 && <><div className="font-medium">{l.dishName}</div><div className="text-xs text-stone-500">SKU {l.dishSku}, {l.stationName ?? 'Unassigned'}, {l.quantity} total</div></>}</Td>
                  <Td>
                    <div>{c.label}</div>
                    <div className="text-xs text-stone-500">
                      Dish {money(l.dishPriceCents)}
                      {c.choices.filter((ch) => ch.optionCents + ch.portionExtraCents > 0).map((ch) => `, ${ch.optionName} ${money(ch.optionCents)}${ch.portionExtraCents ? ` + ${ch.portionName} ${money(ch.portionExtraCents)}` : ''}`).join('')}
                    </div>
                  </Td>
                  <Td className="text-right"><Num>{c.quantity}</Num></Td>
                  <Td className="text-right"><Num>{money(c.unitCents)}</Num></Td>
                  <Td className="text-right"><Num>{money(c.totalCents)}</Num></Td>
                </Tr>
              )),
            )}
            <Tr><Td colSpan={4} className="text-right font-medium">Order total</Td><Td className="text-right font-semibold"><Num>{money(o.totalCents)}</Num></Td></Tr>
            {o.adjustments.map((adj) => (
              <Tr key={adj.id}><Td colSpan={4} className="text-right text-stone-600">Adjustment: {adj.reason}{adj.invoiceId ? '' : ' (next invoice)'}</Td><Td className="text-right"><Num>{money(adj.amountCents)}</Num></Td></Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Plan and progress">
          <Table>
            <thead><Tr><Th>Step</Th><Th>Planned</Th><Th>Actual</Th></Tr></thead>
            <tbody>
              {plan.map(([label, planned, actual]) => {
                const late = planned && actual && new Date(actual) > new Date(planned);
                return (
                  <Tr key={label}>
                    <Td>{label}</Td>
                    <Td><Num>{planned ? time(planned, tz) : ''}</Num></Td>
                    <Td><Num className={late ? 'text-red-700' : ''}>{actual ? dateTime(actual, tz) : ''}</Num>{label === 'Delivered' && o.onTime !== null && <span className="ml-2"><Chip tone={o.onTime ? 'green' : 'red'}>{o.onTime ? 'On time' : 'Late'}</Chip></span>}</Td>
                  </Tr>
                );
              })}
            </tbody>
          </Table>
          {o.drop?.deliveryNote && <p className="mt-2 text-sm text-stone-700">Driver note: {o.drop.deliveryNote}</p>}
        </Section>

        <Section title="Timeline">
          <ol className="flex flex-col gap-2 text-sm">
            {o.events.map((e) => (
              <li key={e.id} className="flex gap-3">
                <Num className="w-28 shrink-0 text-stone-500">{dateTime(e.at, tz)}</Num>
                <span>{e.message}<span className="text-stone-500">, {e.actorName ?? 'System'}</span></span>
              </li>
            ))}
          </ol>
        </Section>
      </div>
    </>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><div className="text-xs text-stone-500">{label}</div><div className="mt-0.5">{children}</div></div>;
}

function OverridePanel({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const company = useQuery({ queryKey: ['company', order.company.id], queryFn: () => api<CompanyDetail>(`/companies/${order.company.id}`) });
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api<Reference>('/reference') });
  const [addressId, setAddressId] = useState(order.addressId);
  const [timeStr, setTimeStr] = useState(hhmm(order.deliveryTimeMin));
  const [packagingTypeId, setPackaging] = useState(order.packagingTypeId);
  const act = useAction(() => post(`/orders/${order.id}/override`, { version: order.version, addressId, packagingTypeId, deliveryTimeMin: parseHhMm(timeStr) ?? undefined }), { invalidate: [['order', order.id]], onSuccess: onDone });
  return (
    <div className="mb-8 flex flex-wrap items-end gap-3 rounded-md bg-stone-50 p-4">
      <Field label="Address" error={act.fieldErrors.addressId}>
        <Select value={addressId} onChange={(e) => setAddressId(e.target.value)}>{company.data?.addresses.map((x) => <option key={x.id} value={x.id}>{x.label}</option>)}</Select>
      </Field>
      <Field label="Time" error={act.fieldErrors.deliveryTimeMin}><Input type="time" value={timeStr} onChange={(e) => setTimeStr(e.target.value)} /></Field>
      <Field label="Packaging" error={act.fieldErrors.packagingTypeId}>
        <Select value={packagingTypeId} onChange={(e) => setPackaging(e.target.value)}>{ref.data?.['packaging-types'].map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</Select>
      </Field>
      <Button variant="primary" disabled={act.isPending} onClick={() => act.run(undefined)}>Save change</Button>
      <ErrorText>{act.error}</ErrorText>
    </div>
  );
}

function AdjustPanel({ order, onDone }: { order: OrderDetail; onDone: () => void }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const cents = Math.round(Number(amount) * 100);
  const act = useAction(() => post('/billing/adjustments', { orderId: order.id, amountCents: cents, reason }), { invalidate: [['order', order.id]], onSuccess: onDone });
  return (
    <div className="mb-8 flex flex-wrap items-end gap-3 rounded-md bg-stone-50 p-4">
      <Field label="Amount ($, negative = credit)" error={act.fieldErrors.amountCents}><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="-11.95" /></Field>
      <Field label="Reason" error={act.fieldErrors.reason} className="min-w-64"><Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="One bowl missing" /></Field>
      <Button variant="primary" disabled={act.isPending || !Number.isFinite(cents)} onClick={() => act.run(undefined)}>Add adjustment</Button>
      <ErrorText>{act.error}</ErrorText>
    </div>
  );
}
