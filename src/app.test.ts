import { describe, expect, test } from 'bun:test';

process.env.DATABASE_URL ??= 'postgresql://ontime:ontime@localhost:5432/ontime';

const { createApp } = await import('./app');

describe('application', () => {
  test('returns API information', async () => {
    const response = await createApp().handle(new Request('http://localhost/'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: 'Elysia Ontime API',
      status: 'ok',
    });
  });
});
