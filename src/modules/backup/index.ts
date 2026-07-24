import { Elysia, t } from 'elysia';
import { SESSION_COOKIE_NAME } from '../auth/constants';
import { getSessionToken } from '../auth/cookie';
import { getUserBySessionToken } from '../auth/service';
import { createBackup, InvalidBackupFileError, parseBackupFile, restoreBackup } from './service';

const userFor = async (value: unknown) => getUserBySessionToken(getSessionToken(value));
const fileBody = t.Object({ file: t.File() });
const filename = () => `OnTime-backup-${new Date().toISOString().slice(0, 10)}.json`;

export const backupRoutes = new Elysia({ prefix: '/api/backup' })
  .get('/download', async ({ cookie, set, status }) => {
    const user = await userFor(cookie[SESSION_COOKIE_NAME].value);
    if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    set.headers['content-type'] = 'application/json; charset=utf-8';
    set.headers['content-disposition'] = `attachment; filename="${filename()}"`;
    return JSON.stringify(await createBackup(user.id), null, 2);
  })
  .post('/analyze', async ({ body, cookie, status }) => {
    const user = await userFor(cookie[SESSION_COOKIE_NAME].value);
    if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    try {
      return { analysis: (await parseBackupFile(body.file)).analysis };
    } catch (error) {
      if (error instanceof InvalidBackupFileError) return status(422, { error: 'INVALID_BACKUP_FILE', detail: error.message });
      throw error;
    }
  }, { body: fileBody })
  .post('/restore', async ({ body, cookie, status }) => {
    const user = await userFor(cookie[SESSION_COOKIE_NAME].value);
    if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    if (body.confirmation !== 'RESTAURER') return status(422, { error: 'CONFIRMATION_REQUIRED' });
    try {
      const { backup, analysis } = await parseBackupFile(body.file);
      if (analysis.digest !== body.digest) return status(409, { error: 'FILE_CHANGED' });
      return { status: 'complete', summary: await restoreBackup(user.id, backup) };
    } catch (error) {
      if (error instanceof InvalidBackupFileError) return status(422, { error: 'INVALID_BACKUP_FILE', detail: error.message });
      throw error;
    }
  }, {
    body: t.Object({
      file: t.File(),
      digest: t.String({ pattern: '^[a-f0-9]{64}$' }),
      confirmation: t.String(),
    }),
  });
