'use client';

import { Suspense, useEffect, useMemo, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { EmployeeMenu, MenuDish, Page, addDays, parseHhMm, priceCombination } from '@fernleaf/shared';
import { api, put, post } from '@/lib/api';
import { useDebouncedValue } from '@/lib/debounce';
import { useAction } from '@/lib/forms';
import { day, hhmm, money } from '@/lib/format';
import { useSession } from '@/lib/session';
import type { CompanyDetail, OrderDetail, Reference } from '@/lib/types';
import { Button, Chip, ErrorText, Field, Input, Loading, Num, PageHeader, Section, Select, Textarea } from '@/components/ui';

interface Combo { quantity: number; choices: Record<string, { optionId: string; portionSizeId: string | null }> }
interface Line { dishId: string; quantity: number; combos: Combo[] }
interface EmployeeRow {
  id: string; name: string; email: string; companyId: string; company: { id: string; name: string };
  canChooseAddress: boolean; canChangeDeliveryTime: boolean; canChangePackaging: boolean;
}

function OrderForm() {
  const router = useRouter();
  const params = useSearchParams();
  const editId = params.get('edit');
  const { clock, can } = useSession();
  const override = can('orders.override');

  const existing = useQuery({ queryKey: ['order', editId], queryFn: () => api<OrderDetail>(`/orders/${editId}`), enabled: !!editId });
  const [employeeId, setEmployeeId] = useState(params.get('employee') ?? '');
  const [search, setSearch] = useState('');
  const employeeSearch = useDebouncedValue(search);
  const [deliveryDate, setDate] = useState(addDays(clock.today, 3));
  const [addressId, setAddressId] = useState('');
  const [timeStr, setTimeStr] = useState('');
  const [packagingTypeId, setPackaging] = useState('');
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([]);
  const [loaded, setLoaded] = useState(false);

  // Edit mode: copy the saved order into the form once.
  useEffect(() => {
    const o = existing.data;
    if (!o || loaded) return;
    setEmployeeId(o.employee.id);
    setDate(o.deliveryDate);
    setAddressId(o.addressId);
    setTimeStr(hhmm(o.deliveryTimeMin));
    setPackaging(o.packagingTypeId);
    setNotes(o.notes);
    setLines(o.lines.map((l) => ({
      dishId: l.dishId,
      quantity: l.quantity,
      combos: l.combinations.map((c) => ({
        quantity: c.quantity,
        choices: Object.fromEntries(c.choices.map((ch) => [ch.groupId, { optionId: ch.optionId, portionSizeId: ch.portionSizeId }])),
      })),
    })));
    setLoaded(true);
  }, [existing.data, loaded]);

  const employees = useQuery({
    queryKey: ['employees', 'search', employeeSearch],
    queryFn: ({ signal }) => api<Page<EmployeeRow>>('/employees', { query: { q: employeeSearch, pageSize: 12 }, signal }),
    enabled: !employeeId,
  });
  const employee = useQuery({ queryKey: ['employee', employeeId], queryFn: () => api<EmployeeRow>(`/employees/${employeeId}`), enabled: !!employeeId });
  const company = useQuery({
    queryKey: ['company', employee.data?.companyId],
    queryFn: () => api<CompanyDetail>(`/companies/${employee.data!.companyId}`),
    enabled: !!employee.data,
  });
  const menu = useQuery({ queryKey: ['menu', 'orderable', employeeId], queryFn: () => api<EmployeeMenu>(`/menu/orderable/${employeeId}`), enabled: !!employeeId });
  const ref = useQuery({ queryKey: ['reference'], queryFn: () => api<Reference>('/reference') });

  // New orders start from the company defaults.
  useEffect(() => {
    const c = company.data;
    if (!c || editId) return;
    setAddressId((c.addresses.find((a) => a.isDefault) ?? c.addresses[0])?.id ?? '');
    setTimeStr(hhmm(c.defaultDeliveryTimeMin));
    setPackaging(c.defaultPackagingTypeId);
  }, [company.data, editId]);

  const dishes = useMemo(() => new Map((menu.data?.categories ?? []).flatMap((c) => c.dishes.map((d) => [d.id, d] as const))), [menu.data]);

  const submit = useAction(
    (place: boolean) => {
      const body = {
        deliveryDate,
        addressId: addressId || null,
        deliveryTimeMin: parseHhMm(timeStr),
        packagingTypeId: packagingTypeId || null,
        notes,
        place,
        lines: lines.map((l) => ({
          dishId: l.dishId,
          quantity: l.quantity,
          combinations: l.combos.map((c) => ({
            quantity: c.quantity,
            choices: Object.entries(c.choices).filter(([, v]) => v.optionId).map(([groupId, v]) => ({ groupId, optionId: v.optionId, portionSizeId: v.portionSizeId })),
          })),
        })),
      };
      return editId
        ? put<{ id: string }>(`/orders/${editId}`, { ...body, version: existing.data!.version })
        : post<{ id: string }>('/orders', { ...body, employeeId });
    },
    { invalidate: [['orders'], ['order', editId]], onSuccess: (o) => router.push(`/orders/${o!.id}`) },
  );

  if (editId && !loaded) return <Loading />;
  const e = employee.data;
  const c = company.data;
  const fe = submit.fieldErrors;
  const total = lines.reduce((a, l) => a + lineTotal(l, dishes.get(l.dishId)), 0);

  return (
    <>
      <PageHeader title={editId ? `Edit order #${existing.data?.number}` : 'New order'} />

      {!employeeId ? (
        <Section title="Who is it for?">
          <Input autoFocus placeholder="Search employees by name or email" value={search} onChange={(ev) => setSearch(ev.target.value)} className="mb-3 max-w-md" />
          <div className="flex flex-col">
            {employees.data?.items.map((x) => (
              <button key={x.id} className="flex justify-between rounded px-2 py-2 text-left text-sm hover:bg-stone-50" onClick={() => setEmployeeId(x.id)}>
                <span>{x.name} <span className="text-stone-500">{x.email}</span></span>
                <span className="text-stone-500">{x.company.name}</span>
              </button>
            ))}
          </div>
        </Section>
      ) : !e || !c || !menu.data ? <Loading /> : (
        <div className="grid gap-10 xl:grid-cols-[1fr_22rem]">
          <div>
            <Section title="Delivery" aside={!editId && <button className="text-sm text-stone-600 hover:underline" onClick={() => { setEmployeeId(''); setLines([]); }}>Change employee</button>}>
              <p className="mb-4 text-sm">{e.name}, {c.name} <span className="text-stone-500">({menu.data.tier.name} prices)</span></p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Delivery date" error={fe.deliveryDate} hint={day(deliveryDate)}>
                  <Input type="date" value={deliveryDate} onChange={(ev) => setDate(ev.target.value)} aria-invalid={!!fe.deliveryDate} />
                </Field>
                <Field label="Address" error={fe.addressId} hint={!e.canChooseAddress && !override ? 'Company default' : undefined}>
                  <Select value={addressId} disabled={!e.canChooseAddress && !override} onChange={(ev) => setAddressId(ev.target.value)}>
                    {c.addresses.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                  </Select>
                </Field>
                <Field label="Time" error={fe.deliveryTimeMin} hint={!e.canChangeDeliveryTime && !override ? 'Company default' : undefined}>
                  <Input type="time" value={timeStr} disabled={!e.canChangeDeliveryTime && !override} onChange={(ev) => setTimeStr(ev.target.value)} />
                </Field>
                <Field label="Packaging" error={fe.packagingTypeId} hint={!e.canChangePackaging && !override ? 'Company default' : undefined}>
                  <Select value={packagingTypeId} disabled={!e.canChangePackaging && !override} onChange={(ev) => setPackaging(ev.target.value)}>
                    {ref.data?.['packaging-types'].filter((p) => p.active || p.id === packagingTypeId).map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
                  </Select>
                </Field>
              </div>
            </Section>

            <Section title="Dishes">
              {lines.length === 0 && <p className="mb-4 text-sm text-stone-500">Add dishes from the menu.</p>}
              <div className="flex flex-col gap-8">
                {lines.map((l, i) => (
                  <LineEditor
                    key={l.dishId}
                    line={l}
                    dish={dishes.get(l.dishId)}
                    errors={Object.fromEntries(Object.entries(fe).filter(([k]) => k === `lines.${i}` || k.startsWith(`lines.${i}.`)).map(([k, v]) => [k.slice(`lines.${i}`.length + 1), v]))}
                    onChange={(next) => setLines(lines.map((x, j) => (j === i ? next : x)))}
                    onRemove={() => setLines(lines.filter((_, j) => j !== i))}
                  />
                ))}
              </div>
            </Section>

            <Field label="Notes for the kitchen" className="max-w-xl"><Textarea value={notes} onChange={(ev) => setNotes(ev.target.value)} /></Field>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-lg font-semibold">Total <Num>{money(total)}</Num></span>
              {(!editId || existing.data?.status === 'DRAFT') && <Button disabled={submit.isPending} onClick={() => submit.run(false)}>Save draft</Button>}
              <Button variant="primary" disabled={submit.isPending || lines.length === 0} onClick={() => submit.run(true)}>{editId && existing.data?.status === 'PLACED' ? 'Save changes' : 'Place order'}</Button>
            </div>
            <div className="mt-3 max-w-xl"><ErrorText>{submit.error && [submit.error, fe.lines].filter(Boolean).join('. ')}</ErrorText></div>
            <p className="mt-2 text-xs text-stone-500">Prices shown are a preview; the server recalculates them when you save.</p>
          </div>

          <MenuPicker menu={menu.data} taken={new Set(lines.map((l) => l.dishId))} onAdd={(d) => setLines([...lines, newLine(d)])} />
        </div>
      )}
    </>
  );
}

function newLine(d: MenuDish): Line {
  const qty = d.minOrderQty ?? 1;
  return { dishId: d.id, quantity: qty, combos: [{ quantity: qty, choices: {} }] };
}

function comboUnit(c: Combo, dish: MenuDish | undefined) {
  if (!dish) return 0;
  const extras = dish.groups.flatMap((g) => {
    const ch = c.choices[g.id];
    const opt = ch && g.options.find((o) => o.id === ch.optionId);
    if (!opt) return [];
    const portion = g.portions.find((p) => p.portionSizeId === ch.portionSizeId);
    return [opt.priceCents + (portion?.extraCents ?? 0)];
  });
  return priceCombination(dish.priceCents, extras, 1).unitCents;
}

function lineTotal(l: Line, dish: MenuDish | undefined) {
  return l.combos.reduce((a, c) => a + comboUnit(c, dish) * c.quantity, 0);
}

function LineEditor({ line, dish, errors, onChange, onRemove }: { line: Line; dish: MenuDish | undefined; errors: Record<string, string>; onChange: (l: Line) => void; onRemove: () => void }) {
  if (!dish) return <p className="text-sm text-red-700">A dish on this order is no longer on the employee’s menu. Remove it to continue. <button className="underline" onClick={onRemove}>Remove</button></p>;
  const sum = line.combos.reduce((a, c) => a + c.quantity, 0);
  const setCombo = (i: number, c: Combo) => onChange({ ...line, combos: line.combos.map((x, j) => (j === i ? c : x)) });
  const lineErrors = Object.entries(errors).filter(([k]) => !k.startsWith('combinations.'));

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-end gap-3">
        <div className="mr-auto">
          <div className="font-medium">{dish.name}</div>
          <div className="text-xs text-stone-500">{money(dish.priceCents)} each{dish.minOrderQty ? `, minimum ${dish.minOrderQty}` : ''}</div>
        </div>
        <Field label="Quantity" error={errors.quantity} className="w-24">
          <Input type="number" min={1} value={line.quantity} onChange={(ev) => {
            const q = Math.max(1, Number(ev.target.value) || 1);
            // A single combination follows the line quantity; with several, staff split it themselves.
            onChange(line.combos.length === 1 ? { ...line, quantity: q, combos: [{ ...line.combos[0], quantity: q }] } : { ...line, quantity: q });
          }} />
        </Field>
        <Button variant="ghost" onClick={onRemove}>Remove</Button>
      </div>
      {dish.allergenConflicts.length > 0 && <div className="mb-2"><Chip tone="red">Employee is allergic: {dish.allergenConflicts.join(', ')}</Chip></div>}

      {line.combos.map((c, i) => (
        <div key={i} className="flex flex-wrap items-end gap-3 py-2">
          <Field label={line.combos.length > 1 ? `Combination ${i + 1}` : 'How many'} error={errors[`combinations.${i}.quantity`]} className="w-24">
            <Input type="number" min={1} value={c.quantity} onChange={(ev) => setCombo(i, { ...c, quantity: Math.max(1, Number(ev.target.value) || 1) })} />
          </Field>
          {dish.groups.map((g) => {
            const ch = c.choices[g.id] ?? { optionId: '', portionSizeId: null };
            const set = (patch: Partial<typeof ch>) => setCombo(i, { ...c, choices: { ...c.choices, [g.id]: { ...ch, ...patch } } });
            return (
              <div key={g.id} className="flex gap-2">
                <Field label={`${g.name}${g.required ? '' : ' (optional)'}`}>
                  <Select value={ch.optionId} onChange={(ev) => set({ optionId: ev.target.value, portionSizeId: g.usesPortions ? (ch.portionSizeId ?? g.portions[0]?.portionSizeId ?? null) : null })}>
                    <option value="">{g.required ? 'Choose…' : 'None'}</option>
                    {g.options.map((o) => <option key={o.id} value={o.id}>{o.name}{o.priceCents ? ` +${money(o.priceCents)}` : ''}</option>)}
                  </Select>
                </Field>
                {g.usesPortions && ch.optionId && (
                  <Field label="Size">
                    <Select value={ch.portionSizeId ?? ''} onChange={(ev) => set({ portionSizeId: ev.target.value })}>
                      {g.portions.map((p) => <option key={p.portionSizeId} value={p.portionSizeId}>{p.name}{p.extraCents ? ` +${money(p.extraCents)}` : ''}</option>)}
                    </Select>
                  </Field>
                )}
              </div>
            );
          })}
          <div className="ml-auto text-right text-sm">
            <Num>{c.quantity} × {money(comboUnit(c, dish))}</Num>
            <div className="font-medium"><Num>{money(comboUnit(c, dish) * c.quantity)}</Num></div>
          </div>
          {line.combos.length > 1 && <Button variant="ghost" onClick={() => onChange({ ...line, combos: line.combos.filter((_, j) => j !== i) })}>×</Button>}
          {errors[`combinations.${i}`] && <p className="w-full text-xs text-red-700">{errors[`combinations.${i}`]}</p>}
          {Object.entries(errors).filter(([k]) => k.startsWith(`combinations.${i}.choices`)).map(([k, v]) => <p key={k} className="w-full text-xs text-red-700">{v}</p>)}
        </div>
      ))}

      <div className="flex flex-wrap items-center gap-3 text-sm">
        {dish.groups.length > 0 && <Button variant="ghost" onClick={() => onChange({ ...line, combos: [...line.combos, { quantity: Math.max(1, line.quantity - sum), choices: {} }] })}>Split into another combination</Button>}
        {sum !== line.quantity && <span className="text-amber-700">Combinations add up to {sum} of {line.quantity}</span>}
        {errors.combinations && <span className="text-red-700">{errors.combinations}</span>}
        {lineErrors.map(([k, v]) => <span key={k} className="text-red-700">{v}</span>)}
        <span className="ml-auto font-medium">Line <Num>{money(lineTotal(line, dish))}</Num></span>
      </div>
    </div>
  );
}

function MenuPicker({ menu, taken, onAdd }: { menu: EmployeeMenu; taken: Set<string>; onAdd: (d: MenuDish) => void }) {
  return (
    <aside className="xl:sticky xl:top-6 xl:max-h-[calc(100vh-3rem)] xl:overflow-y-auto">
      <h2 className="mb-1 text-sm font-semibold uppercase tracking-wide text-stone-500">Menu</h2>
      <p className="mb-4 text-xs text-stone-500">{menu.tier.name} prices{menu.excludedForNoPrice ? `. Hidden for no price on this tier: ${menu.excludedForNoPrice}` : ''}</p>
      {menu.categories.map((cat) => (
        <div key={cat.id} className="mb-5">
          <div className="mb-1 text-sm font-medium">{cat.name} {cat.secret && <Chip tone="violet">Secret</Chip>}</div>
          {cat.dishes.map((d) => (
            <button key={d.id} disabled={taken.has(d.id)} onClick={() => onAdd(d)} className="flex w-full items-baseline justify-between gap-2 rounded px-2 py-1.5 text-left text-sm hover:bg-stone-50 disabled:opacity-40">
              <span>{d.name}{d.allergenConflicts.length > 0 && <span className="ml-1 text-xs text-red-700">allergy</span>}</span>
              <Num className="text-stone-600">{money(d.priceCents)}</Num>
            </button>
          ))}
        </div>
      ))}
    </aside>
  );
}

export default function NewOrderPage() {
  return <Suspense><OrderForm /></Suspense>;
}
