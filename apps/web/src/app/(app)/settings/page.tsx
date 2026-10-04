'use client';

import { useEffect, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { WEEKDAY_LABELS, WEEKDAYS, addDays, parseHhMm, referenceKinds, ReferenceKind } from '@fernleaf/shared';
import { api, del, post, put } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { dateTime, day, hhmm } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Named, Reference } from '@/lib/types';
import { MultiPick } from '@/components/multi';
import { Button, Check, Chip, ErrorText, Field, Input, Loading, Num, PageHeader, Section, Select, Table, Td, Th, Tr } from '@/components/ui';

interface Settings { timeZone: string; cutoffTimeMin: number; cutoffDays: number; workingDays: number[]; kitchenBufferMin: number; atRiskWindowMin: number; onTimeGraceMin: number }

export default function SettingsPage() {
  const { can } = useSession();
  return (
    <>
      <PageHeader title="Settings" />
      {can('settings.write') && <KitchenSettings />}
      {can('cutoff.run') && <Cutoff />}
      {can('catalog.write') && <ReferenceLists />}
      {can('staff.manage') && <Staff />}
    </>
  );
}

function KitchenSettings() {
  const q = useQuery({ queryKey: ['settings'], queryFn: () => api<{ settings: Settings; holidays: { date: string; name: string }[] }>('/settings') });
  const [s, setS] = useState<(Omit<Settings, 'cutoffTimeMin'> & { cutoff: string }) | null>(null);
  useEffect(() => { if (q.data) setS({ ...q.data.settings, cutoff: hhmm(q.data.settings.cutoffTimeMin) }); }, [q.data]);
  const save = useAction(() => put('/settings', { timeZone: s!.timeZone, cutoffTimeMin: parseHhMm(s!.cutoff) ?? -1, cutoffDays: s!.cutoffDays, workingDays: s!.workingDays, kitchenBufferMin: s!.kitchenBufferMin, atRiskWindowMin: s!.atRiskWindowMin, onTimeGraceMin: s!.onTimeGraceMin }), { invalidate: [['settings'], ['clock']] });
  const [hd, setHd] = useState({ date: '', name: '' });
  const addH = useAction(() => post('/settings/holidays', hd), { invalidate: [['settings']], onSuccess: () => setHd({ date: '', name: '' }) });
  const delH = useAction((date: string) => del(`/settings/holidays/${date}`), { invalidate: [['settings']] });
  if (!s || !q.data) return <Loading />;
  const fe = save.fieldErrors;
  const n = (k: keyof Settings) => (e: React.ChangeEvent<HTMLInputElement>) => setS({ ...s, [k]: Number(e.target.value) });
  return (
    <Section title="Kitchen">
      <div className="grid max-w-4xl gap-4">
        <div className="grid gap-3 sm:grid-cols-4">
          <Field label="Kitchen time zone" error={fe.timeZone}><Input value={s.timeZone} onChange={(e) => setS({ ...s, timeZone: e.target.value })} /></Field>
          <Field label="Cut-off time" error={fe.cutoffTimeMin}><Input type="time" value={s.cutoff} onChange={(e) => setS({ ...s, cutoff: e.target.value })} /></Field>
          <Field label="Cut-off, kitchen days before" error={fe.cutoffDays}><Input type="number" min={0} value={s.cutoffDays} onChange={n('cutoffDays')} /></Field>
          <Field label="Kitchen-ready before dispatch (min)" error={fe.kitchenBufferMin}><Input type="number" value={s.kitchenBufferMin} onChange={n('kitchenBufferMin')} /></Field>
          <Field label="At-risk window (min)" error={fe.atRiskWindowMin}><Input type="number" value={s.atRiskWindowMin} onChange={n('atRiskWindowMin')} /></Field>
          <Field label="On-time grace (min)" error={fe.onTimeGraceMin}><Input type="number" value={s.onTimeGraceMin} onChange={n('onTimeGraceMin')} /></Field>
        </div>
        <Field label="Kitchen working days (count toward cut-off)" error={fe.workingDays}>
          <MultiPick options={WEEKDAYS.map((d) => ({ id: String(d), name: WEEKDAY_LABELS[d] }))} value={s.workingDays.map(String)} onChange={(v) => setS({ ...s, workingDays: v.map(Number).sort() })} />
        </Field>
        <div><Button variant="primary" disabled={save.isPending} onClick={() => save.run(undefined)}>Save kitchen settings</Button></div>
        <ErrorText>{save.error}</ErrorText>

        <div>
          <div className="mb-2 text-xs font-medium text-stone-600">Kitchen holidays (skipped when counting back to cut-off)</div>
          <ul className="mb-2 text-sm">
            {q.data.holidays.map((h) => <li key={h.date} className="flex items-center gap-3 py-1"><span className="w-28">{day(h.date)}</span><span className="flex-1">{h.name}</span><Button variant="ghost" onClick={() => delH.run(h.date)}>Remove</Button></li>)}
          </ul>
          <div className="flex flex-wrap items-end gap-2">
            <Field label="Date" error={addH.fieldErrors.date}><Input type="date" value={hd.date} onChange={(e) => setHd({ ...hd, date: e.target.value })} /></Field>
            <Field label="Name" error={addH.fieldErrors.name}><Input value={hd.name} onChange={(e) => setHd({ ...hd, name: e.target.value })} /></Field>
            <Button onClick={() => addH.run(undefined)}>Add holiday</Button>
            <ErrorText>{addH.error ?? delH.error}</ErrorText>
          </div>
        </div>
      </div>
    </Section>
  );
}

