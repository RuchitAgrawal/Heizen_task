'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { Page } from '@fernleaf/shared';
import { api } from '@/lib/api';
import { dateTime, day, money } from '@/lib/format';
import { useTz } from '@/lib/session';
import { Loading, Num, PageHeader, Section, StatusChip, Table, Td, Th, Tr } from '@/components/ui';

interface Summary { company: { id: string; name: string }; uninvoicedOrders: number; uninvoicedOrderCents: number; oldestUninvoiced: string | null; pendingAdjustments: number; pendingAdjustmentCents: number; unpaidInvoices: number; unpaidCents: number }
interface Invoice { id: string; number: number; status: string; totalCents: number; issuedAt: string; paidAt: string | null; company: { name: string }; _count: { orders: number; adjustments: number } }

export default function BillingPage() {
  const tz = useTz();
  const summary = useQuery({ queryKey: ['billing', 'summary'], queryFn: () => api<Summary[]>('/billing/summary') });
  const invoices = useQuery({ queryKey: ['invoices'], queryFn: () => api<Page<Invoice>>('/billing/invoices', { query: { pageSize: 50 } }) });
  if (!summary.data) return <Loading />;
  return (
    <>
      <PageHeader title="Billing" />
      <Section title="To invoice, by company">
        <Table>
          <thead><Tr><Th>Company</Th><Th className="text-right">Orders not invoiced</Th><Th className="text-right">Amount</Th><Th>Oldest delivery</Th><Th className="text-right">Pending adjustments</Th><Th className="text-right">Unpaid invoices</Th></Tr></thead>
          <tbody>
            {summary.data.map((s) => (
              <Tr key={s.company.id}>
                <Td><Link className="font-medium hover:underline" href={`/billing/${s.company.id}`}>{s.company.name}</Link></Td>
                <Td className="text-right"><Num>{s.uninvoicedOrders}</Num></Td>
                <Td className="text-right"><Num>{money(s.uninvoicedOrderCents)}</Num></Td>
                <Td>{s.oldestUninvoiced ? day(s.oldestUninvoiced) : ''}</Td>
                <Td className="text-right"><Num>{s.pendingAdjustments ? `${s.pendingAdjustments} (${money(s.pendingAdjustmentCents)})` : 0}</Num></Td>
                <Td className="text-right"><Num>{s.unpaidInvoices ? `${s.unpaidInvoices} (${money(s.unpaidCents)})` : 0}</Num></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-stone-500">Confirmed and delivered orders are owed by the company. Includes today and future confirmed orders.</p>
      </Section>
      <Section title="Invoices">
        {!invoices.data ? <Loading /> : (
          <Table>
            <thead><Tr><Th>Invoice</Th><Th>Company</Th><Th>Issued</Th><Th className="text-right">Orders</Th><Th className="text-right">Total</Th><Th>Status</Th></Tr></thead>
            <tbody>
              {invoices.data.items.map((i) => (
                <Tr key={i.id}>
                  <Td><Link className="font-medium hover:underline" href={`/billing/invoices/${i.id}`}>#{i.number}</Link></Td>
                  <Td>{i.company.name}</Td>
                  <Td>{dateTime(i.issuedAt, tz)}</Td>
                  <Td className="text-right"><Num>{i._count.orders}{i._count.adjustments ? ` + ${i._count.adjustments} adj.` : ''}</Num></Td>
                  <Td className="text-right"><Num>{money(i.totalCents)}</Num></Td>
                  <Td><StatusChip status={i.status} /></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        )}
      </Section>
    </>
  );
}
