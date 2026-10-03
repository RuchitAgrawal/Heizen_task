'use client';

import Link from 'next/link';
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { formatMultiplier, parseMultiplier } from '@fernleaf/shared';
import { ruleText } from '@/lib/pricing';
import { api, post, put } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { useSession } from '@/lib/session';
import { Button, Chip, ErrorText, Field, Input, Loading, Num, PageHeader, Section, Select, Table, Td, Th, Tr } from '@/components/ui';

interface Tier {
  id: string; name: string; isDefault: boolean; rule: 'MANUAL' | 'COST_MULTIPLIER' | 'TIER_MARKUP';
  multiplierBp: number | null; baseTierId: string | null; baseTier: { name: string } | null;
  missingDishPrices: number; _count: { companies: number };
}

export default function PricingPage() {
  const { can } = useSession();
  const tiers = useQuery({ queryKey: ['tiers'], queryFn: () => api<Tier[]>('/pricing/tiers') });
  const [editing, setEditing] = useState<Tier | 'new' | null>(null);
  const setDefault = useAction((id: string) => post(`/pricing/tiers/${id}/default`), { invalidate: [['tiers']] });
  if (!tiers.data) return <Loading />;

  return (
    <>
      <PageHeader title="Price tiers">{can('pricing.write') && <Button variant="primary" onClick={() => setEditing('new')}>New tier</Button>}</PageHeader>
      <p className="mb-4 max-w-2xl text-sm text-stone-500">Companies without a tier use the default. Derived tiers round up to the next 5 cents; a typed price on a derived tier overrides it. Changes apply to new orders only.</p>
      {editing && <TierForm tier={editing === 'new' ? null : editing} tiers={tiers.data} onDone={() => setEditing(null)} />}
      <ErrorText>{setDefault.error}</ErrorText>
      <Table>
        <thead><Tr><Th>Tier</Th><Th>Prices</Th><Th className="text-right">Companies</Th><Th className="text-right">Dishes with no price</Th><Th /></Tr></thead>
        <tbody>
          {tiers.data.map((t) => (
            <Tr key={t.id}>
              <Td><Link href={`/pricing/${t.id}`} className="font-medium hover:underline">{t.name}</Link> {t.isDefault && <Chip tone="green">Default</Chip>}</Td>
              <Td>{ruleText(t)}</Td>
              <Td className="text-right"><Num>{t._count.companies}</Num></Td>
              <Td className={`text-right ${t.missingDishPrices ? 'font-medium text-amber-700' : ''}`}><Link href={`/pricing/${t.id}?missing=1`}><Num>{t.missingDishPrices}</Num></Link></Td>
              <Td className="text-right">
                {can('pricing.write') && (
                  <div className="flex justify-end gap-2">
                    <Button variant="ghost" onClick={() => setEditing(t)}>Edit rule</Button>
                    {!t.isDefault && <Button variant="ghost" onClick={() => setDefault.run(t.id)}>Make default</Button>}
                  </div>
                )}
              </Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}

function TierForm({ tier, tiers, onDone }: { tier: Tier | null; tiers: Tier[]; onDone: () => void }) {
  const [name, setName] = useState(tier?.name ?? '');
  const [rule, setRule] = useState<Tier['rule']>(tier?.rule ?? 'MANUAL');
  const [mult, setMult] = useState(tier?.multiplierBp ? formatMultiplier(tier.multiplierBp) : '');
  const [baseTierId, setBase] = useState(tier?.baseTierId ?? '');
  const save = useAction(
    () => {
      const body = { name, rule, multiplierBp: rule === 'MANUAL' ? null : parseMultiplier(mult), baseTierId: rule === 'TIER_MARKUP' ? baseTierId || null : null };
      return tier ? put(`/pricing/tiers/${tier.id}`, body) : post('/pricing/tiers', body);
    },
    { invalidate: [['tiers']], onSuccess: onDone },
  );
  const fe = save.fieldErrors;
  return (
    <Section title={tier ? `Edit ${tier.name}` : 'New tier'}>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Name" error={fe.name}><Input value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Prices come from">
          <Select value={rule} onChange={(e) => setRule(e.target.value as Tier['rule'])}>
            <option value="MANUAL">Typed in per item</option>
            <option value="COST_MULTIPLIER">Cost × multiplier</option>
            <option value="TIER_MARKUP">Another tier × multiplier</option>
          </Select>
        </Field>
        {rule === 'TIER_MARKUP' && (
          <Field label="Base tier" error={fe.baseTierId}>
            <Select value={baseTierId} onChange={(e) => setBase(e.target.value)}>
              <option value="">Choose…</option>
              {tiers.filter((t) => t.id !== tier?.id).map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
            </Select>
          </Field>
        )}
        {rule !== 'MANUAL' && <Field label="Multiplier" error={fe.multiplierBp} hint={rule === 'TIER_MARKUP' ? '1.15 = +15%, 0.9 = −10%' : 'e.g. 2.4'}><Input value={mult} onChange={(e) => setMult(e.target.value)} className="w-28" /></Field>}
        <Button variant="primary" disabled={save.isPending} onClick={() => save.run(undefined)}>Save</Button>
        <Button variant="ghost" onClick={onDone}>Cancel</Button>
      </div>
      <div className="mt-2"><ErrorText>{save.error}</ErrorText></div>
    </Section>
  );
}
