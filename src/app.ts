import { sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { database } from './database';
import { auth } from './modules/auth';

export const createApp = () =>
  new Elysia({ name: 'ontime' })
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
    })
    .use(auth);
