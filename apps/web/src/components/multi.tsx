'use client';

import clsx from 'clsx';

/** Toggle chips for picking several values from a short list (allergens, tags, sizes). */
export function MultiPick({ options, value, onChange, disabled }: { options: { id: string; name: string }[]; value: string[]; onChange: (v: string[]) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {options.map((o) => {
        const on = value.includes(o.id);
        return (
          <button
            type="button"
            key={o.id}
            disabled={disabled}
            aria-pressed={on}
            onClick={() => onChange(on ? value.filter((x) => x !== o.id) : [...value, o.id])}
            className={clsx('h-7 rounded px-2.5 text-xs', on ? 'bg-emerald-800 text-white' : 'bg-stone-100 text-stone-700 hover:bg-stone-200')}
          >
            {o.name}
          </button>
        );
      })}
    </div>
  );
}
