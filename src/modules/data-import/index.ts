import { Elysia, t } from 'elysia';
import { SESSION_COOKIE_NAME } from '../auth/constants';
import { getSessionToken } from '../auth/cookie';
import { getUserBySessionToken } from '../auth/service';
import { InvalidImportFileError, parseImportFile, replaceUserData } from './service';

const userFor = async (value: unknown) => getUserBySessionToken(getSessionToken(value));
const fileBody = t.Object({ file: t.File() });

export const dataImportRoutes = new Elysia({ prefix: '/api/data-import' })
  .post('/analyze', async ({ body, cookie, status }) => {
    const user = await userFor(cookie[SESSION_COOKIE_NAME].value);
    if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    try {
      const { analysis } = await parseImportFile(body.file);
      return { analysis };
    } catch (error) {
      if (error instanceof InvalidImportFileError) return status(422, { error: 'INVALID_IMPORT_FILE', detail: error.message });
      throw error;
    }
  }, { body: fileBody })
  .post('/execute', async ({ body, cookie, status }) => {
    const user = await userFor(cookie[SESSION_COOKIE_NAME].value);
    if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    if (body.confirmation !== 'REMPLACER') return status(422, { error: 'CONFIRMATION_REQUIRED' });
    try {
      const { entries, analysis } = await parseImportFile(body.file);
      if (analysis.digest !== body.digest) return status(409, { error: 'FILE_CHANGED' });
      const summary = await replaceUserData(user.id, entries);
      return { status: 'complete', summary };
    } catch (error) {
      if (error instanceof InvalidImportFileError) return status(422, { error: 'INVALID_IMPORT_FILE', detail: error.message });
      throw error;
    }
  }, {
    body: t.Object({
      file: t.File(),
      digest: t.String({ pattern: '^[a-f0-9]{64}$' }),
      confirmation: t.String(),
    }),
  });
