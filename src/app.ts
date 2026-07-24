import { sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { config } from './config';
import { database } from './database';
import { auth } from './modules/auth';
import { backupRoutes } from './modules/backup';
import { clientRoutes } from './modules/clients';
import { dataImportRoutes } from './modules/data-import';
import { projectRoutes } from './modules/projects';
import { workEntryRoutes } from './modules/work-entries';

const frontendFile = (path: string) => {
  const relativePath = path === '/' ? 'index.html' : path.slice(1);

  return Bun.file(`dist/web/${relativePath}`);
};

const serveFrontend = async (path: string, status: { status?: number | string }) => {
  const file = frontendFile(path);

  if (await file.exists()) {
    return new Response(file);
  }

  const index = frontendFile('/');

  if (await index.exists()) {
    return new Response(index, {
      headers: {
        'content-type': 'text/html; charset=utf-8',
      },
    });
  }

  status.status = 404;

  return {
    error: 'NOT_FOUND',
  };
};

export const redirectHttpToHttps = (request: Request): Response | undefined => {
  const forwardedProtocol = request.headers.get('x-forwarded-proto')
    ?.split(',', 1)[0]
    ?.trim()
    .toLowerCase();
  if (forwardedProtocol !== 'http') return;

  const destination = new URL(request.url);
  destination.protocol = 'https:';
  destination.port = '';
  return Response.redirect(destination, 308);
};

export const createApp = () =>
  new Elysia({ name: 'ontime' })
    .onRequest(({ request }) =>
      config.forceHttps ? redirectHttpToHttps(request) : undefined,
    )
    .get('/', ({ set }) =>
      config.isProduction
        ? serveFrontend('/', set)
        : {
            name: 'Elysia Ontime API',
            status: 'ok',
          },
    )
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
    .use(backupRoutes)
    .use(clientRoutes)
    .use(dataImportRoutes)
    .use(projectRoutes)
    .use(workEntryRoutes)
    .get('/*', ({ path, set }) => {
      if (path.startsWith('/api/')) {
        set.status = 404;

        return {
          error: 'NOT_FOUND',
        };
      }

      return config.isProduction ? serveFrontend(path, set) : { error: 'NOT_FOUND' };
    });
