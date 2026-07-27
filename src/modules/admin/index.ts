import { Elysia, t } from 'elysia';
import { SESSION_COOKIE_NAME } from '../auth/constants';
import { getSessionToken } from '../auth/cookie';
import {
  DuplicateEmailError,
  getUserBySessionToken,
} from '../auth/service';
import {
  createManagedUser,
  InvalidSubscriptionError,
  listManagedUsers,
  ManagedUserNotFoundError,
  ProtectedAdministratorError,
  updateManagedUser,
} from './service';
import {
  InvalidSubscriptionPeriodError,
  listSubscriptions,
  recordSubscription,
  SubscriptionUserNotFoundError,
} from '../subscriptions/service';

const date = t.String({ pattern: '^\\d{4}-\\d{2}-\\d{2}$' });
const status = t.Union([
  t.Literal('active'),
  t.Literal('suspended'),
  t.Literal('disabled'),
]);
const optionalEnd = t.Optional(t.Union([date, t.Null()]));

const administrator = async (cookieValue: unknown) => {
  const user = await getUserBySessionToken(getSessionToken(cookieValue));
  return user?.isAdmin ? user : null;
};

const errorResponse = (
  error: unknown,
  statusCode: (code: number, body: unknown) => unknown,
) => {
  if (error instanceof ManagedUserNotFoundError) {
    return statusCode(404, { error: 'USER_NOT_FOUND' });
  }
  if (error instanceof DuplicateEmailError) {
    return statusCode(409, { error: 'EMAIL_EXISTS' });
  }
  if (error instanceof InvalidSubscriptionError) {
    return statusCode(422, { error: 'INVALID_SUBSCRIPTION' });
  }
  if (error instanceof ProtectedAdministratorError) {
    return statusCode(409, { error: 'PROTECTED_ADMINISTRATOR' });
  }
  if (error instanceof SubscriptionUserNotFoundError) {
    return statusCode(404, { error: 'USER_NOT_FOUND' });
  }
  if (error instanceof InvalidSubscriptionPeriodError) {
    return statusCode(422, { error: 'INVALID_SUBSCRIPTION' });
  }
  throw error;
};

/** Toutes les routes de ce module exigent un rôle administrateur vérifié côté serveur. */
export const adminRoutes = new Elysia({ prefix: '/api/admin' })
  .get('/users', async ({ cookie, query, status: statusCode }) => {
    if (!await administrator(cookie[SESSION_COOKIE_NAME].value)) {
      return statusCode(403, { error: 'ADMIN_REQUIRED' });
    }
    return listManagedUsers(query.search ?? '', query.page, query.pageSize);
  }, {
    query: t.Object({
      search: t.Optional(t.String({ maxLength: 200 })),
      page: t.Integer({ minimum: 1, default: 1 }),
      pageSize: t.Integer({ minimum: 10, maximum: 100, default: 25 }),
    }),
  })
  .post('/users', async ({ body, cookie, status: statusCode }) => {
    if (!await administrator(cookie[SESSION_COOKIE_NAME].value)) {
      return statusCode(403, { error: 'ADMIN_REQUIRED' });
    }
    try {
      return statusCode(201, { user: await createManagedUser(body) });
    } catch (error) {
      return errorResponse(error, statusCode);
    }
  }, {
    body: t.Object({
      firstName: t.String({ minLength: 1, maxLength: 100 }),
      lastName: t.String({ minLength: 1, maxLength: 100 }),
      email: t.String({ format: 'email', maxLength: 320 }),
      password: t.String({ minLength: 12, maxLength: 200 }),
      isAdmin: t.Boolean(),
      accountStatus: status,
      subscriptionStartedOn: date,
      subscriptionEndsOn: t.Union([date, t.Null()]),
    }),
  })
  .patch('/users/:id', async ({ params, body, cookie, status: statusCode }) => {
    const admin = await administrator(cookie[SESSION_COOKIE_NAME].value);
    if (!admin) return statusCode(403, { error: 'ADMIN_REQUIRED' });
    try {
      return { user: await updateManagedUser(admin.id, params.id, body) };
    } catch (error) {
      return errorResponse(error, statusCode);
    }
  }, {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    body: t.Object({
      firstName: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      lastName: t.Optional(t.String({ minLength: 1, maxLength: 100 })),
      email: t.Optional(t.String({ format: 'email', maxLength: 320 })),
      isAdmin: t.Optional(t.Boolean()),
      accountStatus: t.Optional(status),
      subscriptionStartedOn: t.Optional(date),
      subscriptionEndsOn: optionalEnd,
    }),
  })
  .get('/users/:id/subscriptions', async ({ params, cookie, status: statusCode }) => {
    if (!await administrator(cookie[SESSION_COOKIE_NAME].value)) {
      return statusCode(403, { error: 'ADMIN_REQUIRED' });
    }
    return { subscriptions: await listSubscriptions(params.id) };
  }, {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
  })
  .post('/users/:id/subscriptions', async ({ params, body, cookie, status: statusCode }) => {
    const admin = await administrator(cookie[SESSION_COOKIE_NAME].value);
    if (!admin) return statusCode(403, { error: 'ADMIN_REQUIRED' });
    try {
      return statusCode(201, {
        subscription: await recordSubscription(admin.id, params.id, body),
      });
    } catch (error) {
      return errorResponse(error, statusCode);
    }
  }, {
    params: t.Object({ id: t.String({ format: 'uuid' }) }),
    body: t.Object({
      periodStartedOn: date,
      periodEndsOn: date,
      paymentDate: t.Union([date, t.Null()]),
      amount: t.String({ pattern: '^\\d{1,10}(\\.\\d{1,2})?$' }),
      subscriptionType: t.Union([
        t.Literal('trial'), t.Literal('free'), t.Literal('paid'), t.Literal('manual'),
      ]),
      paymentStatus: t.Union([
        t.Literal('pending'), t.Literal('paid'), t.Literal('failed'),
        t.Literal('refunded'), t.Literal('cancelled'),
      ]),
      paymentProvider: t.Union([t.String({ maxLength: 50 }), t.Null()]),
      externalReference: t.Union([t.String({ maxLength: 200 }), t.Null()]),
      note: t.String({ maxLength: 1000 }),
    }),
  });