interface CutoffDay { deliveryDate: string; cutoffAt: string; drafts: number; placed: number; lastRun: { ranAt: string; trigger: string; cancelled: number; confirmed: number } | null }

function Cutoff() {
  const { clock } = useSession();
  const from = addDays(clock.today, -7);
  const to = addDays(clock.today, 10);
  const q = useQuery({ queryKey: ['cutoff', from, to], queryFn: () => api<CutoffDay[]>('/orders/cutoff/status', { query: { from, to } }) });
  const run = useAction((deliveryDate: string) => post<{ cancelled: number; confirmed: number }>('/orders/cutoff/run', { deliveryDate }), { invalidate: [['cutoff'], ['orders'], ['dash']] });
  const now = new Date(clock.now);
  return (
    <Section title="Cut-off processing">
      <p className="mb-3 max-w-2xl text-sm text-stone-500">Runs automatically every 5 minutes. At cut-off, drafts are cancelled and placed orders confirmed. Running it again for the same date changes nothing.</p>
      {run.data && <p className="mb-2 text-sm">Done: confirmed {run.data.confirmed}, cancelled {run.data.cancelled}.</p>}
      <ErrorText>{run.error}</ErrorText>
      {!q.data ? <Loading /> : (
        <Table className="max-w-4xl">
          <thead><Tr><Th>Delivery date</Th><Th>Cut-off</Th><Th className="text-right">Drafts</Th><Th className="text-right">Placed</Th><Th>Last run</Th><Th /></Tr></thead>
          <tbody>
            {q.data.map((d) => {
              const passed = new Date(d.cutoffAt) <= now;
              return (
                <Tr key={d.deliveryDate}>
                  <Td>{day(d.deliveryDate)}</Td>
                  <Td>{dateTime(d.cutoffAt, clock.timeZone)} {passed && <Chip>Passed</Chip>}</Td>
                  <Td className="text-right"><Num>{d.drafts}</Num></Td>
                  <Td className="text-right"><Num>{d.placed}</Num></Td>
                  <Td className="text-xs text-stone-600">{d.lastRun ? `${dateTime(d.lastRun.ranAt, clock.timeZone)}, ${d.lastRun.trigger}: ${d.lastRun.confirmed} confirmed, ${d.lastRun.cancelled} cancelled` : ''}</Td>
                  <Td className="text-right"><Button disabled={!passed || run.isPending} title={passed ? undefined : 'Cut-off has not passed'} onClick={() => run.run(d.deliveryDate)}>Run now</Button></Td>
                </Tr>
              );
            })}
          </tbody>
        </Table>
      )}
    </Section>
  );
}

const KIND_LABEL: Record<ReferenceKind, string> = { allergens: 'Allergens', 'dietary-tags': 'Dietary tags', stations: 'Kitchen stations', 'portion-sizes': 'Portion sizes', 'packaging-types': 'Packaging types' };

