'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { day, money, pct, time } from '@/lib/format';
import { useTz } from '@/lib/session';
import { Loading, Num, PageHeader, Section, Stat, Table, Td, Th, Tr } from '@/components/ui';

interface AdminDash {
  today: string;
  pipeline: { date: string; cutoffAt: string; cutoffPassed: boolean; drafts: number; placed: number; confirmed: number; cancelled: number; bookedCents: number }[];
  delivery: { from: string; to: string; onTime: number; late: number; unknown: number; byDay: { date: string; onTime: number; late: number }[] };
  cancellations: { placed: number; cancelledOrRejected: number };
  revenueByCompany: { company: { id: string; name: string }; orders: number; cents: number }[];
  revenueWindow: { from: string; to: string };
  billing: { uninvoicedOrders: number; uninvoicedCents: number; oldestUninvoiced: string | null; unpaidInvoices: number; unpaidCents: number };
  pricingGaps: { tierId: string; tier: string; missing: number }[];
}

export default function AdminDashboard() {
  const tz = useTz();
  const q = useQuery({ queryKey: ['dash', 'admin'], queryFn: () => api<AdminDash>('/dashboards/admin'), refetchInterval: 60_000 });
  if (!q.data) return <Loading />;
  const d = q.data;
  const today = d.pipeline[0];
  const delivered = d.delivery.onTime + d.delivery.late;
  const revenueTotal = d.revenueByCompany.reduce((a, r) => a + r.cents, 0);

  return (
    <>
      <PageHeader title="Overview" />

      <div className="mb-10 flex flex-wrap gap-x-12 gap-y-6">
        <Stat label="Today’s orders" value={today.confirmed} sub={`${money(today.bookedCents)} billable`} />
        <Stat label="On time, last 14 days" value={pct(d.delivery.onTime, delivered)} sub={`${d.delivery.onTime} of ${delivered} deliveries`} tone={delivered && d.delivery.onTime / delivered < 0.9 ? 'amber' : undefined} />
        <Stat label="Cancelled after placing, 14 days" value={pct(d.cancellations.cancelledOrRejected, d.cancellations.placed)} sub={`${d.cancellations.cancelledOrRejected} of ${d.cancellations.placed} placed`} />
        <Stat label="Not yet invoiced" value={money(d.billing.uninvoicedCents)} sub={`${d.billing.uninvoicedOrders} orders${d.billing.oldestUninvoiced ? `, oldest ${day(d.billing.oldestUninvoiced)}` : ''}`} />
        <Stat label="Invoiced, unpaid" value={money(d.billing.unpaidCents)} sub={`${d.billing.unpaidInvoices} invoices`} />
      </div>

      <Section title="Next 8 days">
        <Table>
          <thead>
            <Tr>
              <Th>Delivery date</Th><Th>Cut-off</Th><Th className="text-right">Drafts</Th><Th className="text-right">Placed</Th>
              <Th className="text-right">Confirmed</Th><Th className="text-right">Cancelled</Th><Th className="text-right">Booked</Th>
            </Tr>
          </thead>
          <tbody>
            {d.pipeline.map((p) => (
              <Tr key={p.date}>
                <Td><Link className="hover:underline" href={`/orders?from=${p.date}&to=${p.date}`}>{day(p.date)}</Link></Td>
                <Td className={p.cutoffPassed ? 'text-stone-500' : ''}>{p.cutoffPassed ? 'Passed' : `${day(p.cutoffAt.slice(0, 10))} ${time(p.cutoffAt, tz)}`}</Td>
                <Td className={`text-right ${p.drafts && !p.cutoffPassed ? 'font-medium text-amber-700' : ''}`}><Num>{p.drafts}</Num></Td>
                <Td className="text-right"><Num>{p.placed}</Num></Td>
                <Td className="text-right"><Num>{p.confirmed}</Num></Td>
                <Td className="text-right"><Num>{p.cancelled}</Num></Td>
                <Td className="text-right"><Num>{money(p.bookedCents)}</Num></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
        <p className="mt-2 text-xs text-stone-500">Drafts are cancelled at cut-off. Booked = placed + confirmed + delivered.</p>
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title={`Revenue by company, ${day(d.revenueWindow.from)} to ${day(d.revenueWindow.to)}`}>
          <Table>
            <thead><Tr><Th>Company</Th><Th className="text-right">Orders</Th><Th className="text-right">Billable</Th><Th className="text-right">Share</Th></Tr></thead>
            <tbody>
              {d.revenueByCompany.map((r) => (
                <Tr key={r.company.id}>
                  <Td><Link className="hover:underline" href={`/companies/${r.company.id}`}>{r.company.name}</Link></Td>
                  <Td className="text-right"><Num>{r.orders}</Num></Td>
                  <Td className="text-right"><Num>{money(r.cents)}</Num></Td>
                  <Td className="text-right"><Num>{pct(r.cents, revenueTotal)}</Num></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title="Deliveries, last 14 days">
          <Table>
            <thead><Tr><Th>Date</Th><Th className="text-right">On time</Th><Th className="text-right">Late</Th><Th className="text-right">On-time rate</Th></Tr></thead>
            <tbody>
              {d.delivery.byDay.filter((x) => x.onTime + x.late > 0).map((x) => (
                <Tr key={x.date}>
                  <Td>{day(x.date)}</Td>
                  <Td className="text-right"><Num>{x.onTime}</Num></Td>
                  <Td className={`text-right ${x.late ? 'text-red-700' : ''}`}><Num>{x.late}</Num></Td>
                  <Td className="text-right"><Num>{pct(x.onTime, x.onTime + x.late)}</Num></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      </div>

      <Section title="Menu gaps">
        <Table className="max-w-md">
          <thead><Tr><Th>Tier in use</Th><Th className="text-right">Active dishes with no price</Th></Tr></thead>
          <tbody>
            {d.pricingGaps.map((g) => (
              <Tr key={g.tierId}>
                <Td><Link className="hover:underline" href={`/pricing/${g.tierId}?missing=1`}>{g.tier}</Link></Td>
                <Td className={`text-right ${g.missing ? 'font-medium text-amber-700' : ''}`}><Num>{g.missing}</Num></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>
    </>
  );
}
