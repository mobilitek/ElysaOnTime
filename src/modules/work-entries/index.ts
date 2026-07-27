import { Elysia, t } from 'elysia';
import { SESSION_COOKIE_NAME } from '../auth/constants';
import { getSessionToken } from '../auth/cookie';
import { getUserBySessionToken, hasFullAccess } from '../auth/service';
import { ClientTimeLimitError, createEntry, duplicateEntry, DuplicateTargetOccupiedError, EntryNotFoundError, InvalidDescriptionError, InvalidDurationError, listEntries, ProjectUnavailableError, toggleEntries, updateEntry } from './service';
import { exportWorkEntries } from './export';

const userFor = async (value: unknown) => getUserBySessionToken(getSessionToken(value));
const date = t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const descriptionLine = t.Object({
  id: t.String({ minLength: 1, maxLength: 100 }),
  text: t.String({ minLength: 1, maxLength: 10_000 }),
  depth: t.Integer({ minimum: 0, maximum: 100 }),
  includedInExport: t.Boolean(),
});
const entryBody = t.Object({
  workDate: date,
  durationMinutes: t.Integer({ minimum: 0 }),
  clientMinutes: t.Optional(t.Integer({ minimum: 0 })),
  description: t.String({ minLength: 1 }),
  descriptionDocument: t.Optional(t.Nullable(t.Array(descriptionLine, { minItems: 1, maxItems: 500 }))),
});

/** Traduit les erreurs métier connues en réponses HTTP stables pour le frontend. */
const errors = (error: unknown, status: (code: number, body: unknown) => unknown) => {
  if (error instanceof EntryNotFoundError) return status(404, { error: 'ENTRY_NOT_FOUND' });
  if (error instanceof ProjectUnavailableError) return status(422, { error: 'PROJECT_UNAVAILABLE' });
  if (error instanceof InvalidDurationError) return status(422, { error: 'INVALID_DURATION' });
  if (error instanceof ClientTimeLimitError) {
    return status(422, { error: 'CLIENT_TIME_LIMIT', message: error.message });
  }
  if (error instanceof InvalidDescriptionError) return status(422, { error: 'DESCRIPTION_REQUIRED' });
  if (error instanceof DuplicateTargetOccupiedError) {
    return status(409, {
      error: 'DUPLICATE_TARGET_OCCUPIED',
      targetDate: error.targetDate,
    });
  }
  throw error;
};

