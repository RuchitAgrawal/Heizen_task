'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense } from 'react';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { ORDER_STATUSES, Page } from '@fernleaf/shared';
import { api } from '@/lib/api';
import { day, hhmm, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Named, OrderRow } from '@/lib/types';
import { Chip, Empty, Field, Input, LinkButton, Loading, Num, PageHeader, Pager, Select, StatusChip, Table, Td, Th, Tr } from '@/components/ui';

function OrdersList() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const filters = {
    q: params.get('q') ?? '',
    from: params.get('from') ?? '',
    to: params.get('to') ?? '',
    status: params.get('status') ?? '',
    companyId: params.get('companyId') ?? '',
    invoiced: params.get('invoiced') ?? '',
    page: Number(params.get('page') ?? 1),
  };
  // Filters live in the URL so a filtered list can be shared and survives a reload.
  const set = (patch: Partial<typeof filters>) => {
    const next = new URLSearchParams();
    Object.entries({ ...filters, page: 1, ...patch }).forEach(([k, v]) => v && v !== 1 && next.set(k, String(v)));
    router.replace(`/orders?${next}`);
  };

  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<Named[]>('/companies'), enabled: can('companies.read', 'orders.write') });
  const q = useQuery({
    queryKey: ['orders', filters],
    queryFn: () => api<Page<OrderRow>>('/orders', { query: { ...filters, pageSize: 25 } }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Orders">{can('orders.write') && <LinkButton variant="primary" href="/orders/new">New order</LinkButton>}</PageHeader>
      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-6">
        <Field label="Search" className="col-span-2">
          <Input placeholder="#1042, employee, company" defaultValue={filters.q} onKeyDown={(e) => e.key === 'Enter' && set({ q: e.currentTarget.value })} onBlur={(e) => e.target.value !== filters.q && set({ q: e.target.value })} />
        </Field>
        <Field label="From"><Input type="date" value={filters.from} onChange={(e) => set({ from: e.target.value })} /></Field>
        <Field label="To"><Input type="date" value={filters.to} onChange={(e) => set({ to: e.target.value })} /></Field>
        <Field label="Status">
          <Select value={filters.status} onChange={(e) => set({ status: e.target.value })}>
            <option value="">Any</option>
            {ORDER_STATUSES.map((s) => <option key={s} value={s}>{s.charAt(0) + s.slice(1).toLowerCase()}</option>)}
          </Select>
        </Field>
        <Field label="Invoiced">
          <Select value={filters.invoiced} onChange={(e) => set({ invoiced: e.target.value })}>
            <option value="">Either</option><option value="yes">Invoiced</option><option value="no">Not invoiced</option>
          </Select>
        </Field>
        {companies.data && (
          <Field label="Company" className="col-span-2">
            <Select value={filters.companyId} onChange={(e) => set({ companyId: e.target.value })}>
              <option value="">All companies</option>
              {companies.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </Select>
          </Field>
        )}
      </div>

      {!q.data ? <Loading /> : q.data.items.length === 0 ? <Empty>No orders match these filters.</Empty> : (
        <>
          <Table>
            <thead>
              <Tr><Th>Order</Th><Th>Delivery</Th><Th>Employee</Th><Th>Company</Th><Th>Status</Th><Th className="text-right">Lines</Th><Th className="text-right">Total</Th><Th>Invoice</Th></Tr>
            </thead>
            <tbody>
              {q.data.items.map((o) => (
                <Tr key={o.id} className="cursor-pointer hover:bg-stone-50" onClick={() => router.push(`/orders/${o.id}`)}>
                  <Td><Link href={`/orders/${o.id}`} className="font-medium hover:underline"><Num>#{o.number}</Num></Link></Td>
                  <Td className="whitespace-nowrap">{day(o.deliveryDate)} <Num className="text-stone-500">{hhmm(o.deliveryTimeMin)}</Num></Td>
                  <Td>{o.employee.name}</Td>
                  <Td>{o.company.name}</Td>
                  <Td><StatusChip status={o.status} /></Td>
                  <Td className="text-right"><Num>{o._count.lines}</Num></Td>
                  <Td className="text-right"><Num>{money(o.totalCents)}</Num></Td>
                  <Td>{o.invoice ? <Chip tone={o.invoice.status === 'PAID' ? 'green' : 'amber'}>#{o.invoice.number}</Chip> : null}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pager page={q.data.page} pageSize={q.data.pageSize} total={q.data.total} onPage={(p) => set({ page: p })} />
        </>
      )}
    </>
  );
}

export default function OrdersPage() {
  return <Suspense><OrdersList /></Suspense>;
}
