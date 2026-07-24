import { Elysia, t } from 'elysia';
import { config } from '../../config';
import {
  REMEMBERED_SESSION_DURATION_SECONDS,
  SESSION_COOKIE_NAME,
} from './constants';
import { getSessionToken } from './cookie';
import { authenticate, changePassword, createUser, deleteSession, DuplicateEmailError, getUserBySessionToken, InvalidCurrentPasswordError, updateProfile } from './service';

const credentialsSchema = t.Object({
  email: t.String({ format: 'email', maxLength: 320 }),
  password: t.String({ minLength: 8, maxLength: 200 }),
  rememberMe: t.Optional(t.Boolean()),
});

export const auth = new Elysia({ prefix: '/api/auth' })
  .post('/register', async ({ body, status }) => {
    try { return status(201, { user: await createUser(body) }); }
    catch (error) { if (error instanceof DuplicateEmailError) return status(409, { error: 'EMAIL_EXISTS' }); throw error; }
  }, { body: t.Object({ firstName: t.String({ minLength: 1, maxLength: 100 }), lastName: t.String({ minLength: 1, maxLength: 100 }), email: t.String({ format: 'email', maxLength: 320 }), password: t.String({ minLength: 8, maxLength: 200 }) }) })
  .post(
    '/login',
    async ({ body, cookie, status }) => {
      const session = await authenticate(body.email, body.password, body.rememberMe ?? false);

      if (!session) {
        return status(401, {
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email address or password',
        });
      }

      cookie[SESSION_COOKIE_NAME].set({
        value: session.token,
        httpOnly: true,
        sameSite: 'lax',
        secure: config.secureCookies,
        path: '/',
        ...(body.rememberMe
          ? {
              expires: session.expiresAt,
              maxAge: REMEMBERED_SESSION_DURATION_SECONDS,
            }
          : {}),
      });

      return { user: session.user };
    },
    { body: credentialsSchema },
  )
  .post('/logout', async ({ cookie }) => {
    const sessionCookie = cookie[SESSION_COOKIE_NAME];
    await deleteSession(getSessionToken(sessionCookie.value));
    sessionCookie.remove();

    return { success: true };
  })
  .get('/session', async ({ cookie, status }) => {
    const user = await getUserBySessionToken(
      getSessionToken(cookie[SESSION_COOKIE_NAME].value),
    );

    if (!user) {
      return status(401, {
        error: 'UNAUTHENTICATED',
        message: 'Authentication required',
      });
    }

    return { user };
  })
  .patch('/profile', async ({ body, cookie, status }) => {
    const user = await getUserBySessionToken(getSessionToken(cookie[SESSION_COOKIE_NAME].value));
    if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    try { return { user: await updateProfile(user.id, body) }; }
    catch (error) { if (error instanceof DuplicateEmailError) return status(409, { error: 'EMAIL_EXISTS' }); throw error; }
  }, { body: t.Object({ firstName: t.String({ minLength: 1, maxLength: 100 }), lastName: t.String({ minLength: 1, maxLength: 100 }), email: t.String({ format: 'email', maxLength: 320 }) }) })
  .post('/change-password', async ({ body, cookie, status }) => {
    const user = await getUserBySessionToken(getSessionToken(cookie[SESSION_COOKIE_NAME].value));
    if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    try { await changePassword(user.id, body.currentPassword, body.newPassword); return { success: true }; }
    catch (error) { if (error instanceof InvalidCurrentPasswordError) return status(422, { error: 'INVALID_CURRENT_PASSWORD' }); throw error; }
  }, { body: t.Object({ currentPassword: t.String({ minLength: 8, maxLength: 200 }), newPassword: t.String({ minLength: 8, maxLength: 200 }) }) });
