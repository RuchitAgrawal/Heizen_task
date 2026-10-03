'use client';

import { use, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { parseDollars } from '@fernleaf/shared';
import { api, del, post, put } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { money } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Reference } from '@/lib/types';
import { MultiPick } from '@/components/multi';
import { Button, Check, Chip, ErrorText, Field, Input, Loading, PageHeader, Section, Select, Textarea } from '@/components/ui';

interface Group {
  id: string; name: string; required: boolean; sortOrder: number; usesPortions: boolean;
  items: { optionId: string; option: { id: string; name: string; portionSizes: { id: string }[] } }[];
  portions: { portionSizeId: string; extraCents: number; portionSize: { name: string } }[];
}
interface Dish {
  id: string; name: string; description: string; imageUrl: string; sku: string; temperature: 'HOT' | 'COLD'; costCents: number;
  stationId: string | null; minOrderQty: number | null; active: boolean; allergens: { id: string }[]; dietaryTags: { id: string }[]; groups: Group[];
}

export default function DishPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const isNew = id === 'new';
  const router = useRouter();
  const { can } = useSession();
  const editable = can('catalog.write');
  const dish = useQuery({ queryKey: ['dish', id], queryFn: () => api<Dish>(`/catalog/dishes/${id}`), enabled: !isNew });
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api<Reference>('/reference') });
  const [f, setF] = useState({ name: '', description: '', imageUrl: '', sku: '', temperature: 'HOT' as 'HOT' | 'COLD', cost: '', stationId: '', minOrderQty: '', active: true, allergenIds: [] as string[], dietaryTagIds: [] as string[] });

  useEffect(() => {
    const d = dish.data;
    if (d) setF({ name: d.name, description: d.description, imageUrl: d.imageUrl, sku: d.sku, temperature: d.temperature, cost: (d.costCents / 100).toFixed(2), stationId: d.stationId ?? '', minOrderQty: d.minOrderQty ? String(d.minOrderQty) : '', active: d.active, allergenIds: d.allergens.map((x) => x.id), dietaryTagIds: d.dietaryTags.map((x) => x.id) });
  }, [dish.data]);

  const save = useAction(() => {
    const body = { name: f.name, description: f.description, imageUrl: f.imageUrl, sku: f.sku, temperature: f.temperature, costCents: parseDollars(f.cost) ?? -1, stationId: f.stationId || null, minOrderQty: f.minOrderQty ? Number(f.minOrderQty) : null, active: f.active, allergenIds: f.allergenIds, dietaryTagIds: f.dietaryTagIds };
    return isNew ? post<{ id: string }>('/catalog/dishes', body) : put<{ id: string }>(`/catalog/dishes/${id}`, body);
  }, { invalidate: [['dishes'], ['dish', id]], onSuccess: (d) => isNew && router.replace(`/catalog/dishes/${d.id}`) });

  if ((!isNew && !dish.data) || !ref.data) return <Loading />;
  const fe = save.fieldErrors;
  const set = (patch: Partial<typeof f>) => setF({ ...f, ...patch });

  return (
    <>
      <PageHeader title={isNew ? 'New dish' : f.name || 'Dish'}>
        {!f.active && <Chip>Inactive: kept for past orders, hidden from menus</Chip>}
      </PageHeader>
      <Section title="Details">
        <fieldset disabled={!editable} className="grid max-w-3xl gap-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <Field label="Name" error={fe.name} className="sm:col-span-2"><Input value={f.name} onChange={(e) => set({ name: e.target.value })} /></Field>
            <Field label="SKU" error={fe.sku}><Input value={f.sku} onChange={(e) => set({ sku: e.target.value })} /></Field>
          </div>
          <Field label="Description" error={fe.description}><Textarea value={f.description} onChange={(e) => set({ description: e.target.value })} /></Field>
          <Field label="Image URL" error={fe.imageUrl}><Input value={f.imageUrl} onChange={(e) => set({ imageUrl: e.target.value })} placeholder="https://…" /></Field>
          <div className="grid gap-3 sm:grid-cols-4">
            <Field label="Temperature"><Select value={f.temperature} onChange={(e) => set({ temperature: e.target.value as 'HOT' | 'COLD' })}><option value="HOT">Hot</option><option value="COLD">Cold</option></Select></Field>
            <Field label="Cost ($)" error={fe.costCents}><Input value={f.cost} onChange={(e) => set({ cost: e.target.value })} /></Field>
            <Field label="Kitchen station" error={fe.stationId}>
              <Select value={f.stationId} onChange={(e) => set({ stationId: e.target.value })}>
                <option value="">Unassigned</option>
                {ref.data.stations.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
              </Select>
            </Field>
            <Field label="Minimum order" error={fe.minOrderQty}><Input type="number" min={1} value={f.minOrderQty} onChange={(e) => set({ minOrderQty: e.target.value })} placeholder="None" /></Field>
          </div>
          <Field label="Allergens"><MultiPick options={ref.data.allergens} value={f.allergenIds} onChange={(v) => set({ allergenIds: v })} /></Field>
          <Field label="Dietary tags"><MultiPick options={ref.data['dietary-tags']} value={f.dietaryTagIds} onChange={(v) => set({ dietaryTagIds: v })} /></Field>
          <Check label="Active (on menus)" checked={f.active} onChange={(e) => set({ active: e.target.checked })} />
          {editable && <div><Button variant="primary" disabled={save.isPending} onClick={() => save.run(undefined)}>Save dish</Button></div>}
          <ErrorText>{save.error}</ErrorText>
        </fieldset>
      </Section>
      {!isNew && dish.data && <Groups dish={dish.data} editable={editable} />}
    </>
  );
}

