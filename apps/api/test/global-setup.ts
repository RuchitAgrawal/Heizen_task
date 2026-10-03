import { execSync } from 'node:child_process';

/** Fresh schema and base seed (no demo orders) in the test database, once per run. */
export default function setup() {
  const url = process.env.TEST_DATABASE_URL ?? 'postgresql://fernleaf:fernleaf@localhost:54329/fernleaf_test';
  const env = { ...process.env, DATABASE_URL: url, DIRECT_DATABASE_URL: url, SEED_ORDERS: 'false' };
  execSync('npx prisma migrate deploy', { env, stdio: 'pipe' });
  execSync('node -r @swc-node/register prisma/seed.ts', { env, stdio: 'pipe' });
}
