import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import request from 'supertest';
import { bootApp } from './harness';

let ctx: Awaited<ReturnType<typeof bootApp>>;
const cookies: Record<string, string> = {};

beforeAll(async () => {
  ctx = await bootApp();
  for (const role of ['admin', 'kitchen', 'dispatch', 'driver']) {
    const res = await request(ctx.app.getHttpServer()).post('/api/auth/login').send({ email: `${role}@test.com`, password: 'Test@1234' });
    expect(res.status).toBe(200);
    cookies[role] = res.headers['set-cookie'][0].split(';')[0];
  }
});
afterAll(() => ctx.app.close());

const as = (role: string) => ({
  get: (url: string) => request(ctx.app.getHttpServer()).get(url).set('Cookie', cookies[role]),
  post: (url: string, body: object = {}) => request(ctx.app.getHttpServer()).post(url).set('Cookie', cookies[role]).send(body),
});

describe('access control over HTTP', () => {
  it('rejects bad credentials and missing sessions', async () => {
    const bad = await request(ctx.app.getHttpServer()).post('/api/auth/login').send({ email: 'admin@test.com', password: 'nope' });
    expect(bad.status).toBe(401);
    expect(bad.body.code).toBe('BAD_CREDENTIALS');
    expect((await request(ctx.app.getHttpServer()).get('/api/orders')).status).toBe(401);
  });

  it('gives each test account only its role’s access', async () => {
    // [role, method, url, expected status]
    const matrix: [string, 'get' | 'post', string, number][] = [
      ['admin', 'get', '/api/dashboards/admin', 200],
      ['kitchen', 'get', '/api/dashboards/admin', 403],
      ['kitchen', 'get', '/api/dashboards/kitchen', 200],
      ['kitchen', 'get', '/api/kitchen/board', 200],
      ['kitchen', 'post', '/api/catalog/dishes', 403],
      ['kitchen', 'get', '/api/billing/summary', 403],
      ['dispatch', 'get', '/api/dispatch/board', 200],
      ['dispatch', 'post', '/api/kitchen/units/x/done', 403],
      ['dispatch', 'post', '/api/orders', 403],
      ['driver', 'get', '/api/driver/drops', 200],
      ['driver', 'get', '/api/orders', 403],
      ['driver', 'get', '/api/dispatch/board', 403],
      ['driver', 'get', '/api/companies', 403],
      ['admin', 'get', '/api/driver/drops', 403],
    ];
    for (const [role, method, url, status] of matrix) {
      const res = await as(role)[method](url);
      expect({ role, url, status: res.status }).toEqual({ role, url, status });
    }
  });

  it('returns field errors a form can show', async () => {
    const res = await as('admin').post('/api/catalog/dishes', { name: '', sku: 'abc', temperature: 'WARM', costCents: -1 });
    expect(res.status).toBe(422);
    expect(res.body.code).toBe('VALIDATION');
    expect(Object.keys(res.body.fieldErrors)).toEqual(expect.arrayContaining(['name', 'sku', 'temperature', 'costCents']));
  });
});
