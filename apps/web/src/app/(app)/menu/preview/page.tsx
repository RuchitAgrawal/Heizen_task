'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EmployeeMenu, Page } from '@fernleaf/shared';
import { api } from '@/lib/api';
import { money } from '@/lib/format';
import { Chip, Field, Input, Loading, PageHeader, Section } from '@/components/ui';

interface EmployeeRow { id: string; name: string; email: string; company: { name: string } }

export default function MenuPreview() {
  const [search, setSearch] = useState('');
  const [employee, setEmployee] = useState<EmployeeRow | null>(null);
  const [slug, setSlug] = useState('');
  const employees = useQuery({ queryKey: ['employees', 'search', search], queryFn: () => api<Page<EmployeeRow>>('/employees', { query: { q: search, pageSize: 8 } }), enabled: !employee });
  const menu = useQuery({
    queryKey: ['menu-preview', employee?.id, slug],
    queryFn: () => api<EmployeeMenu>('/menu/preview', { query: { employeeId: employee!.id, categorySlug: slug || undefined } }),
    enabled: !!employee,
  });

  return (
    <>
      <PageHeader title="Menu preview" />
      {!employee ? (
        <div className="max-w-md">
          <Input autoFocus placeholder="Search an employee" value={search} onChange={(e) => setSearch(e.target.value)} className="mb-2" />
          {employees.data?.items.map((e) => (
            <button key={e.id} onClick={() => setEmployee(e)} className="flex w-full justify-between rounded px-2 py-2 text-left text-sm hover:bg-stone-50">
              <span>{e.name}</span><span className="text-stone-500">{e.company.name}</span>
            </button>
          ))}
        </div>
      ) : (
        <>
          <div className="mb-6 flex flex-wrap items-end gap-4 text-sm">
            <div>Viewing as <span className="font-medium">{employee.name}</span>, {employee.company.name}. <button className="text-stone-600 underline" onClick={() => setEmployee(null)}>Change</button></div>
            <Field label="Open a secret category by slug"><Input value={slug} onChange={(e) => setSlug(e.target.value.trim())} placeholder="chefs-table" /></Field>
          </div>
          {!menu.data ? <Loading /> : (
            <>
              <p className="mb-6 text-sm text-stone-600">
                {menu.data.tier.name} prices{menu.data.tier.isCompanyTier ? ' (company tier)' : ' (default tier)'}.
                {menu.data.excludedForNoPrice > 0 && ` Left out for having no price on this tier: ${menu.data.excludedForNoPrice}.`}
              </p>
              {menu.data.categories.map((c) => (
                <Section key={c.id} title={c.name} aside={c.secret && <Chip tone="violet">Secret</Chip>}>
                  <div className="grid gap-x-10 gap-y-5 md:grid-cols-2">
                    {c.dishes.map((d) => (
                      <div key={d.id}>
                        <div className="flex items-baseline justify-between gap-3"><span className="font-medium">{d.name}</span><span className="tabular-nums">{money(d.priceCents)}</span></div>
                        <p className="text-sm text-stone-600">{d.description}</p>
                        <div className="mt-1 flex flex-wrap gap-1">
                          {d.dietaryTags.map((t) => <Chip key={t} tone="green">{t}</Chip>)}
                          {d.allergens.map((a) => <Chip key={a} tone={d.allergenConflicts.includes(a) ? 'red' : 'neutral'}>{a}</Chip>)}
                          {d.minOrderQty && <Chip tone="amber">Min {d.minOrderQty}</Chip>}
                        </div>
                        {d.groups.map((g) => (
                          <div key={g.id} className="mt-1 text-xs text-stone-600">
                            {g.name}{g.required ? '' : ' (optional)'}: {g.options.map((o) => `${o.name}${o.priceCents ? ` +${money(o.priceCents)}` : ''}`).join(', ')}
                            {g.usesPortions && `; sizes ${g.portions.map((p) => `${p.name}${p.extraCents ? ` +${money(p.extraCents)}` : ''}`).join(', ')}`}
                          </div>
                        ))}
                      </div>
                    ))}
                  </div>
                </Section>
              ))}
            </>
          )}
        </>
      )}
    </>
  );
}
