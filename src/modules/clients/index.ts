import { Elysia, t } from 'elysia';
import { SESSION_COOKIE_NAME } from '../auth/constants';
import { getSessionToken } from '../auth/cookie';
import { getUserBySessionToken } from '../auth/service';
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
      }),
    },
  );
