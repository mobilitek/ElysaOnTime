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

/**
 * Résout un chemin public vers le fichier produit par Vite.
 * La racine de l'application correspond toujours au document index.html.
 */
const frontendFile = (path: string) => {
  const relativePath = path === '/' ? 'index.html' : path.slice(1);

  return Bun.file(`dist/web/${relativePath}`);
};

/**
 * Sert un fichier statique lorsqu'il existe. Pour toute route React inconnue,
 * retourne index.html afin que le routeur côté navigateur puisse prendre la relève.
 */
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
  // Le NAS termine TLS devant l'application et transmet le protocole original
  // dans cet en-tête. Une redirection 308 conserve la méthode et le corps HTTP.
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
        // Une réponse saine exige une connexion PostgreSQL fonctionnelle;
        // Docker peut ainsi redémarrer l'application si la BD devient inaccessible.
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
      // Une route API inexistante doit rester une erreur JSON et ne doit jamais
      // être confondue avec une route de l'application React.
      if (path.startsWith('/api/')) {
        set.status = 404;

        return {
          error: 'NOT_FOUND',
        };
      }

      return config.isProduction ? serveFrontend(path, set) : { error: 'NOT_FOUND' };
    });
