import { sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { database } from './database';
import { auth } from './modules/auth';
import { clientRoutes } from './modules/clients';
import { dataImportRoutes } from './modules/data-import';
import { projectRoutes } from './modules/projects';
import { workEntryRoutes } from './modules/work-entries';

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
    .use(auth)
    .use(clientRoutes)
    .use(dataImportRoutes)
    .use(projectRoutes)
    .use(workEntryRoutes);