function ReferenceLists() {
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api<Reference>('/reference') });
  const [names, setNames] = useState<Record<string, string>>({});
  const add = useAction((kind: ReferenceKind) => post(`/reference/${kind}`, { name: names[kind], sortOrder: (ref.data?.[kind].length ?? 0) + 1 }), { invalidate: [['reference']], onSuccess: () => setNames({}) });
  const toggle = useAction(({ kind, item }: { kind: ReferenceKind; item: Reference[ReferenceKind][number] }) => put(`/reference/${kind}/${item.id}`, { name: item.name, sortOrder: item.sortOrder, active: !item.active }), { invalidate: [['reference']] });
  if (!ref.data) return <Loading />;
  return (
    <Section title="Reference lists">
      <ErrorText>{add.error ?? toggle.error}</ErrorText>
      <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-3">
        {referenceKinds.map((kind) => (
          <div key={kind}>
            <div className="mb-2 text-sm font-medium">{KIND_LABEL[kind]}</div>
            <ul className="mb-2 text-sm">
              {ref.data[kind].map((item) => (
                <li key={item.id} className="flex items-center justify-between py-0.5">
                  <span className={item.active ? '' : 'text-stone-400 line-through'}>{item.name}</span>
                  <button className="text-xs text-stone-600 hover:underline" onClick={() => toggle.run({ kind, item })}>{item.active ? 'Deactivate' : 'Activate'}</button>
                </li>
              ))}
            </ul>
            <div className="flex gap-2"><Input value={names[kind] ?? ''} onChange={(e) => setNames({ ...names, [kind]: e.target.value })} placeholder="Add…" /><Button onClick={() => add.run(kind)} disabled={!names[kind]}>Add</Button></div>
          </div>
        ))}
      </div>
    </Section>
  );
}

interface StaffRow { id: string; email: string; name: string; active: boolean; roleId: string; role: Named }

function Staff() {
  const staff = useQuery({ queryKey: ['staff'], queryFn: () => api<StaffRow[]>('/staff') });
  const roles = useQuery({ queryKey: ['roles'], queryFn: () => api<(Named & { permissions: string[] })[]>('/staff/roles') });
  const [f, setF] = useState({ name: '', email: '', password: '', roleId: '' });
  const create = useAction(() => post('/staff', f), { invalidate: [['staff'], ['drivers']], onSuccess: () => setF({ name: '', email: '', password: '', roleId: '' }) });
  const update = useAction(({ id, ...body }: { id: string; roleId?: string; active?: boolean }) => api(`/staff/${id}`, { method: 'PATCH', body }), { invalidate: [['staff'], ['drivers']] });
  if (!staff.data || !roles.data) return <Loading />;
  return (
    <Section title="Staff and roles">
      <p className="mb-3 max-w-2xl text-sm text-stone-500">Each person has one role. What a role can do is its permission list, checked on the server.</p>
      <ErrorText>{update.error}</ErrorText>
      <Table className="mb-6">
        <thead><Tr><Th>Name</Th><Th>Email</Th><Th>Role</Th><Th>Active</Th></Tr></thead>
        <tbody>
          {staff.data.map((s) => (
            <Tr key={s.id}>
              <Td>{s.name}</Td><Td>{s.email}</Td>
              <Td><Select value={s.roleId} onChange={(e) => update.run({ id: s.id, roleId: e.target.value })} className="w-40">{roles.data.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Td>
              <Td><Check label="" checked={s.active} onChange={(e) => update.run({ id: s.id, active: e.target.checked })} /></Td>
            </Tr>
          ))}
        </tbody>
      </Table>
      <div className="flex flex-wrap items-end gap-2">
        <Field label="Name" error={create.fieldErrors.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} /></Field>
        <Field label="Email" error={create.fieldErrors.email}><Input value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} /></Field>
        <Field label="Password" error={create.fieldErrors.password}><Input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></Field>
        <Field label="Role" error={create.fieldErrors.roleId}><Select value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}><option value="">Choose…</option>{roles.data.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}</Select></Field>
        <Button variant="primary" disabled={create.isPending} onClick={() => create.run(undefined)}>Add staff member</Button>
      </div>
      <div className="mt-2"><ErrorText>{create.error}</ErrorText></div>
      <details className="mt-6 text-sm">
        <summary className="cursor-pointer text-stone-600">Role permissions</summary>
        <Table className="mt-2">
          <tbody>{roles.data.map((r) => <Tr key={r.id}><Td className="w-28 font-medium">{r.name}</Td><Td className="text-xs text-stone-600">{r.permissions.join(', ')}</Td></Tr>)}</tbody>
        </Table>
      </details>
    </Section>
  );
}
