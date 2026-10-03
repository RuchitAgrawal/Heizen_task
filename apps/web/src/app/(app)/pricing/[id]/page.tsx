'use client';

import { Suspense, use, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { TierGridRow, formatCents, parseDollars } from '@fernleaf/shared';
import { api, put } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { money } from '@/lib/format';
import { useSession } from '@/lib/session';
import { Button, Check, Chip, ErrorText, Input, Loading, Num, PageHeader, Table, Td, Th, Tr } from '@/components/ui';

type Grid = { tier: { id: string; name: string }; rows: TierGridRow[] };
const key = (r: Pick<TierGridRow, 'kind' | 'itemId'>) => `${r.kind}:${r.itemId}`;

/**
 * Spreadsheet-style editor for one tier. Each cell is the stored price; blank means
 * "no stored price" (derived tiers then fall back to the rule, manual tiers to no price).
 */
function TierGrid({ id }: { id: string }) {
  const { can } = useSession();
  const params = useSearchParams();
  const editable = can('pricing.write');
  const q = useQuery({ queryKey: ['tier-grid', id], queryFn: () => api<Grid>(`/pricing/tiers/${id}/grid`) });
  const [draft, setDraft] = useState<Record<string, string>>({});
  const [missingOnly, setMissingOnly] = useState(params.get('missing') === '1');
  const [kind, setKind] = useState<'all' | 'dish' | 'option'>('all');
  const [search, setSearch] = useState('');

  const changes = useMemo(() => {
    if (!q.data) return { updates: [], invalid: [] as string[] };
    const updates: { kind: 'dish' | 'option'; itemId: string; cents: number | null }[] = [];
    const invalid: string[] = [];
    for (const r of q.data.rows) {
      const v = draft[key(r)];
      if (v === undefined) continue;
      const cents = v.trim() === '' ? null : parseDollars(v);
      if (v.trim() !== '' && cents === null) invalid.push(r.name);
      else if (cents !== r.storedCents) updates.push({ kind: r.kind, itemId: r.itemId, cents });
    }
    return { updates, invalid };
  }, [draft, q.data]);

  const save = useAction(() => put<Grid>(`/pricing/tiers/${id}/prices`, { updates: changes.updates }), {
    invalidate: [['tier-grid', id], ['tiers']],
    onSuccess: () => setDraft({}),
  });

  if (!q.data) return <Loading />;
  const rows = q.data.rows.filter(
    (r) => (kind === 'all' || r.kind === kind) && (!missingOnly || (r.effectiveCents === null && r.active)) && (!search || r.name.toLowerCase().includes(search.toLowerCase()) || r.sku?.includes(search)),
  );
  const missing = q.data.rows.filter((r) => r.kind === 'dish' && r.active && r.effectiveCents === null).length;

  return (
    <>
      <PageHeader title={`${q.data.tier.name} prices`}>
        {editable && (
          <>
            {changes.updates.length > 0 && <Button variant="ghost" onClick={() => setDraft({})}>Discard</Button>}
            <Button variant="primary" disabled={!changes.updates.length || changes.invalid.length > 0 || save.isPending} onClick={() => save.run(undefined)}>
              Save {changes.updates.length || ''} change{changes.updates.length === 1 ? '' : 's'}
            </Button>
          </>
        )}
      </PageHeader>
      <div className="mb-4 flex flex-wrap items-center gap-4">
        <Input placeholder="Filter by name or SKU" value={search} onChange={(e) => setSearch(e.target.value)} className="w-64" />
        <div className="flex gap-1">
          {(['all', 'dish', 'option'] as const).map((k) => <Button key={k} variant={kind === k ? 'primary' : 'ghost'} onClick={() => setKind(k)}>{k === 'all' ? 'All' : k === 'dish' ? 'Dishes' : 'Options'}</Button>)}
        </div>
        <Check label={`Only missing a price (${missing} active dishes)`} checked={missingOnly} onChange={(e) => setMissingOnly(e.target.checked)} />
      </div>
      <ErrorText>{save.error ?? (changes.invalid.length ? `Not a valid price: ${changes.invalid.join(', ')}` : null)}</ErrorText>
      <Table>
        <thead>
          <Tr><Th>Item</Th><Th>Type</Th><Th className="text-right">Cost</Th><Th className="w-36">Stored price</Th><Th className="text-right">Effective price</Th><Th>Source</Th><Th className="text-right">Margin</Th></Tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const k = key(r);
            const dirty = draft[k] !== undefined && (draft[k].trim() === '' ? null : parseDollars(draft[k])) !== r.storedCents;
            return (
              <Tr key={k} className={!r.active ? 'text-stone-400' : ''}>
                <Td>{r.name} {r.sku && <span className="text-xs text-stone-500">{r.sku}</span>} {!r.active && <Chip>Inactive</Chip>}</Td>
                <Td className="text-stone-500">{r.kind === 'dish' ? 'Dish' : 'Option'}</Td>
                <Td className="text-right"><Num>{money(r.costCents)}</Num></Td>
                <Td className="py-1">
                  {editable ? (
                    <Input
                      inputMode="decimal"
                      aria-label={`${r.name} price`}
                      className={dirty ? 'bg-amber-50 ring-1 ring-amber-400' : ''}
                      placeholder={r.source === 'DERIVED' ? 'derived' : 'none'}
                      value={draft[k] ?? (r.storedCents === null ? '' : formatCents(r.storedCents).replace(/[$,]/g, ''))}
                      onChange={(e) => setDraft({ ...draft, [k]: e.target.value })}
                    />
                  ) : <Num>{r.storedCents === null ? '' : money(r.storedCents)}</Num>}
                </Td>
                <Td className="text-right">{r.effectiveCents === null ? <Chip tone={r.active ? 'amber' : 'neutral'}>No price</Chip> : <Num>{money(r.effectiveCents)}</Num>}</Td>
                <Td className="text-stone-500">{r.source === 'OVERRIDE' ? 'Typed' : r.source === 'DERIVED' ? 'Derived' : ''}</Td>
                <Td className="text-right text-stone-500"><Num>{r.effectiveCents ? `${Math.round(((r.effectiveCents - r.costCents) / r.effectiveCents) * 100)}%` : ''}</Num></Td>
              </Tr>
            );
          })}
        </tbody>
      </Table>
      <p className="mt-3 text-xs text-stone-500">Clear a cell to remove the stored price. Dishes with no effective price are hidden from menus on this tier.</p>
    </>
  );
}

export default function TierPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return <Suspense><TierGrid id={id} /></Suspense>;
}
