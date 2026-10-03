'use client';

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api, post } from '@/lib/api';
import { useAction } from '@/lib/forms';
import { day, time } from '@/lib/format';
import { useTz } from '@/lib/session';
import type { Drop, DropBoard } from '@/lib/drops';
import { Button, Chip, Empty, ErrorText, Field, Loading, Textarea } from '@/components/ui';
import { STAGE_LABEL, STAGE_TONE } from '@/components/stages';

/** Shrinks a phone photo to at most 1280 px JPEG so it fits the request limit. */
async function compress(file: File): Promise<string> {
  const img = await createImageBitmap(file);
  const scale = Math.min(1, 1280 / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.75);
}

export default function DriverPage() {
  const q = useQuery({ queryKey: ['driver'], queryFn: () => api<DropBoard>('/driver/drops'), refetchInterval: 30_000 });
  if (!q.data) return <Loading />;
  const remaining = q.data.drops.filter((d) => d.stage !== 'DELIVERED');
  const done = q.data.drops.filter((d) => d.stage === 'DELIVERED');
  return (
    <div className="mx-auto max-w-lg">
      <h1 className="text-xl font-semibold">My deliveries</h1>
      <p className="mb-6 text-sm text-stone-500">{day(q.data.date)}: {remaining.length} to go, {done.length} delivered</p>
      {q.data.drops.length === 0 && <Empty>No deliveries assigned to you today.</Empty>}
      <div className="flex flex-col gap-8">
        {[...remaining, ...done].map((d) => <DropCard key={d.id} drop={d} />)}
      </div>
    </div>
  );
}

function DropCard({ drop: d }: { drop: Drop }) {
  const tz = useTz();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState('');
  const [photo, setPhoto] = useState<string | null>(null);
  const act = useAction(() => post(`/dispatch/drops/${d.id}/deliver`, { note, photoDataUrl: photo }), { invalidate: [['driver']], onSuccess: () => setOpen(false) });
  const addr = [d.address.line1, d.address.line2, `${d.address.city} ${d.address.postalCode}`].filter(Boolean).join(', ');

  return (
    <article className={d.stage === 'DELIVERED' ? 'opacity-60' : ''}>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-2xl font-semibold tabular-nums">{d.deliveryTime}</span>
        <Chip tone={STAGE_TONE[d.stage]}>{STAGE_LABEL[d.stage]}</Chip>
      </div>
      <div className="mt-1 text-base font-medium">{d.company.name}</div>
      <a className="text-sm text-emerald-800 underline" href={`https://maps.google.com/?q=${encodeURIComponent(addr)}`} target="_blank" rel="noreferrer">{d.address.label}, {addr}</a>
      {d.company.driverInstructions && <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-sm text-amber-950">{d.company.driverInstructions}</p>}
      <ul className="mt-3 text-sm">
        {d.orders.map((o) => (
          <li key={o.id} className="py-1">
            <span className="font-medium">{o.employee}</span> <span className="text-stone-500">#{o.number}, {o.packaging}</span>
            <div className="text-stone-600">{o.items.map((i) => `${i.quantity}× ${i.dishName}`).join(', ')}</div>
          </li>
        ))}
      </ul>
      <div className="mt-3">
        {d.stage === 'DELIVERED' ? (
          <p className="text-sm">Delivered {time(d.deliveredAt, tz)} {d.onTime === false && <Chip tone="red">Late</Chip>}{d.deliveryNote && `: ${d.deliveryNote}`}</p>
        ) : d.stage !== 'OUT_FOR_DELIVERY' ? (
          <p className="text-sm text-stone-500">Dispatch will hand this over when it is packed.</p>
        ) : !open ? (
          <Button variant="primary" className="h-12 w-full text-base" onClick={() => setOpen(true)}>Mark delivered</Button>
        ) : (
          <div className="flex flex-col gap-3">
            <Field label="Note (optional)" error={act.fieldErrors.note}><Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Left with reception" /></Field>
            <Field label="Photo (optional)" error={act.fieldErrors.photoDataUrl}>
              <input type="file" accept="image/*" capture="environment" onChange={async (e) => { const f = e.target.files?.[0]; setPhoto(f ? await compress(f) : null); }} className="text-sm" />
            </Field>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {photo && <img src={photo} alt="Delivery photo preview" className="max-h-48 rounded-md object-contain" />}
            <ErrorText>{act.error}</ErrorText>
            <div className="flex gap-2">
              <Button variant="primary" className="h-12 flex-1 text-base" disabled={act.isPending} onClick={() => act.run(undefined)}>{act.isPending ? 'Saving…' : 'Confirm delivery'}</Button>
              <Button className="h-12" onClick={() => setOpen(false)}>Back</Button>
            </div>
          </div>
        )}
      </div>
    </article>
  );
}
