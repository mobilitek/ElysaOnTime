import { sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { database } from './database';

export const createApp = () =>
  new Elysia()
    .get('/', () => ({
      name: 'Elysia Ontime API',
      status: 'ok',
    }))
    .get('/health', async ({ set }) => {
      try {
        await database.execute(sql`SELECT 1`);

        return {
          status: 'ok',
          database: 'connected',
        };
      } catch {
        set.status = 503;

        return {
          status: 'error',
          database: 'unavailable',
        };
      }
    });
