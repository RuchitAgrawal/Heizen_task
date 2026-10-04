'use client';

import { Suspense, use, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, post, put } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { useSession } from '@/lib/session';
import type { Named, Reference } from '@/lib/types';
import { MultiPick } from '@/components/multi';
import { Button, Check, ErrorText, Field, Input, LinkButton, Loading, PageHeader, Section, Select } from '@/components/ui';

interface Employee { id: string; name: string; email: string; companyId: string; active: boolean; canChooseAddress: boolean; canChangeDeliveryTime: boolean; canChangePackaging: boolean; allergens: Named[]; dietaryTags: Named[] }

function EmployeeForm({ id }: { id: string }) {
  const isNew = id === 'new';
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const editable = can('employees.write');
  const emp = useQuery({ queryKey: ['employee', id], queryFn: () => api<Employee>(`/employees/${id}`), enabled: !isNew });
  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<Named[]>('/companies') });
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api<Reference>('/reference') });
  const [f, setF] = useState({ name: '', email: '', companyId: params.get('companyId') ?? '', active: true, canChooseAddress: false, canChangeDeliveryTime: false, canChangePackaging: false, allergenIds: [] as string[], dietaryTagIds: [] as string[] });
  useEffect(() => {
    const e = emp.data;
    if (e) setF({ name: e.name, email: e.email, companyId: e.companyId, active: e.active, canChooseAddress: e.canChooseAddress, canChangeDeliveryTime: e.canChangeDeliveryTime, canChangePackaging: e.canChangePackaging, allergenIds: e.allergens.map((a) => a.id), dietaryTagIds: e.dietaryTags.map((a) => a.id) });
  }, [emp.data]);
  const save = useAction(() => (isNew ? post<{ id: string }>('/employees', f) : put<{ id: string }>(`/employees/${id}`, f)), {
    invalidate: [['employees'], ['employee', id]],
    onSuccess: (e) => isNew && router.replace(`/employees/${e.id}`),
  });
  if ((!isNew && !emp.data) || !ref.data || !companies.data) return <Loading />;
  const fe = save.fieldErrors;
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const moved = emp.data && emp.data.companyId !== f.companyId;

  return (
    <>
      <PageHeader title={isNew ? 'New employee' : f.name}>
        {!isNew && can('orders.write') && <LinkButton href={`/orders/new?employee=${id}`}>New order</LinkButton>}
      </PageHeader>
      <fieldset disabled={!editable} className="grid max-w-3xl gap-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="Name" error={fe.name}><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
          <Field label="Work email" error={fe.email}><Input value={f.email} onChange={(e) => set({ email: e.target.value })} /></Field>
          <Field label="Company" error={fe.companyId} hint={moved ? 'Moving changes their menu, prices and calendar for new orders. Past orders stay with the old company.' : undefined}>
            <Select value={f.companyId} onChange={(e) => set({ companyId: e.target.value })}><option value="">Choose…</option>{companies.data.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
          </Field>
        </div>
        <Section title="Staff may let them change">
          <div className="flex flex-wrap gap-5">
            <Check label="Delivery address" checked={f.canChooseAddress} onChange={(e) => set({ canChooseAddress: e.target.checked })} />
            <Check label="Delivery time" checked={f.canChangeDeliveryTime} onChange={(e) => set({ canChangeDeliveryTime: e.target.checked })} />
            <Check label="Packaging" checked={f.canChangePackaging} onChange={(e) => set({ canChangePackaging: e.target.checked })} />
          </div>
        </Section>
        <Field label="Allergies"><MultiPick options={ref.data.allergens} value={f.allergenIds} onChange={(v) => set({ allergenIds: v })} /></Field>
        <Field label="Dietary preferences"><MultiPick options={ref.data['dietary-tags']} value={f.dietaryTagIds} onChange={(v) => set({ dietaryTagIds: v })} /></Field>
        <Check label="Active" checked={f.active} onChange={(e) => set({ active: e.target.checked })} />
        {editable && <div><Button variant="primary" disabled={save.isPending} onClick={() => save.run(undefined)}>Save employee</Button></div>}
        <ErrorText>{save.error}</ErrorText>
      </fieldset>
    </>
  );
}

export default function EmployeePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><EmployeeForm id={id} /></Suspense>;
}
