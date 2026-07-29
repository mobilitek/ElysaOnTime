import { sql } from 'drizzle-orm';
import { Elysia } from 'elysia';
import { config } from './config';
import { database } from './database';
import { auth } from './modules/auth';
import { adminRoutes } from './modules/admin';
import { subscriptionRoutes } from './modules/subscriptions';
import { SESSION_COOKIE_NAME } from './modules/auth/constants';
import { getSessionToken } from './modules/auth/cookie';
import { getUserBySessionToken } from './modules/auth/service';
import { backupRoutes } from './modules/backup';
import { clientRoutes } from './modules/clients';
import { dataImportRoutes } from './modules/data-import';
import { hourBankRoutes } from './modules/hour-bank';
import { projectRoutes } from './modules/projects';
import { workEntryRoutes } from './modules/work-entries';
import { auditRoutes } from './modules/audit';
import { observability } from './modules/audit/observability';

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

const environmentFromDatabase = (databaseName: string) => {
  if (databaseName.endsWith('_dev')) return 'development';
  if (databaseName.endsWith('_staging')) return 'staging';
  return 'production';
};

export const createApp = () =>
  new Elysia({ name: 'ontime' })
    .onRequest(({ request }) =>
      config.forceHttps ? redirectHttpToHttps(request) : undefined,
    )
    .use(observability)
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
    .get('/api/system-info', async ({ cookie, set, status }) => {
      const user = await getUserBySessionToken(
        getSessionToken(cookie[SESSION_COOKIE_NAME].value),
      );

      if (!user) {
        return status(401, { error: 'UNAUTHENTICATED' });
      }

      // Cette valeur vient de la connexion PostgreSQL active. Elle confirme donc
      // la cible réelle de l'API plutôt que de répéter une configuration du client.
      const result = await database.execute<{ databaseName: string }>(
        sql`SELECT current_database() AS "databaseName"`,
      );
      const databaseName = result[0]?.databaseName;

      if (!databaseName) {
        return status(503, { error: 'DATABASE_UNAVAILABLE' });
      }

      // L'identité de la base peut changer lors d'un redémarrage local de l'API;
      // le navigateur ne doit donc jamais réutiliser une ancienne réponse.
      set.headers['cache-control'] = 'no-store';

      return {
        environment: environmentFromDatabase(databaseName),
        database: databaseName,
      };
    })
    .use(auth)
    .use(adminRoutes)
    .use(subscriptionRoutes)
    .use(backupRoutes)
    .use(clientRoutes)
    .use(dataImportRoutes)
    .use(hourBankRoutes)
    .use(projectRoutes)
    .use(workEntryRoutes)
    .use(auditRoutes)
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