function Groups({ dish, editable }: { dish: Dish; editable: boolean }) {
  const [editing, setEditing] = useState<Group | 'new' | null>(null);
  return (
    <Section title="Option groups" aside={editable && <Button onClick={() => setEditing('new')}>Add group</Button>}>
      {editing && <GroupForm dishId={dish.id} group={editing === 'new' ? null : editing} nextOrder={dish.groups.length} onDone={() => setEditing(null)} />}
      {dish.groups.length === 0 && !editing && <p className="text-sm text-stone-500">No option groups. The dish is ordered as listed.</p>}
      <div className="flex flex-col gap-5">
        {dish.groups.map((g) => (
          <div key={g.id} className="text-sm">
            <div className="flex items-baseline gap-2">
              <span className="font-medium">{g.name}</span>
              <Chip tone={g.required ? 'violet' : 'neutral'}>{g.required ? 'Required' : 'Optional'}</Chip>
              {g.usesPortions && <span className="text-stone-500">Sizes: {g.portions.map((p) => `${p.portionSize.name}${p.extraCents ? ` +${money(p.extraCents)}` : ''}`).join(', ')}</span>}
              {editable && <button className="ml-auto text-stone-600 hover:underline" onClick={() => setEditing(g)}>Edit</button>}
            </div>
            <div className="text-stone-600">{g.items.map((i, n) => `${n + 1}. ${i.option.name}`).join('   ')}</div>
          </div>
        ))}
      </div>
    </Section>
  );
}

