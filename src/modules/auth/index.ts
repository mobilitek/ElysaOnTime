import { Elysia, t } from 'elysia';
import { config } from '../../config';
import {
  REMEMBERED_SESSION_DURATION_SECONDS,
  SESSION_COOKIE_NAME,
} from './constants';
import { getSessionToken } from './cookie';
import { sendPasswordResetEmail, sendWelcomeEmail } from '../email/service';
import { createTrialSubscription } from '../subscriptions/service';
import { authenticate, changePassword, createPasswordReset, createUser, deleteSession, DuplicateEmailError, getUserBySessionToken, InvalidCurrentPasswordError, resetPassword, updateProfile } from './service';
import { consumeRateLimits, requestAddress } from '../../security/rate-limit';

const MINIMUM_NEW_PASSWORD_LENGTH = 12;
const FIFTEEN_MINUTES_MS = 15 * 60 * 1000;
const ONE_HOUR_MS = 60 * 60 * 1000;

const rateLimited = (
  status: (code: number, body: unknown) => unknown,
) => status(429, { error: 'TOO_MANY_REQUESTS' });

const credentialsSchema = t.Object({
  email: t.String({ format: 'email', maxLength: 320 }),
  // La connexion demeure compatible avec les anciens comptes; toute nouvelle
  // valeur est soumise à la politique renforcée ci-dessous.
  password: t.String({ minLength: 1, maxLength: 200 }),
  rememberMe: t.Optional(t.Boolean()),
});

/**
 * Routes d'authentification publiques et protégées.
 * Les schémas Elysia rejettent les données mal formées avant le service métier.
 */
export const auth = new Elysia({ prefix: '/api/auth' })
  .post('/register', async ({ body, request, status }) => {
    const address = requestAddress(request);
    if (!consumeRateLimits([
      { key: `register:ip:${address}`, limit: 5, windowMs: ONE_HOUR_MS },
      { key: `register:email:${body.email.trim().toLowerCase()}`, limit: 3, windowMs: ONE_HOUR_MS },
    ])) return rateLimited(status);

    try {
      const user = await createUser(body);
      const trial = await createTrialSubscription(user.id);
      const registeredUser = {
        ...user,
        subscriptionStartedOn: trial.periodStartedOn,
        subscriptionEndsOn: trial.periodEndsOn,
      };
      // Les tests d'intégration ne doivent jamais expédier de vrais courriels.
      try {
        if (process.env.RUN_INTEGRATION_TESTS === '1') {
          return status(201, { user: registeredUser });
        }
        await sendWelcomeEmail(
          { email: registeredUser.email, firstName: registeredUser.firstName },
          body.language,
          trial.periodStartedOn,
          trial.periodEndsOn,
        );
      } catch (error) {
        console.error('Unable to send welcome email', error);
      }
      return status(201, { user: registeredUser });
    }
    catch (error) { if (error instanceof DuplicateEmailError) return status(409, { error: 'EMAIL_EXISTS' }); throw error; }
  }, { body: t.Object({ firstName: t.String({ minLength: 1, maxLength: 100 }), lastName: t.String({ minLength: 1, maxLength: 100 }), email: t.String({ format: 'email', maxLength: 320 }), password: t.String({ minLength: MINIMUM_NEW_PASSWORD_LENGTH, maxLength: 200 }), language: t.Union([t.Literal('fr'), t.Literal('en')]) }) })
  .post(
    '/login',
    async ({ body, cookie, request, status }) => {
      const address = requestAddress(request);
      if (!consumeRateLimits([
        { key: `login:ip:${address}`, limit: 60, windowMs: FIFTEEN_MINUTES_MS },
        { key: `login:account:${body.email.trim().toLowerCase()}`, limit: 15, windowMs: FIFTEEN_MINUTES_MS },
      ])) return rateLimited(status);

      const session = await authenticate(body.email, body.password, body.rememberMe ?? false);

      if (!session) {
        return status(401, {
          error: 'INVALID_CREDENTIALS',
          message: 'Invalid email address or password',
        });
      }

      cookie[SESSION_COOKIE_NAME].set({
        // Le JavaScript du navigateur ne peut pas lire ce témoin. SameSite=Lax
        // réduit aussi les risques d'envoi lors d'une requête intersite.
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
  .post('/forgot-password', async ({ body, request, status }) => {
    const address = requestAddress(request);
    if (!consumeRateLimits([
      { key: `forgot:ip:${address}`, limit: 10, windowMs: ONE_HOUR_MS },
      { key: `forgot:account:${body.email.trim().toLowerCase()}`, limit: 3, windowMs: ONE_HOUR_MS },
    ])) return rateLimited(status);

    const reset = await createPasswordReset(body.email);
    if (reset) {
      try {
        await sendPasswordResetEmail(reset, reset.token);
      } catch (error) {
        console.error('Unable to send password reset email', error);
      }
    }

    // Toujours répondre 202 afin de ne pas révéler l'existence du compte.
    return status(202, { success: true });
  }, {
    body: t.Object({
      email: t.String({ format: 'email', maxLength: 320 }),
    }),
  })
  .post('/reset-password', async ({ body, request, status }) => {
    const address = requestAddress(request);
    if (!consumeRateLimits([
      { key: `reset:ip:${address}`, limit: 20, windowMs: FIFTEEN_MINUTES_MS },
      { key: `reset:token:${body.token}`, limit: 10, windowMs: FIFTEEN_MINUTES_MS },
    ])) return rateLimited(status);

    if (!(await resetPassword(body.token, body.password))) {
      return status(422, { error: 'INVALID_OR_EXPIRED_TOKEN' });
    }

    return { success: true };
  }, {
    body: t.Object({
      token: t.String({ minLength: 20, maxLength: 200 }),
      password: t.String({ minLength: MINIMUM_NEW_PASSWORD_LENGTH, maxLength: 200 }),
    }),
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
    try {
      await changePassword(user.id, body.currentPassword, body.newPassword);
      cookie[SESSION_COOKIE_NAME].remove();
      return { success: true };
    }
    catch (error) { if (error instanceof InvalidCurrentPasswordError) return status(422, { error: 'INVALID_CURRENT_PASSWORD' }); throw error; }
  }, { body: t.Object({ currentPassword: t.String({ minLength: 1, maxLength: 200 }), newPassword: t.String({ minLength: MINIMUM_NEW_PASSWORD_LENGTH, maxLength: 200 }) }) });
