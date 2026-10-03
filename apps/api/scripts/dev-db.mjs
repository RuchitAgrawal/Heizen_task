// Local Postgres without Docker. Data lives in apps/api/.dev-db. Ctrl+C to stop.
import EmbeddedPostgres from 'embedded-postgres';
import { existsSync } from 'node:fs';

const dir = new URL('../.dev-db', import.meta.url).pathname;
const port = Number(process.env.DEV_DB_PORT ?? 54329);
const pg = new EmbeddedPostgres({ databaseDir: dir, user: 'fernleaf', password: 'fernleaf', port, persistent: true });

if (!existsSync(dir)) await pg.initialise();
await pg.start();
try {
  await pg.createDatabase('fernleaf');
  await pg.createDatabase('fernleaf_test');
} catch {
  // already exist
}
console.log(`Postgres ready on postgresql://fernleaf:fernleaf@localhost:${port}/fernleaf`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
