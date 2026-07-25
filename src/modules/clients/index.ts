import { Elysia, t } from 'elysia';
import { SESSION_COOKIE_NAME } from '../auth/constants';
import { getSessionToken } from '../auth/cookie';
import { getUserBySessionToken, hasFullAccess } from '../auth/service';
import {
  ClientNotFoundError,
  createClient,
  DuplicateClientNameError,
  listClients,
  updateClient,
} from './service';

const getAuthenticatedUser = async (cookieValue: unknown) =>
  getUserBySessionToken(getSessionToken(cookieValue));

const clientNameSchema = t.String({ minLength: 1, maxLength: 200 });

/** Routes CRUD des clients appartenant exclusivement à l'utilisateur courant. */
export const clientRoutes = new Elysia({ prefix: '/api/clients' })
  .get('/', async ({ cookie, status }) => {
    const user = await getAuthenticatedUser(cookie[SESSION_COOKIE_NAME].value);
    if (!user) {
      return status(401, { error: 'UNAUTHENTICATED', message: 'Authentication required' });
    }

    return { clients: await listClients(user.id) };
  })
  .post(
    '/',
    async ({ body, cookie, status }) => {
      const user = await getAuthenticatedUser(cookie[SESSION_COOKIE_NAME].value);
      if (!user) {
        return status(401, { error: 'UNAUTHENTICATED', message: 'Authentication required' });
      }
      if (!hasFullAccess(user)) return status(403, { error: 'SUBSCRIPTION_REQUIRED' });

      try {
        return status(201, { client: await createClient(user.id, body.name) });
      } catch (error) {
        if (error instanceof DuplicateClientNameError) {
          return status(409, { error: 'CLIENT_NAME_EXISTS', message: error.message });
        }
        throw error;
      }
    },
    { body: t.Object({ name: clientNameSchema }) },
  )
  .patch(
    '/:id',
    async ({ body, cookie, params, status }) => {
      const user = await getAuthenticatedUser(cookie[SESSION_COOKIE_NAME].value);
      if (!user) {
        return status(401, { error: 'UNAUTHENTICATED', message: 'Authentication required' });
      }
      if (!hasFullAccess(user)) return status(403, { error: 'SUBSCRIPTION_REQUIRED' });

      try {
        return { client: await updateClient(user.id, params.id, body) };
      } catch (error) {
        if (error instanceof DuplicateClientNameError) {
          return status(409, { error: 'CLIENT_NAME_EXISTS', message: error.message });
        }
        if (error instanceof ClientNotFoundError) {
          return status(404, { error: 'CLIENT_NOT_FOUND', message: error.message });
        }
        throw error;
      }
    },
    {
      params: t.Object({ id: t.String({ format: 'uuid' }) }),
      body: t.Object({
        name: t.Optional(clientNameSchema),
        isActive: t.Optional(t.Boolean()),
        hourBankEnabled: t.Optional(t.Boolean()),
        hourBankStartDate: t.Optional(t.Union([
          t.String({ format: 'date' }),
          t.Null(),
        ])),
        hourBankInitialMinutes: t.Optional(t.Integer()),
        maxDailyBillableMinutes: t.Optional(t.Integer({ minimum: 1 })),
        maxWeeklyBillableMinutes: t.Optional(t.Integer({ minimum: 1 })),
      }),
    },
  );
