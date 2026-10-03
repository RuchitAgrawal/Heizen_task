'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { forwardRef } from 'react';

type Variant = 'primary' | 'secondary' | 'danger' | 'ghost';

export function Button({ variant = 'secondary', className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant }) {
  return (
    <button
      {...props}
      className={clsx(
        'inline-flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50',
        variant === 'primary' && 'bg-emerald-800 text-white hover:bg-emerald-900',
        variant === 'secondary' && 'bg-stone-100 text-stone-900 hover:bg-stone-200',
        variant === 'danger' && 'bg-red-50 text-red-800 hover:bg-red-100',
        variant === 'ghost' && 'text-stone-700 hover:bg-stone-100',
        className,
      )}
    />
  );
}

export function LinkButton({ href, children, variant = 'secondary' }: { href: string; children: React.ReactNode; variant?: Variant }) {
  return (
    <Link
      href={href}
      className={clsx(
        'inline-flex h-9 items-center rounded-md px-3 text-sm font-medium',
        variant === 'primary' ? 'bg-emerald-800 text-white hover:bg-emerald-900' : 'bg-stone-100 text-stone-900 hover:bg-stone-200',
      )}
    >
      {children}
    </Link>
  );
}

const control = 'h-9 w-full rounded-md bg-stone-100 px-2.5 text-sm text-stone-900 outline-none focus:bg-white focus:ring-2 focus:ring-emerald-700 aria-invalid:ring-2 aria-invalid:ring-red-600';

export const Input = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...p }, ref) {
  return <input ref={ref} {...p} className={clsx(control, className)} />;
});

export function Select({ className, ...p }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select {...p} className={clsx(control, 'pr-7', className)} />;
}

export function Textarea({ className, ...p }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea {...p} className={clsx(control, 'h-auto min-h-20 py-2', className)} />;
}

export function Check({ label, ...p }: React.InputHTMLAttributes<HTMLInputElement> & { label: string }) {
  return (
    <label className="inline-flex items-center gap-2 text-sm text-stone-800">
      <input type="checkbox" {...p} className="size-4 accent-emerald-800" />
      {label}
    </label>
  );
}

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: React.ReactNode; className?: string }) {
  return (
    <label className={clsx('flex flex-col gap-1', className)}>
      <span className="text-xs font-medium text-stone-600">{label}</span>
      {children}
      {error ? <span className="text-xs text-red-700">{error}</span> : hint ? <span className="text-xs text-stone-500">{hint}</span> : null}
    </label>
  );
}

export function PageHeader({ title, children }: { title: React.ReactNode; children?: React.ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <h1 className="text-xl font-semibold text-stone-900">{title}</h1>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function Section({ title, children, aside }: { title: string; children: React.ReactNode; aside?: React.ReactNode }) {
  return (
    <section className="mb-10">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">{title}</h2>
        {aside}
      </div>
      {children}
    </section>
  );
}

const tones = {
  neutral: 'bg-stone-100 text-stone-700',
  green: 'bg-emerald-100 text-emerald-900',
  blue: 'bg-sky-100 text-sky-900',
  amber: 'bg-amber-100 text-amber-900',
  red: 'bg-red-100 text-red-900',
  violet: 'bg-violet-100 text-violet-900',
} as const;
export type Tone = keyof typeof tones;

export function Chip({ tone = 'neutral', children }: { tone?: Tone; children: React.ReactNode }) {
  return <span className={clsx('inline-flex h-6 items-center rounded px-2 text-xs font-medium whitespace-nowrap', tones[tone])}>{children}</span>;
}

export const STATUS_TONE: Record<string, Tone> = {
  DRAFT: 'neutral', PLACED: 'blue', CONFIRMED: 'violet', DELIVERED: 'green', CANCELLED: 'neutral', REJECTED: 'red',
  ISSUED: 'amber', PAID: 'green',
};

export function StatusChip({ status }: { status: string }) {
  return <Chip tone={STATUS_TONE[status] ?? 'neutral'}>{status.charAt(0) + status.slice(1).toLowerCase()}</Chip>;
}

export const URGENCY: Record<string, { tone: Tone; label: string }> = {
  LATE: { tone: 'red', label: 'Late' },
  AT_RISK: { tone: 'amber', label: 'At risk' },
  ON_TRACK: { tone: 'neutral', label: 'On track' },
  DONE: { tone: 'green', label: 'Done' },
};

export function Table({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className="overflow-x-auto">
      <table className={clsx('w-full border-collapse text-sm', className)}>{children}</table>
    </div>
  );
}
export function Th({ children, className, ...p }: React.ThHTMLAttributes<HTMLTableCellElement>) {
  return <th {...p} className={clsx('px-3 py-2 text-left text-xs font-medium whitespace-nowrap text-stone-500', className)}>{children}</th>;
}
export function Td({ children, className, ...p }: React.TdHTMLAttributes<HTMLTableCellElement>) {
  return <td {...p} className={clsx('px-3 py-2 align-top text-stone-900', className)}>{children}</td>;
}
/** Rows are separated by a hairline: in a table it carries meaning (row boundaries). */
export function Tr({ children, className, ...p }: React.HTMLAttributes<HTMLTableRowElement>) {
  return <tr {...p} className={clsx('border-b border-stone-100', className)}>{children}</tr>;
}

export function Num({ children, className }: { children: React.ReactNode; className?: string }) {
  return <span className={clsx('tabular-nums', className)}>{children}</span>;
}

export function Stat({ label, value, sub, tone }: { label: string; value: React.ReactNode; sub?: React.ReactNode; tone?: 'red' | 'amber' }) {
  return (
    <div className="min-w-36">
      <div className="text-xs text-stone-500">{label}</div>
      <div className={clsx('mt-1 text-2xl font-semibold tabular-nums', tone === 'red' ? 'text-red-700' : tone === 'amber' ? 'text-amber-700' : 'text-stone-900')}>{value}</div>
      {sub ? <div className="mt-0.5 text-xs text-stone-500">{sub}</div> : null}
    </div>
  );
}

export function ErrorText({ children }: { children: React.ReactNode }) {
  if (!children) return null;
  return <p role="alert" className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-800">{children}</p>;
}

export function Empty({ children }: { children: React.ReactNode }) {
  return <p className="py-8 text-sm text-stone-500">{children}</p>;
}

export function Loading() {
  return <p className="py-8 text-sm text-stone-500">Loading…</p>;
}

export function Pager({ page, pageSize, total, onPage }: { page: number; pageSize: number; total: number; onPage: (p: number) => void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return (
    <div className="mt-3 flex items-center justify-between text-sm text-stone-600">
      <span className="tabular-nums">
        {total === 0 ? 0 : (page - 1) * pageSize + 1}-{Math.min(total, page * pageSize)} of {total}
      </span>
      <div className="flex gap-2">
        <Button variant="ghost" disabled={page <= 1} onClick={() => onPage(page - 1)}>Previous</Button>
        <Button variant="ghost" disabled={page >= pages} onClick={() => onPage(page + 1)}>Next</Button>
      </div>
    </div>
  );
}