/** API du journal : consultation, export, saisie, copie et changements d'état. */
export const workEntryRoutes = new Elysia({ prefix: '/api/work-entries' })
  .get('/export', async ({ cookie, query, set, status }) => {
    const user = await userFor(cookie[SESSION_COOKIE_NAME].value); if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    if (query.from > query.to) return status(422, { error: 'INVALID_DATE_RANGE' });
    // L'export applique exactement les mêmes filtres fonctionnels que la liste.
    const result = await exportWorkEntries(user, { from: query.from, to: query.to, clientId: query.clientId, projectId: query.projectId, includeDeleted: query.includeDeleted === 'true', confidential: query.confidential === 'true', language: query.language });
    set.headers['content-type'] = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
    set.headers['content-disposition'] = `attachment; filename="${result.filename}"`;
    return new Uint8Array(result.buffer as ArrayBuffer);
  }, { query: t.Object({ from: date, to: date, clientId: t.Optional(t.String({ format: 'uuid' })), projectId: t.Optional(t.String({ format: 'uuid' })), includeDeleted: t.Union([t.Literal('true'), t.Literal('false')]), confidential: t.Union([t.Literal('true'), t.Literal('false')]), language: t.Union([t.Literal('fr'), t.Literal('en')]) }) })
  .get('/', async ({ cookie, query, status }) => {
    const user = await userFor(cookie[SESSION_COOKIE_NAME].value); if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    if (query.from > query.to) return status(422, { error: 'INVALID_DATE_RANGE' });
    return listEntries(user.id, { from: query.from, to: query.to, clientId: query.clientId, projectId: query.projectId, includeDeleted: query.includeDeleted === 'true', page: Number(query.page ?? 1), pageSize: Number(query.pageSize ?? 50), sortBy: query.sortBy ?? 'workDate', sortDirection: query.sortDirection ?? 'desc' });
  }, { query: t.Object({ from: date, to: date, clientId: t.Optional(t.String({ format: 'uuid' })), projectId: t.Optional(t.String({ format: 'uuid' })), includeDeleted: t.Optional(t.Union([t.Literal('true'), t.Literal('false')])), page: t.Optional(t.Numeric({ minimum: 1 })), pageSize: t.Optional(t.Numeric({ minimum: 10, maximum: 100 })), sortBy: t.Optional(t.Union([t.Literal('workDate'), t.Literal('client'), t.Literal('project'), t.Literal('duration'), t.Literal('hourlyRate'), t.Literal('amount'), t.Literal('isBilled')])), sortDirection: t.Optional(t.Union([t.Literal('asc'), t.Literal('desc')])) }) })
  .post('/', async ({ body, cookie, status }) => { const user = await userFor(cookie[SESSION_COOKIE_NAME].value); if (!user) return status(401, { error: 'UNAUTHENTICATED' }); if (!hasFullAccess(user)) return status(403, { error: 'SUBSCRIPTION_REQUIRED' }); try { return status(201, { entry: await createEntry(user.id, body) }); } catch (error) { return errors(error, status); } }, { body: t.Intersect([entryBody, t.Object({ projectId: t.String({ format: 'uuid' }) })]) })
  .patch('/:id', async ({ body, cookie, params, status }) => { const user = await userFor(cookie[SESSION_COOKIE_NAME].value); if (!user) return status(401, { error: 'UNAUTHENTICATED' }); if (!hasFullAccess(user)) return status(403, { error: 'SUBSCRIPTION_REQUIRED' }); try { return { entry: await updateEntry(user.id, params.id, body) }; } catch (error) { return errors(error, status); } }, { params: t.Object({ id: t.String({ format: 'uuid' }) }), body: entryBody })
  .post('/toggle-billed', async ({ body, cookie, status }) => { const user = await userFor(cookie[SESSION_COOKIE_NAME].value); if (!user) return status(401, { error: 'UNAUTHENTICATED' }); if (!hasFullAccess(user)) return status(403, { error: 'SUBSCRIPTION_REQUIRED' }); try { return { entries: await toggleEntries(user.id, body.ids, 'isBilled') }; } catch (error) { return errors(error, status); } }, { body: t.Object({ ids: t.Array(t.String({ format: 'uuid' }), { minItems: 1 }) }) })
  .post('/toggle-deleted', async ({ body, cookie, status }) => { const user = await userFor(cookie[SESSION_COOKIE_NAME].value); if (!user) return status(401, { error: 'UNAUTHENTICATED' }); if (!hasFullAccess(user)) return status(403, { error: 'SUBSCRIPTION_REQUIRED' }); try { return { entries: await toggleEntries(user.id, body.ids, 'isDeleted') }; } catch (error) { return errors(error, status); } }, { body: t.Object({ ids: t.Array(t.String({ format: 'uuid' }), { minItems: 1 }) }) })
  .post('/:id/duplicate', async ({ body, cookie, params, status }) => { const user = await userFor(cookie[SESSION_COOKIE_NAME].value); if (!user) return status(401, { error: 'UNAUTHENTICATED' }); if (!hasFullAccess(user)) return status(403, { error: 'SUBSCRIPTION_REQUIRED' }); try { return status(201, { entry: await duplicateEntry(user.id, params.id, body.nextWorkday, body.confirmExisting ?? false) }); } catch (error) { return errors(error, status); } }, { params: t.Object({ id: t.String({ format: 'uuid' }) }), body: t.Object({ nextWorkday: t.Boolean(), confirmExisting: t.Optional(t.Boolean()) }) });
