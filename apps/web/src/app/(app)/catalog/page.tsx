'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { parseDollars } from '@fernleaf/shared';
import { api, post, put } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { money } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { Reference } from '@/lib/types';
import { MultiPick } from '@/components/multi';
import { Button, Check, Chip, ErrorText, Field, Input, LinkButton, Loading, Num, PageHeader, Section, Table, Td, Th, Tr } from '@/components/ui';

interface DishRow { id: string; name: string; sku: string; temperature: string; costCents: number; active: boolean; minOrderQty: number | null; station: { name: string } | null; allergens: { name: string }[]; dietaryTags: { name: string }[]; _count: { groups: number } }
interface OptionRow { id: string; name: string; costCents: number; active: boolean; allergens: { id: string; name: string }[]; dietaryTags: { id: string; name: string }[]; portionSizes: { id: string; name: string }[]; _count: { groupItems: number } }

export default function CatalogPage() {
  const { can } = useSession();
  const [tab, setTab] = useState<'dishes' | 'options'>('dishes');
  const [q, setQ] = useState('');
  const dishes = useQuery({ queryKey: ['dishes'], queryFn: () => api<DishRow[]>('/catalog/dishes') });
  const options = useQuery({ queryKey: ['options'], queryFn: () => api<OptionRow[]>('/catalog/options') });
  const [editing, setEditing] = useState<OptionRow | 'new' | null>(null);
  const match = (s: string) => s.toLowerCase().includes(q.toLowerCase());

  return (
    <>
      <PageHeader title="Catalogue">
        {can('catalog.write') && (tab === 'dishes' ? <LinkButton variant="primary" href="/catalog/dishes/new">New dish</LinkButton> : <Button variant="primary" onClick={() => setEditing('new')}>New option</Button>)}
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex gap-1">
          <Button variant={tab === 'dishes' ? 'primary' : 'ghost'} onClick={() => setTab('dishes')}>Dishes</Button>
          <Button variant={tab === 'options' ? 'primary' : 'ghost'} onClick={() => setTab('options')}>Options</Button>
        </div>
        <Input placeholder="Filter" value={q} onChange={(e) => setQ(e.target.value)} className="w-64" />
      </div>

      {tab === 'dishes' ? (!dishes.data ? <Loading /> : (
        <Table>
          <thead><Tr><Th>SKU</Th><Th>Dish</Th><Th>Station</Th><Th>Temp</Th><Th className="text-right">Cost</Th><Th className="text-right">Groups</Th><Th>Allergens</Th><Th>Dietary</Th><Th /></Tr></thead>
          <tbody>
            {dishes.data.filter((d) => match(d.name) || d.sku.includes(q)).map((d) => (
              <Tr key={d.id} className={d.active ? '' : 'text-stone-400'}>
                <Td><Num>{d.sku}</Num></Td>
                <Td><Link href={`/catalog/dishes/${d.id}`} className="font-medium hover:underline">{d.name}</Link>{d.minOrderQty ? <span className="text-xs text-stone-500"> min {d.minOrderQty}</span> : null}</Td>
                <Td>{d.station?.name ?? <span className="text-stone-400">Unassigned</span>}</Td>
                <Td>{d.temperature === 'HOT' ? 'Hot' : 'Cold'}</Td>
                <Td className="text-right"><Num>{money(d.costCents)}</Num></Td>
                <Td className="text-right"><Num>{d._count.groups}</Num></Td>
                <Td className="text-xs">{d.allergens.map((a) => a.name).join(', ')}</Td>
                <Td className="text-xs">{d.dietaryTags.map((a) => a.name).join(', ')}</Td>
                <Td>{!d.active && <Chip>Inactive</Chip>}</Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      )) : (!options.data ? <Loading /> : (
        <>
          {editing && <OptionForm option={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
          <Table>
            <thead><Tr><Th>Option</Th><Th className="text-right">Cost</Th><Th>Sizes</Th><Th>Allergens</Th><Th>Dietary</Th><Th className="text-right">Used in groups</Th><Th /></Tr></thead>
            <tbody>
              {options.data.filter((o) => match(o.name)).map((o) => (
                <Tr key={o.id} className={o.active ? '' : 'text-stone-400'}>
                  <Td className="font-medium">{o.name}</Td>
                  <Td className="text-right"><Num>{money(o.costCents)}</Num></Td>
                  <Td className="text-xs">{o.portionSizes.map((p) => p.name).join(', ')}</Td>
                  <Td className="text-xs">{o.allergens.map((a) => a.name).join(', ')}</Td>
                  <Td className="text-xs">{o.dietaryTags.map((a) => a.name).join(', ')}</Td>
                  <Td className="text-right"><Num>{o._count.groupItems}</Num></Td>
                  <Td className="text-right">{can('catalog.write') && <Button variant="ghost" onClick={() => setEditing(o)}>Edit</Button>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </>
      ))}
    </>
  );
}

function OptionForm({ option, onDone }: { option: OptionRow | null; onDone: () => void }) {
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api<Reference>('/reference') });
  const [name, setName] = useState(option?.name ?? '');
  const [cost, setCost] = useState(option ? (option.costCents / 100).toFixed(2) : '');
  const [active, setActive] = useState(option?.active ?? true);
  const [allergenIds, setA] = useState(option?.allergens.map((x) => x.id) ?? []);
  const [dietaryTagIds, setD] = useState(option?.dietaryTags.map((x) => x.id) ?? []);
  const [portionSizeIds, setP] = useState(option?.portionSizes.map((x) => x.id) ?? []);
  const save = useAction(() => {
    const body = { name, costCents: parseDollars(cost) ?? -1, active, allergenIds, dietaryTagIds, portionSizeIds };
    return option ? put(`/catalog/options/${option.id}`, body) : post('/catalog/options', body);
  }, { invalidate: [['options']], onSuccess: onDone });
  const fe = save.fieldErrors;
  if (!ref.data) return <Loading />;
  return (
    <Section title={option ? `Edit ${option.name}` : 'New option'}>
      <div className="grid max-w-3xl gap-4">
        <div className="flex flex-wrap gap-3">
          <Field label="Name" error={fe.name}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
          <Field label="Cost ($)" error={fe.costCents}><Input value={cost} onChange={(e) => setCost(e.target.value)} className="w-28" /></Field>
          <div className="self-end pb-2"><Check label="Active" checked={active} onChange={(e) => setActive(e.target.checked)} /></div>
        </div>
        <Field label="Allergens"><MultiPick options={ref.data.allergens} value={allergenIds} onChange={setA} /></Field>
        <Field label="Dietary tags"><MultiPick options={ref.data['dietary-tags']} value={dietaryTagIds} onChange={setD} /></Field>
        <Field label="Sold in sizes" error={fe.portionSizeIds}><MultiPick options={ref.data['portion-sizes']} value={portionSizeIds} onChange={setP} /></Field>
        <div className="flex gap-2"><Button variant="primary" disabled={save.isPending} onClick={() => save.run(undefined)}>Save option</Button><Button variant="ghost" onClick={onDone}>Cancel</Button></div>
        <ErrorText>{save.error}</ErrorText>
      </div>
    </Section>
  );
}
