import { Elysia, t } from 'elysia';
import { config } from '../../config';
import {
  REMEMBERED_SESSION_DURATION_SECONDS,
  SESSION_COOKIE_NAME,
} from './constants';
import { authenticate, deleteSession, getUserBySessionToken } from './service';

const credentialsSchema = t.Object({
  email: t.String({ format: 'email', maxLength: 320 }),
  password: t.String({ minLength: 8, maxLength: 200 }),
  rememberMe: t.Optional(t.Boolean()),
});

const getSessionToken = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;

export const auth = new Elysia({ prefix: '/api/auth' })
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
        secure: config.isProduction,
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
  });
