'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, post, put } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { useSession } from '@/lib/session';
import { Button, Check, Chip, ErrorText, Field, Input, LinkButton, Loading, PageHeader, Section, Select } from '@/components/ui';

interface Category {
  id: string; name: string; slug: string; sortOrder: number; active: boolean; secret: boolean;
  items: { dishId: string; sortOrder: number; active: boolean; dish: { id: string; name: string; sku: string; active: boolean } }[];
  hiddenFor: { company: { id: string; name: string } }[];
}

export default function MenuPage() {
  const { can } = useSession();
  const editable = can('menu.write');
  const cats = useQuery({ queryKey: ['categories'], queryFn: () => api<Category[]>('/menu/categories') });
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  if (!cats.data) return <Loading />;
  return (
    <>
      <PageHeader title="Menu">
        <LinkButton href="/menu/preview">Preview as an employee</LinkButton>
        {editable && <Button variant="primary" onClick={() => setEditing('new')}>New category</Button>}
      </PageHeader>
      <p className="mb-6 max-w-2xl text-sm text-stone-500">Secret categories are not listed but can be reached by their slug. Hiding per company is set on each company. Dishes also need a price on the company’s tier to appear.</p>
      {editing && <CategoryForm category={editing === 'new' ? null : editing} onDone={() => setEditing(null)} />}
      {cats.data.map((c) => <CategoryBlock key={c.id} c={c} editable={editable} onEdit={() => setEditing(c)} />)}
    </>
  );
}

function CategoryBlock({ c, editable, onEdit }: { c: Category; editable: boolean; onEdit: () => void }) {
  const dishes = useQuery({ queryKey: ['dishes'], queryFn: () => api<{ id: string; name: string; active: boolean }[]>('/catalog/dishes'), enabled: editable });
  const [items, setItems] = useState(c.items.map((i) => ({ dishId: i.dishId, active: i.active, name: i.dish.name, dishActive: i.dish.active })));
  const dirty = JSON.stringify(items.map((i) => [i.dishId, i.active])) !== JSON.stringify(c.items.map((i) => [i.dishId, i.active]));
  const save = useAction(() => put(`/menu/categories/${c.id}/items`, { items: items.map((i, n) => ({ dishId: i.dishId, active: i.active, sortOrder: n + 1 })) }), { invalidate: [['categories']] });
  const move = (i: number, d: number) => { const n = [...items]; [n[i], n[i + d]] = [n[i + d], n[i]]; setItems(n); };

  return (
    <Section
      title={`${c.sortOrder + 1}. ${c.name}`}
      aside={<div className="flex items-center gap-2">
        {!c.active && <Chip>Inactive</Chip>}{c.secret && <Chip tone="violet">Secret: {c.slug}</Chip>}
        {c.hiddenFor.length > 0 && <Chip tone="amber">Hidden for {c.hiddenFor.map((h) => h.company.name).join(', ')}</Chip>}
        {editable && <Button variant="ghost" onClick={onEdit}>Edit</Button>}
      </div>}
    >
      <ol className="flex flex-col">
        {items.map((it, i) => (
          <li key={it.dishId} className="flex items-center gap-3 py-1 text-sm">
            <span className="w-6 text-stone-500">{i + 1}.</span>
            <span className={`flex-1 ${!it.active || !it.dishActive ? 'text-stone-400' : ''}`}>{it.name}{!it.dishActive && ' (dish inactive)'}</span>
            {editable && (
              <>
                <Check label="Shown" checked={it.active} onChange={(e) => setItems(items.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} />
                <Button variant="ghost" disabled={i === 0} onClick={() => move(i, -1)}>↑</Button>
                <Button variant="ghost" disabled={i === items.length - 1} onClick={() => move(i, 1)}>↓</Button>
                <Button variant="ghost" onClick={() => setItems(items.filter((_, j) => j !== i))}>Remove</Button>
              </>
            )}
          </li>
        ))}
      </ol>
      {editable && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <Select value="" className="max-w-xs" onChange={(e) => { const d = dishes.data?.find((x) => x.id === e.target.value); if (d) setItems([...items, { dishId: d.id, active: true, name: d.name, dishActive: d.active }]); }}>
            <option value="">Add a dish…</option>
            {dishes.data?.filter((d) => !items.some((i) => i.dishId === d.id)).map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          {dirty && <Button variant="primary" disabled={save.isPending} onClick={() => save.run(undefined)}>Save order and items</Button>}
          <ErrorText>{save.error}</ErrorText>
        </div>
      )}
    </Section>
  );
}

function CategoryForm({ category, onDone }: { category: Category | null; onDone: () => void }) {
  const [f, setF] = useState({ name: category?.name ?? '', slug: category?.slug ?? '', sortOrder: category?.sortOrder ?? 0, active: category?.active ?? true, secret: category?.secret ?? false });
  const save = useAction(() => (category ? put(`/menu/categories/${category.id}`, f) : post('/menu/categories', f)), { invalidate: [['categories']], onSuccess: onDone });
  const fe = save.fieldErrors;
  return (
    <Section title={category ? `Edit ${category.name}` : 'New category'}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Name" error={fe.name}><Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value, slug: category ? f.slug : e.target.value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') })} /></Field>
        <Field label="Slug" error={fe.slug}><Input value={f.slug} onChange={(e) => setF({ ...f, slug: e.target.value })} /></Field>
        <Field label="Position"><Input type="number" value={f.sortOrder} onChange={(e) => setF({ ...f, sortOrder: Number(e.target.value) })} className="w-20" /></Field>
        <div className="flex gap-4 pb-2"><Check label="Active" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /><Check label="Secret" checked={f.secret} onChange={(e) => setF({ ...f, secret: e.target.checked })} /></div>
        <Button variant="primary" disabled={save.isPending} onClick={() => save.run(undefined)}>Save</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      <div className="mt-2"><ErrorText>{save.error}</ErrorText></div>
    </Section>
  );
}
