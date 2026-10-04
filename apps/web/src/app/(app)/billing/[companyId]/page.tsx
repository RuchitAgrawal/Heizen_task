'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, post } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { day, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { CompanyDetail } from '@/lib/types';
import { Button, Empty, ErrorText, Input, Loading, Num, PageHeader, StatusChip, Table, Td, Th, Tr } from '@/components/ui';

interface Queue {
  orders: { id: string; number: number; status: string; deliveryDate: string; totalCents: number; employee: { name: string } }[];
  adjustments: { id: string; amountCents: number; reason: string; order: { number: number } }[];
}

export default function CompanyBilling({ params }: { params: Promise<{ companyId: string }> }) {
  const { companyId } = use(params);
  const router = useRouter();
  const { can, clock } = useSession();
  const company = useQuery({ queryKey: ['company', companyId], queryFn: () => api<CompanyDetail>(`/companies/${companyId}`) });
  const q = useQuery({ queryKey: ['billing', 'queue', companyId], queryFn: () => api<Queue>(`/billing/queue/${companyId}`) });
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [upTo, setUpTo] = useState(clock.today);
  const create = useAction(
    () => post<{ id: string }>('/billing/invoices', {
      companyId,
      orderIds: q.data!.orders.filter((o) => picked.has(o.id)).map((o) => o.id),
      adjustmentIds: q.data!.adjustments.filter((a) => picked.has(a.id)).map((a) => a.id),
    }),
    { invalidate: [['billing'], ['invoices'], ['orders']], onSuccess: (inv) => router.push(`/billing/invoices/${inv.id}`) },
  );
  if (!q.data) return <Loading />;
  const toggle = (id: string) => { const n = new Set(picked); if (n.has(id)) n.delete(id); else n.add(id); setPicked(n); };
  const total = q.data.orders.filter((o) => picked.has(o.id)).reduce((a, o) => a + o.totalCents, 0) + q.data.adjustments.filter((a) => picked.has(a.id)).reduce((s, a) => s + a.amountCents, 0);

  return (
    <>
      <PageHeader title={`Billing: ${company.data?.name ?? ''}`}>
        <span className="text-sm text-stone-600">Select delivered up to</span>
        <Input type="date" value={upTo} onChange={(e) => setUpTo(e.target.value)} className="w-40" />
        <Button onClick={() => setPicked(new Set([...q.data!.orders.filter((o) => o.deliveryDate <= upTo).map((o) => o.id), ...q.data!.adjustments.map((a) => a.id)]))}>Select</Button>
        {can('billing.write') && <Button variant="primary" disabled={picked.size === 0 || create.isPending} onClick={() => create.run(undefined)}>Invoice {picked.size} for {money(total)}</Button>}
      </PageHeader>
      <div className="mb-4"><ErrorText>{create.error}</ErrorText></div>
      {q.data.orders.length + q.data.adjustments.length === 0 ? <Empty>Nothing to invoice.</Empty> : (
        <Table>
          <thead><Tr><Th className="w-10" /><Th>Item</Th><Th>Delivery</Th><Th>Employee</Th><Th>Status</Th><Th className="text-right">Amount</Th></Tr></thead>
          <tbody>
            {q.data.adjustments.map((a) => (
              <Tr key={a.id}>
                <Td><input type="checkbox" className="accent-emerald-800" checked={picked.has(a.id)} onChange={() => toggle(a.id)} aria-label="Select adjustment" /></Td>
                <Td colSpan={4}>Adjustment on #{a.order.number}: {a.reason}</Td>
                <Td className="text-right"><Num>{money(a.amountCents)}</Num></Td>
              </Tr>
            ))}
            {q.data.orders.map((o) => (
              <Tr key={o.id}>
                <Td><input type="checkbox" className="accent-emerald-800" checked={picked.has(o.id)} onChange={() => toggle(o.id)} aria-label={`Select order ${o.number}`} /></Td>
                <Td><Link className="hover:underline" href={`/orders/${o.id}`}>#{o.number}</Link></Td>
                <Td>{day(o.deliveryDate)}</Td>
                <Td>{o.employee.name}</Td>
                <Td><StatusChip status={o.status} /></Td>
                <Td className="text-right"><Num>{money(o.totalCents)}</Num></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )}
    </>
  );
}
