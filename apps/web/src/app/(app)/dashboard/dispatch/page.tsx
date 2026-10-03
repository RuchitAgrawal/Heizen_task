'use client';

import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { day, pct } from '@/lib/format';
import { Chip, Empty, LinkButton, Loading, Num, PageHeader, Section, Stat, Table, Td, Th, Tr, URGENCY } from '@/components/ui';
import { STAGE_LABEL } from '@/components/stages';

interface DispatchDash {
  today: string;
  drops: number;
  byStage: { waiting: number; kitchenReady: number; dispatchReady: number; outForDelivery: number; delivered: number };
  unassigned: { id: string; company: string; time: string }[];
  attention: { id: string; company: string; time: string; stage: string; urgency: string; driver: string | null }[];
  drivers: { id: string; name: string; drops: number; meals: number; remaining: number }[];
  onTime: { delivered: number; onTime: number };
}

export default function DispatchDashboard() {
  const q = useQuery({ queryKey: ['dash', 'dispatch'], queryFn: () => api<DispatchDash>('/dashboards/dispatch'), refetchInterval: 30_000 });
  if (!q.data) return <Loading />;
  const d = q.data;
  return (
    <>
      <PageHeader title={`Dispatch, ${day(d.today)}`}>
        <LinkButton variant="primary" href="/dispatch">Open the board</LinkButton>
      </PageHeader>

      <div className="mb-10 flex flex-wrap gap-x-12 gap-y-6">
        <Stat label="Drops today" value={d.drops} />
        <Stat label="Still in kitchen" value={d.byStage.waiting} />
        <Stat label="Ready to pack" value={d.byStage.kitchenReady} />
        <Stat label="Waiting for driver" value={d.byStage.dispatchReady} />
        <Stat label="Out" value={d.byStage.outForDelivery} />
        <Stat label="Delivered on time" value={pct(d.onTime.onTime, d.onTime.delivered)} sub={`${d.onTime.onTime} of ${d.onTime.delivered} drops`} />
        <Stat label="No driver" value={d.unassigned.length} tone={d.unassigned.length ? 'amber' : undefined} />
      </div>

      <div className="grid gap-10 lg:grid-cols-2">
        <Section title="Needs attention">
          {d.attention.length === 0 ? <Empty>Nothing late or at risk.</Empty> : (
            <Table>
              <thead><Tr><Th>Slot</Th><Th>Company</Th><Th>Stage</Th><Th>Driver</Th><Th /></Tr></thead>
              <tbody>
                {d.attention.map((a) => (
                  <Tr key={a.id}>
                    <Td><Num>{a.time}</Num></Td><Td>{a.company}</Td><Td>{STAGE_LABEL[a.stage]}</Td><Td>{a.driver ?? <span className="text-amber-700">None</span>}</Td>
                    <Td><Chip tone={URGENCY[a.urgency].tone}>{URGENCY[a.urgency].label}</Chip></Td>
                  </Tr>
                ))}
              </tbody>
            </Table>
          )}
        </Section>

        <Section title="Drivers">
          <Table>
            <thead><Tr><Th>Driver</Th><Th className="text-right">Drops</Th><Th className="text-right">Meals</Th><Th className="text-right">Remaining</Th></Tr></thead>
            <tbody>
              {d.drivers.map((r) => (
                <Tr key={r.id}><Td>{r.name}</Td><Td className="text-right"><Num>{r.drops}</Num></Td><Td className="text-right"><Num>{r.meals}</Num></Td><Td className="text-right"><Num>{r.remaining}</Num></Td></Tr>
              ))}
            </tbody>
          </Table>
        </Section>
      </div>
    </>
  );
}
