'use client';

import Link from 'next/link';
import { use } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, post } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { dateTime, day, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, Chip, ErrorText, Loading, Num, PageHeader, StatusChip, Table, Td, Th, Tr } from '@/components/ui';

interface Invoice {
  id: string; number: number; status: string; totalCents: number; issuedAt: string; paidAt: string | null; reconciles: boolean;
  company: { id: string; name: string; billingName: string; billingEmail: string; billingPhone: string };
  orders: { id: string; number: number; status: string; deliveryDate: string; totalCents: number; invoicedCents: number | null; employee: { name: string } }[];
  adjustments: { id: string; amountCents: number; reason: string; order: { number: number } }[];
}

export default function InvoicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const { can, clock } = useSession();
  const q = useQuery({ queryKey: ['invoice', id], queryFn: () => api<Invoice>(`/billing/invoices/${id}`) });
  const paid = useAction(() => post(`/billing/invoices/${id}/paid`), { invalidate: [['invoice', id], ['invoices'], ['billing']] });
  if (!q.data) return <Loading />;
  const i = q.data;
  return (
    <>
      <PageHeader title={<span className="flex items-center gap-3">Invoice #{i.number} <StatusChip status={i.status} /></span>}>
        {can('billing.write') && i.status === 'ISSUED' && <Button variant="primary" disabled={paid.isPending} onClick={() => paid.run(undefined)}>Mark paid</Button>}
      </PageHeader>
      <ErrorText>{paid.error}</ErrorText>
      <div className="mb-8 grid gap-x-12 gap-y-3 text-sm sm:grid-cols-3">
        <div><div className="text-xs text-stone-500">Bill to</div><Link className="hover:underline" href={`/companies/${i.company.id}`}>{i.company.name}</Link><div>{i.company.billingName}</div><div className="text-stone-500">{i.company.billingEmail}</div></div>
        <div><div className="text-xs text-stone-500">Issued</div>{dateTime(i.issuedAt, clock.timeZone)}{i.paidAt && <div className="text-stone-500">Paid {dateTime(i.paidAt, clock.timeZone)}</div>}</div>
        <div><div className="text-xs text-stone-500">Check</div>{i.reconciles ? <Chip tone="green">Total equals the sum of its lines</Chip> : <Chip tone="red">Total does not reconcile</Chip>}</div>
      </div>
      <Table>
        <thead><Tr><Th>Order</Th><Th>Delivery</Th><Th>Employee</Th><Th>Status now</Th><Th className="text-right">Billed</Th></Tr></thead>
        <tbody>
          {i.orders.map((o) => (
            <Tr key={o.id}>
              <Td><Link className="hover:underline" href={`/orders/${o.id}`}>#{o.number}</Link></Td>
              <Td>{day(o.deliveryDate)}</Td><Td>{o.employee.name}</Td><Td><StatusChip status={o.status} /></Td>
              <Td className="text-right"><Num>{money(o.invoicedCents ?? 0)}</Num></Td>
            </Tr>
          ))}
          {i.adjustments.map((a) => (
            <Tr key={a.id}><Td colSpan={4}>Adjustment on #{a.order.number}: {a.reason}</Td><Td className="text-right"><Num>{money(a.amountCents)}</Num></Td></Tr>
          ))}
          <Tr><Td colSpan={4} className="text-right font-medium">Total</Td><Td className="text-right font-semibold"><Num>{money(i.totalCents)}</Num></Td></Tr>
        </tbody>
      </Table>
      <p className="mt-3 text-xs text-stone-500">Issued invoices do not change. If an order here is later cancelled or delivered short, the credit goes on the company’s next invoice.</p>
    </>
  );
}
