import { describe, expect, test } from 'bun:test';

process.env.DATABASE_URL ??= 'postgresql://ontime:ontime@localhost:5432/ontime';

const { createApp, redirectHttpToHttps } = await import('./app');

describe('application', () => {
  test('returns API information', async () => {
    const response = await createApp().handle(new Request('http://localhost/'));

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      name: 'Elysia Ontime API',
      status: 'ok',
    });
  });

  test('redirects proxied HTTP requests to the same HTTPS URL', () => {
    const response = redirectHttpToHttps(new Request(
      'http://mobilitek925.synology.me/health?check=1',
      { headers: { 'x-forwarded-proto': 'http' } },
    ));
    expect(response?.status).toBe(308);
    expect(response?.headers.get('location')).toBe(
      'https://mobilitek925.synology.me/health?check=1',
    );
    expect(redirectHttpToHttps(new Request(
      'http://127.0.0.1:3080/health',
    ))).toBeUndefined();
  });
});
