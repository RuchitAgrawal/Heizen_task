'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { Page, WEEKDAY_LABELS, WEEKDAYS, parseHhMm } from '@fernleaf/shared';
import { api, del, post, put } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { useDebouncedValue } from '@/lib/debounce';
import { day, hhmm } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { CompanyDetail, Named, Reference } from '@/lib/types';
import { MultiPick } from '@/components/multi';
import { Button, Check, ErrorText, Field, Input, LinkButton, Loading, PageHeader, Section, Select, Textarea } from '@/components/ui';

type Address = { id?: string; label: string; line1: string; line2: string; city: string; postalCode: string; isDefault: boolean };
const emptyAddress: Address = { label: '', line1: '', line2: '', city: '', postalCode: '', isDefault: false };

export default function CompanyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = id === 'new';
  const router = useRouter();
  const { can } = useSession();
  const editable = can('companies.write');
  const [ownerSearch, setOwnerSearch] = useState('');
  const debouncedOwnerSearch = useDebouncedValue(ownerSearch);
  const company = useQuery({ queryKey: ['company', id], queryFn: () => api<CompanyDetail>(`/companies/${id}`), enabled: !isNew });
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api<Reference>('/reference') });
  const tiers = useQuery({ queryKey: ['tiers'], queryFn: () => api<(Named & { isDefault: boolean })[]>('/pricing/tiers') });
  const drivers = useQuery({ queryKey: ['drivers'], queryFn: () => api<Named[]>('/staff/drivers') });
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api<Named[]>('/menu/categories'), enabled: can('menu.read') });
  const dishes = useQuery({ queryKey: ['dishes'], queryFn: () => api<(Named & { active: boolean })[]>('/catalog/dishes'), enabled: can('catalog.read') });
  const employees = useQuery({
    queryKey: ['employees', 'company', id, debouncedOwnerSearch],
    queryFn: ({ signal }) => api<Page<Named>>('/employees', { query: { companyId: id, q: debouncedOwnerSearch, pageSize: 100 }, signal }),
    enabled: !isNew,
  });

  const [f, setF] = useState({
    name: '', domains: '', billingName: '', billingEmail: '', billingPhone: '', ownerEmployeeId: '', workingDays: [1, 2, 3, 4, 5] as number[],
    time: '12:00', deliveryLeadMin: 60, defaultPackagingTypeId: '', driverInstructions: '', defaultDriverId: '', priceTierId: '',
    hiddenCategoryIds: [] as string[], hiddenDishIds: [] as string[], addresses: [{ ...emptyAddress, isDefault: true }] as Address[],
  });
  useEffect(() => {
    const c = company.data;
    if (!c) return;
    setF({
      name: c.name, domains: c.domains.map((d) => d.domain).join(', '), billingName: c.billingName, billingEmail: c.billingEmail, billingPhone: c.billingPhone,
      ownerEmployeeId: c.ownerEmployeeId ?? '', workingDays: c.workingDays, time: hhmm(c.defaultDeliveryTimeMin), deliveryLeadMin: c.deliveryLeadMin,
      defaultPackagingTypeId: c.defaultPackagingTypeId, driverInstructions: c.driverInstructions, defaultDriverId: c.defaultDriverId ?? '', priceTierId: c.priceTierId ?? '',
      hiddenCategoryIds: c.hiddenCategories.map((h) => h.categoryId), hiddenDishIds: c.hiddenDishes.map((h) => h.dishId), addresses: c.addresses,
    });
  }, [company.data]);
  useEffect(() => {
    if (isNew && ref.data && !f.defaultPackagingTypeId) setF((x) => ({ ...x, defaultPackagingTypeId: ref.data['packaging-types'][0]?.id ?? '' }));
  }, [isNew, ref.data, f.defaultPackagingTypeId]);

  const save = useAction(() => {
    const body = {
      name: f.name, domains: f.domains.split(/[\s,]+/).filter(Boolean), billingName: f.billingName, billingEmail: f.billingEmail, billingPhone: f.billingPhone,
      ownerEmployeeId: f.ownerEmployeeId || null, workingDays: f.workingDays, defaultDeliveryTimeMin: parseHhMm(f.time) ?? -1, deliveryLeadMin: f.deliveryLeadMin,
      defaultPackagingTypeId: f.defaultPackagingTypeId, driverInstructions: f.driverInstructions, defaultDriverId: f.defaultDriverId || null, priceTierId: f.priceTierId || null,
      hiddenCategoryIds: f.hiddenCategoryIds, hiddenDishIds: f.hiddenDishIds, addresses: f.addresses,
    };
    return isNew ? post<{ id: string }>('/companies', body) : put<{ id: string }>(`/companies/${id}`, body);
  }, { invalidate: [['companies'], ['company', id]], onSuccess: (c) => isNew && router.replace(`/companies/${c.id}`) });

  if ((!isNew && !company.data) || !ref.data || !tiers.data) return <Loading />;
  const fe = save.fieldErrors;
  const set = (p: Partial<typeof f>) => setF({ ...f, ...p });
  const setAddr = (i: number, p: Partial<Address>) => set({ addresses: f.addresses.map((a, j) => (j === i ? { ...a, ...p } : p.isDefault ? { ...a, isDefault: false } : a)) });

  return (
    <>
      <PageHeader title={isNew ? 'New company' : f.name}>
        {!isNew && <LinkButton href={`/employees?companyId=${id}`}>Employees</LinkButton>}
        {!isNew && <LinkButton href={`/orders?companyId=${id}`}>Orders</LinkButton>}
        {editable && <Button variant="primary" disabled={save.isPending} onClick={() => save.run(undefined)}>Save company</Button>}
      </PageHeader>
      <div className="mb-6 max-w-3xl"><ErrorText>{save.error}</ErrorText></div>
      <fieldset disabled={!editable} className="max-w-4xl">
        <Section title="Company">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="Name" error={fe.name}><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="Email domains" error={fe.domains ?? fe['domains.0']} hint="Comma separated. Public domains like gmail.com are not allowed."><Input value={f.domains} onChange={(e) => set({ domains: e.target.value })} placeholder="acme.com, acme.co.uk" /></Field>
            <Field label="Billing contact" error={fe.billingName}><Input value={f.billingName} onChange={(e) => set({ billingName: e.target.value })} /></Field>
            <Field label="Billing email" error={fe.billingEmail}><Input value={f.billingEmail} onChange={(e) => set({ billingEmail: e.target.value })} /></Field>
            <Field label="Billing phone"><Input value={f.billingPhone} onChange={(e) => set({ billingPhone: e.target.value })} /></Field>
            <Field label="Owner" error={fe.ownerEmployeeId} hint={isNew ? 'Add employees first, then pick the owner.' : undefined}>
              <div className="flex flex-col gap-1">
              <Input value={ownerSearch} disabled={isNew} onChange={(e) => setOwnerSearch(e.target.value)} placeholder="Search employees" />
              <Select value={f.ownerEmployeeId} disabled={isNew} onChange={(e) => set({ ownerEmployeeId: e.target.value })}>
                <option value="">None yet</option>
                {employees.data?.items.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </Select>
              </div>
            </Field>
          </div>
        </Section>

        <Section title="Delivery addresses">
          <div className="flex flex-col gap-4">
            {f.addresses.map((a, i) => (
              <div key={a.id ?? `new${i}`} className="grid items-end gap-2 sm:grid-cols-[8rem_1fr_1fr_8rem_7rem_7rem_auto]">
                <Field label="Label" error={fe[`addresses.${i}.label`]}><Input value={a.label} onChange={(e) => setAddr(i, { label: e.target.value })} /></Field>
                <Field label="Street" error={fe[`addresses.${i}.line1`]}><Input value={a.line1} onChange={(e) => setAddr(i, { line1: e.target.value })} /></Field>
                <Field label="Suite / floor" error={fe[`addresses.${i}.line2`]}><Input value={a.line2} onChange={(e) => setAddr(i, { line2: e.target.value })} /></Field>
                <Field label="City" error={fe[`addresses.${i}.city`]}><Input value={a.city} onChange={(e) => setAddr(i, { city: e.target.value })} /></Field>
                <Field label="Postal code" error={fe[`addresses.${i}.postalCode`]}><Input value={a.postalCode} onChange={(e) => setAddr(i, { postalCode: e.target.value })} /></Field>
                <div className="pb-2"><Check label="Default" checked={a.isDefault} onChange={(e) => setAddr(i, { isDefault: e.target.checked })} /></div>
                {f.addresses.length > 1 && <Button variant="ghost" onClick={() => set({ addresses: f.addresses.filter((_, j) => j !== i) })}>Remove</Button>}
              </div>
            ))}
            <div><Button onClick={() => set({ addresses: [...f.addresses, { ...emptyAddress }] })}>Add address</Button></div>
            {fe.addresses && <p className="text-xs text-red-700">{fe.addresses}</p>}
          </div>
        </Section>

        <Section title="Deliveries">
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Default time" error={fe.defaultDeliveryTimeMin}><Input type="time" value={f.time} onChange={(e) => set({ time: e.target.value })} /></Field>
            <Field label="Leaves kitchen (min before)" error={fe.deliveryLeadMin}><Input type="number" value={f.deliveryLeadMin} onChange={(e) => set({ deliveryLeadMin: Number(e.target.value) })} /></Field>
            <Field label="Default packaging" error={fe.defaultPackagingTypeId}>
              <Select value={f.defaultPackagingTypeId} onChange={(e) => set({ defaultPackagingTypeId: e.target.value })}>{ref.data['packaging-types'].map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</Select>
            </Field>
            <Field label="Default driver" error={fe.defaultDriverId}>
              <Select value={f.defaultDriverId} onChange={(e) => set({ defaultDriverId: e.target.value })}><option value="">None</option>{drivers.data?.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</Select>
            </Field>
          </div>
          <Field label="Standing instructions for the driver" className="mt-3"><Textarea value={f.driverInstructions} onChange={(e) => set({ driverInstructions: e.target.value })} /></Field>
          <Field label="Working days (deliveries only on these days)" error={fe.workingDays} className="mt-3">
            <MultiPick options={WEEKDAYS.map((d) => ({ id: String(d), name: WEEKDAY_LABELS[d] }))} value={f.workingDays.map(String)} onChange={(v) => set({ workingDays: v.map(Number).sort() })} />
          </Field>
        </Section>

        <Section title="Menu and price">
          <Field label="Price tier" error={fe.priceTierId} className="max-w-xs">
            <Select value={f.priceTierId} onChange={(e) => set({ priceTierId: e.target.value })}>
              <option value="">Default ({tiers.data.find((t) => t.isDefault)?.name})</option>
              {tiers.data.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
          {cats.data && <Field label="Hidden categories" className="mt-3"><MultiPick options={cats.data} value={f.hiddenCategoryIds} onChange={(v) => set({ hiddenCategoryIds: v })} /></Field>}
          {dishes.data && <Field label="Hidden dishes" className="mt-3"><MultiPick options={dishes.data.filter((d) => d.active)} value={f.hiddenDishIds} onChange={(v) => set({ hiddenDishIds: v })} /></Field>}
        </Section>
      </fieldset>
      {!isNew && company.data && <Holidays company={company.data} editable={editable} />}
    </>
  );
}

function Holidays({ company, editable }: { company: CompanyDetail; editable: boolean }) {
  const [date, setDate] = useState('');
  const [name, setName] = useState('');
  const key = [['company', company.id]];
  const add = useAction(() => post(`/companies/${company.id}/holidays`, { date, name }), { invalidate: key, onSuccess: () => { setDate(''); setName(''); } });
  const remove = useAction((hid: string) => del(`/companies/${company.id}/holidays/${hid}`), { invalidate: key });
  return (
    <Section title="Company holidays">
      <p className="mb-3 text-sm text-stone-500">No deliveries on these dates. They do not move the cut-off; only kitchen holidays do.</p>
      <ul className="mb-3 text-sm">
        {company.holidays.map((h) => (
          <li key={h.id} className="flex items-center gap-3 py-1"><span className="w-28">{day(h.date)}</span><span className="flex-1">{h.name}</span>{editable && <Button variant="ghost" onClick={() => remove.run(h.id)}>Remove</Button>}</li>
        ))}
      </ul>
      {editable && (
        <div className="flex flex-wrap items-end gap-2">
          <Field label="Date" error={add.fieldErrors.date}><Input type="date" value={date} onChange={(e) => setDate(e.target.value)} /></Field>
          <Field label="Name" error={add.fieldErrors.name}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Office closed" /></Field>
          <Button onClick={() => add.run(undefined)} disabled={add.isPending}>Add holiday</Button>
          <ErrorText>{add.error}</ErrorText>
        </div>
      )}
    </Section>
  );
}
