import { Elysia } from 'elysia';
import { SESSION_COOKIE_NAME } from '../auth/constants';
import { getSessionToken } from '../auth/cookie';
import { getUserBySessionToken } from '../auth/service';
import { getSubscriptionOverview } from './service';

/** Consultation en lecture seule de la souscription du compte connecté. */
export const subscriptionRoutes = new Elysia({ prefix: '/api/subscriptions' })
  .get('/', async ({ cookie, status }) => {
    const user = await getUserBySessionToken(
      getSessionToken(cookie[SESSION_COOKIE_NAME].value),
    );
    if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    return getSubscriptionOverview(user.id);
  });
