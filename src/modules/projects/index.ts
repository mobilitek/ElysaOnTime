import { Elysia, t } from 'elysia';
import { SESSION_COOKIE_NAME } from '../auth/constants';
import { getSessionToken } from '../auth/cookie';
import { getUserBySessionToken } from '../auth/service';
import {
  ClientUnavailableError, createProject, DuplicateProjectNameError, listProjects,
  ProjectNotFoundError, RateUpdateModeRequiredError, updateProject,
} from './service';

const getUser = async (value: unknown) => getUserBySessionToken(getSessionToken(value));
const nameSchema = t.String({ minLength: 1, maxLength: 200 });
const rateSchema = t.String({ pattern: '^\\d{1,10}(\\.\\d{1,2})?$' });

const handleKnownError = (error: unknown, status: (code: number, body: unknown) => unknown) => {
  if (error instanceof DuplicateProjectNameError) return status(409, { error: 'PROJECT_NAME_EXISTS', message: error.message });
  if (error instanceof ProjectNotFoundError) return status(404, { error: 'PROJECT_NOT_FOUND', message: error.message });
  if (error instanceof ClientUnavailableError) return status(422, { error: 'CLIENT_UNAVAILABLE', message: error.message });
  if (error instanceof RateUpdateModeRequiredError) return status(422, { error: 'RATE_UPDATE_MODE_REQUIRED', message: error.message });
  throw error;
};

export const projectRoutes = new Elysia({ prefix: '/api/projects' })
  .get('/', async ({ cookie, query, status }) => {
    const user = await getUser(cookie[SESSION_COOKIE_NAME].value);
    if (!user) return status(401, { error: 'UNAUTHENTICATED', message: 'Authentication required' });
    try { return { projects: await listProjects(user.id, query.clientId) }; }
    catch (error) { return handleKnownError(error, status); }
  }, { query: t.Object({ clientId: t.String({ format: 'uuid' }) }) })
  .post('/', async ({ body, cookie, status }) => {
    const user = await getUser(cookie[SESSION_COOKIE_NAME].value);
    if (!user) return status(401, { error: 'UNAUTHENTICATED', message: 'Authentication required' });
    try { return status(201, { project: await createProject(user.id, body) }); }
    catch (error) { return handleKnownError(error, status); }
  }, { body: t.Object({ clientId: t.String({ format: 'uuid' }), name: nameSchema, hourlyRate: rateSchema }) })
  .patch('/:id', async ({ body, cookie, params, status }) => {
    const user = await getUser(cookie[SESSION_COOKIE_NAME].value);
    if (!user) return status(401, { error: 'UNAUTHENTICATED', message: 'Authentication required' });
    try { return { project: await updateProject(user.id, params.id, body) }; }
    catch (error) { return handleKnownError(error, status); }
  }, {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    body: t.Object({
      name: t.Optional(nameSchema), hourlyRate: t.Optional(rateSchema), isActive: t.Optional(t.Boolean()),
      rateUpdateMode: t.Optional(t.Union([t.Literal('future_only'), t.Literal('update_unbilled')])),
    }),
  });
