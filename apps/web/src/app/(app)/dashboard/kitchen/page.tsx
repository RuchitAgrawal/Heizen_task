'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { day, time } from '@/lib/format';
import { useTz } from '@/lib/session';
import { LinkButton, Loading, Num, PageHeader, Section, Stat, Table, Td, Th, Tr } from '@/components/ui';

interface StationRow { id: string; name: string; units: number; portions: number; notStarted: number; inProgress: number; done: number; late: number; atRisk: number }
interface KitchenDash {
  today: string;
  stations: StationRow[];
  totals: { units: number; portions: number; remainingPortions: number; late: number; atRisk: number; orders: number; ordersReady: number };
  nextDue: string | null;
  batches: { dishName: string; label: string; stationId: string; quantity: number; remaining: number; earliestDue: string }[];
  tomorrow: { date: string; confirmedOrders: number; stations: { id: string; name: string; portions: number }[] };
}

export default function KitchenDashboard() {
  const tz = useTz();
  const q = useQuery({ queryKey: ['dash', 'kitchen'], queryFn: () => api<KitchenDash>('/dashboards/kitchen'), refetchInterval: 30_000 });
  if (!q.data) return <Loading />;
  const d = q.data;
  const stationName = new Map(d.stations.map((s) => [s.id, s.name]));

  return (
    <>
      <PageHeader title={`Kitchen, ${day(d.today)}`}>
        <LinkButton variant="primary" href="/kitchen">Open the board</LinkButton>
      </PageHeader>

      <div className="mb-10 flex flex-wrap gap-x-12 gap-y-6">
        <Stat label="Portions left to cook" value={d.totals.remainingPortions} sub={`of ${d.totals.portions} today`} />
        <Stat label="Late units" value={d.totals.late} tone={d.totals.late ? 'red' : undefined} sub="past planned kitchen-ready" />
        <Stat label="At risk" value={d.totals.atRisk} tone={d.totals.atRisk ? 'amber' : undefined} sub="due within the risk window" />
        <Stat label="Orders ready" value={`${d.totals.ordersReady} / ${d.totals.orders}`} />
        <Stat label="Next due" value={d.nextDue ? time(d.nextDue, tz) : 'n/a'} />
      </div>

      <Section title="By station">
        <Table>
          <thead>
            <Tr><Th>Station</Th><Th className="text-right">Portions</Th><Th className="text-right">Not started</Th><Th className="text-right">Cooking</Th><Th className="text-right">Done</Th><Th className="text-right">Late</Th><Th className="text-right">At risk</Th></Tr>
          </thead>
          <tbody>
            {d.stations.filter((s) => s.units > 0).map((s) => (
              <Tr key={s.id}>
                <Td><Link className="hover:underline" href={`/kitchen?station=${s.id}`}>{s.name}</Link></Td>
                <Td className="text-right"><Num>{s.portions}</Num></Td>
                <Td className="text-right"><Num>{s.notStarted}</Num></Td>
                <Td className="text-right"><Num>{s.inProgress}</Num></Td>
                <Td className="text-right"><Num>{s.done}</Num></Td>
                <Td className={`text-right ${s.late ? 'font-medium text-red-700' : ''}`}><Num>{s.late}</Num></Td>
                <Td className={`text-right ${s.atRisk ? 'font-medium text-amber-700' : ''}`}><Num>{s.atRisk}</Num></Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Section>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Cook next, batched across orders">
          <Table>
            <thead><Tr><Th>Dish</Th><Th>Station</Th><Th className="text-right">Left</Th><Th className="text-right">First due</Th></Tr></thead>
            <tbody>
              {d.batches.map((b) => (
                <Tr key={`${b.stationId}${b.dishName}${b.label}`}>
                  <Td><div>{b.dishName}</div><div className="text-xs text-stone-500">{b.label}</div></Td>
                  <Td>{stationName.get(b.stationId)}</Td>
                  <Td className="text-right"><Num>{b.remaining}</Num></Td>
                  <Td className="text-right"><Num>{time(b.earliestDue, tz)}</Num></Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </Section>

        <Section title={`Prep ahead, ${day(d.tomorrow.date)}`}>
          {d.tomorrow.confirmedOrders === 0 ? (
            <p className="text-sm text-stone-500">No confirmed orders yet. Placed orders still change until cut-off.</p>
          ) : (
            <Table>
              <thead><Tr><Th>Station</Th><Th className="text-right">Confirmed portions</Th></Tr></thead>
              <tbody>
                {d.tomorrow.stations.map((s) => (
                  <Tr key={s.id}><Td>{s.name}</Td><Td className="text-right"><Num>{s.portions}</Num></Td></Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>
      </div>
    </>
  );
}
