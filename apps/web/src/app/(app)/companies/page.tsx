'use client';

import Link from 'next/link';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useSession } from '@/lib/session';
import { LinkButton, Loading, Num, PageHeader, Table, Td, Th, Tr } from '@/components/ui';

interface Row { id: string; name: string; domains: { domain: string }[]; priceTier: { name: string } | null; owner: { name: string } | null; _count: { employees: number } }

export default function CompaniesPage() {
  const { can } = useSession();
  const q = useQuery({ queryKey: ['companies'], queryFn: () => api<Row[]>('/companies') });
  if (!q.data) return <Loading />;
  return (
    <>
      <PageHeader title="Companies">{can('companies.write') && <LinkButton variant="primary" href="/companies/new">New company</LinkButton>}</PageHeader>
      <Table>
        <thead><Tr><Th>Company</Th><Th>Email domains</Th><Th>Price tier</Th><Th>Owner</Th><Th className="text-right">Employees</Th></Tr></thead>
        <tbody>
          {q.data.map((c) => (
            <Tr key={c.id}>
              <Td><Link className="font-medium hover:underline" href={`/companies/${c.id}`}>{c.name}</Link></Td>
              <Td>{c.domains.map((d) => d.domain).join(', ')}</Td>
              <Td>{c.priceTier?.name ?? <span className="text-stone-500">Default</span>}</Td>
              <Td>{c.owner?.name}</Td>
              <Td className="text-right"><Link className="hover:underline" href={`/employees?companyId=${c.id}`}><Num>{c._count.employees}</Num></Link></Td>
            </Tr>
          ))}
        </tbody>
      </Table>
    </>
  );
}