function GroupForm({ dishId, group, nextOrder, onDone }: { dishId: string; group: Group | null; nextOrder: number; onDone: () => void }) {
  const options = useQuery({ queryKey: ['options'], queryFn: () => api<{ id: string; name: string; active: boolean; portionSizes: { id: string }[] }[]>('/catalog/options') });
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api<Reference>('/reference') });
  const [name, setName] = useState(group?.name ?? '');
  const [required, setRequired] = useState(group?.required ?? true);
  const [sortOrder, setSortOrder] = useState(group?.sortOrder ?? nextOrder);
  const [usesPortions, setUses] = useState(group?.usesPortions ?? false);
  const [optionIds, setOptionIds] = useState<string[]>(group?.items.map((i) => i.optionId) ?? []);
  const [portions, setPortions] = useState<Record<string, string>>(Object.fromEntries((group?.portions ?? []).map((p) => [p.portionSizeId, (p.extraCents / 100).toFixed(2)])));
  const invalidate = [['dish', dishId], ['dishes']];
  const save = useAction(() => {
    const body = { name, required, sortOrder, usesPortions, optionIds, portions: usesPortions ? Object.entries(portions).map(([portionSizeId, v]) => ({ portionSizeId, extraCents: parseDollars(v || '0') ?? -1 })) : [] };
    return group ? put(`/catalog/groups/${group.id}`, body) : post(`/catalog/dishes/${dishId}/groups`, body);
  }, { invalidate, onSuccess: onDone });
  const remove = useAction(() => del(`/catalog/groups/${group!.id}`), { invalidate, onSuccess: onDone });
  const fe = save.fieldErrors;
  if (!options.data || !ref.data) return <Loading />;
  const byId = new Map(options.data.map((o) => [o.id, o]));
  const move = (i: number, d: number) => {
    const next = [...optionIds];
    [next[i], next[i + d]] = [next[i + d], next[i]];
    setOptionIds(next);
  };

  return (
    <div className="mb-6 grid max-w-3xl gap-4 rounded-md bg-stone-50 p-4">
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Group name" error={fe.name}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Choose your protein" /></Field>
        <Field label="Display order"><Input type="number" value={sortOrder} onChange={(e) => setSortOrder(Number(e.target.value))} className="w-24" /></Field>
        <div className="flex gap-4 pb-2"><Check label="Required" checked={required} onChange={(e) => setRequired(e.target.checked)} /><Check label="Sold in sizes" checked={usesPortions} onChange={(e) => setUses(e.target.checked)} /></div>
      </div>
      <Field label="Options, in display order" error={fe.optionIds}>
        <div className="flex flex-col gap-1">
          {optionIds.map((oid, i) => (
            <div key={oid} className="flex items-center gap-2 text-sm">
              <span className="w-5 text-stone-500">{i + 1}.</span><span className="flex-1">{byId.get(oid)?.name}</span>
              <Button variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
              <Button variant="ghost" disabled={i === optionIds.length - 1} onClick={() => move(i, 1)}>↓</Button>
              <Button variant="ghost" onClick={() => setOptionIds(optionIds.filter((x) => x !== oid))}>Remove</Button>
            </div>
          ))}
          <Select value="" onChange={(e) => e.target.value && setOptionIds([...optionIds, e.target.value])} className="max-w-xs">
            <option value="">Add an option…</option>
            {options.data.filter((o) => o.active && !optionIds.includes(o.id)).map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </Select>
        </div>
      </Field>
      {usesPortions && (
        <Field label="Sizes and extra charge ($)" error={fe.portions} hint="Every option in the group must support every size you pick.">
          <div className="flex flex-wrap gap-3">
            {ref.data['portion-sizes'].map((p) => (
              <label key={p.id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" className="accent-emerald-800" checked={p.id in portions} onChange={(e) => { const n = { ...portions }; if (e.target.checked) n[p.id] = '0.00'; else delete n[p.id]; setPortions(n); }} />
                {p.name}
                {p.id in portions && <Input value={portions[p.id]} onChange={(e) => setPortions({ ...portions, [p.id]: e.target.value })} className="w-20" />}
              </label>
            ))}
          </div>
        </Field>
      )}
      <div className="flex gap-2">
        <Button variant="primary" disabled={save.isPending} onClick={() => save.run(undefined)}>Save group</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
        {group && <Button variant="danger" className="ml-auto" onClick={() => window.confirm(`Delete "${group.name}"? Past orders keep their choices.`) && remove.run(undefined)}>Delete group</Button>}
      </div>
      <ErrorText>{save.error ?? remove.error}</ErrorText>
    </div>
  );
}
