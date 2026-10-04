'use client';

import Link from 'next/link';
import { Suspense, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { keepPreviousData, useQuery } from '@tanstack/react-query';
import { CsvImportResult, Page } from '@fernleaf/shared';
import { api, post } from '@/lib/api';
import { useDebouncedValue } from '@/lib/debounce';
import { useAction } from '@/lib/forms';
import { useSession } from '@/lib/session';
import type { Named } from '@/lib/types';
import { Button, Chip, Empty, ErrorText, Field, Input, LinkButton, Loading, Num, PageHeader, Pager, Section, Select, Table, Td, Th, Tr } from '@/components/ui';

interface Row { id: string; name: string; email: string; active: boolean; company: Named; canChooseAddress: boolean; canChangeDeliveryTime: boolean; canChangePackaging: boolean; allergens: Named[]; dietaryTags: Named[] }

function EmployeesList() {
  const router = useRouter();
  const params = useSearchParams();
  const { can } = useSession();
  const companyId = params.get('companyId') ?? '';
  const [q, setQ] = useState('');
  const debouncedQuery = useDebouncedValue(q);
  const [page, setPage] = useState(1);
  const [importing, setImporting] = useState(false);
  const companies = useQuery({ queryKey: ['companies'], queryFn: () => api<Named[]>('/companies') });
  const list = useQuery({
    queryKey: ['employees', { companyId, q: debouncedQuery, page }],
    queryFn: ({ signal }) => api<Page<Row>>('/employees', { query: { companyId, q: debouncedQuery, page, pageSize: 25 }, signal }),
    placeholderData: keepPreviousData,
  });

  return (
    <>
      <PageHeader title="Employees">
        {can('employees.write') && <Button onClick={() => setImporting(!importing)}>Import CSV</Button>}
        {can('employees.write') && <LinkButton variant="primary" href={`/employees/new${companyId ? `?companyId=${companyId}` : ''}`}>New employee</LinkButton>}
      </PageHeader>
      {importing && <CsvImport companies={companies.data ?? []} defaultCompany={companyId} />}
      <div className="mb-4 flex flex-wrap gap-3">
        <Input placeholder="Search name or email" value={q} onChange={(e) => { setQ(e.target.value); setPage(1); }} className="w-64" />
        <Select value={companyId} onChange={(e) => router.replace(`/employees${e.target.value ? `?companyId=${e.target.value}` : ''}`)} className="w-64">
          <option value="">All companies</option>
          {companies.data?.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </Select>
      </div>
      {!list.data ? <Loading /> : list.data.items.length === 0 ? <Empty>No employees found.</Empty> : (
        <>
          <Table>
            <thead><Tr><Th>Name</Th><Th>Email</Th><Th>Company</Th><Th>May change</Th><Th>Allergies</Th><Th>Diet</Th><Th /></Tr></thead>
            <tbody>
              {list.data.items.map((e) => (
                <Tr key={e.id} className={e.active ? '' : 'text-stone-400'}>
                  <Td><Link className="font-medium hover:underline" href={`/employees/${e.id}`}>{e.name}</Link></Td>
                  <Td>{e.email}</Td>
                  <Td>{e.company.name}</Td>
                  <Td className="text-xs">{[e.canChooseAddress && 'address', e.canChangeDeliveryTime && 'time', e.canChangePackaging && 'packaging'].filter(Boolean).join(', ')}</Td>
                  <Td className="text-xs">{e.allergens.map((a) => a.name).join(', ')}</Td>
                  <Td className="text-xs">{e.dietaryTags.map((a) => a.name).join(', ')}</Td>
                  <Td>{!e.active && <Chip>Inactive</Chip>}</Td>
                </Tr>
              ))}
            </tbody>
          </Table>
          <Pager page={list.data.page} pageSize={list.data.pageSize} total={list.data.total} onPage={setPage} />
        </>
      )}
    </>
  );
}

const SAMPLE = 'name,email,can_choose_address,can_change_time,can_change_packaging,allergens,dietary\nJane Doe,jane.doe@northwind.io,yes,no,no,Nuts;Dairy,Vegetarian';

function CsvImport({ companies, defaultCompany }: { companies: Named[]; defaultCompany: string }) {
  const [companyId, setCompanyId] = useState(defaultCompany);
  const [csv, setCsv] = useState('');
  const run = useAction(() => post<CsvImportResult>('/employees/import', { companyId, csv }), { invalidate: [['employees']] });
  return (
    <Section title="Import employees from CSV">
      <p className="mb-3 text-sm text-stone-500">Header row needed. Existing emails in the company are updated. Bad rows are reported and skipped; the rest are saved.</p>
      <pre className="mb-3 overflow-x-auto rounded bg-stone-50 p-3 text-xs">{SAMPLE}</pre>
      <div className="flex flex-wrap items-end gap-3">
        <Field label="Company" error={run.fieldErrors.companyId}>
          <Select value={companyId} onChange={(e) => setCompanyId(e.target.value)}><option value="">Choose…</option>{companies.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}</Select>
        </Field>
        <Field label="CSV file"><input type="file" accept=".csv,text/csv" className="text-sm" onChange={async (e) => setCsv((await e.target.files?.[0]?.text()) ?? '')} /></Field>
        <Button variant="primary" disabled={!companyId || !csv || run.isPending} onClick={() => run.run(undefined)}>Import</Button>
      </div>
      <div className="mt-3"><ErrorText>{run.error}</ErrorText></div>
      {run.data && (
        <div className="mt-4">
          <p className="mb-2 text-sm">Created <Num>{run.data.created}</Num>, updated <Num>{run.data.updated}</Num>, skipped <Num>{run.data.errors.length}</Num>.</p>
          {run.data.errors.length > 0 && (
            <Table className="max-w-3xl">
              <thead><Tr><Th className="w-16">Row</Th><Th>Problem</Th></Tr></thead>
              <tbody>{run.data.errors.map((er) => <Tr key={er.row}><Td><Num>{er.row}</Num></Td><Td className="text-red-800">{er.message}</Td></Tr>)}</tbody>
            </Table>
          )}
        </div>
      )}
    </Section>
  );
}

export default function EmployeesPage() {
  return <Suspense><EmployeesList /></Suspense>;
}
