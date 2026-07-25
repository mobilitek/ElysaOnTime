import { Elysia, t } from 'elysia';
import { SESSION_COOKIE_NAME } from '../auth/constants';
import { getSessionToken } from '../auth/cookie';
import { getUserBySessionToken } from '../auth/service';
import {
  closeHourBankWeek,
  getHourBankWeek,
  HourBankUnavailableError,
  InvalidHourBankWeekError,
} from './service';

const authenticatedUser = async (cookieValue: unknown) =>
  getUserBySessionToken(getSessionToken(cookieValue));

export const hourBankRoutes = new Elysia({ prefix: '/api/hour-bank' })
  .get('/week', async ({ cookie, query, status }) => {
    const user = await authenticatedUser(cookie[SESSION_COOKIE_NAME].value);
    if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    try {
      return await getHourBankWeek(user.id, query.clientId, query.weekStart);
    } catch (error) {
      if (error instanceof HourBankUnavailableError) {
        return status(404, { error: 'HOUR_BANK_UNAVAILABLE', message: error.message });
      }
      if (error instanceof InvalidHourBankWeekError) {
        return status(422, { error: 'INVALID_WEEK', message: error.message });
      }
      throw error;
    }
  }, {
    query: t.Object({
      clientId: t.String({ format: 'uuid' }),
      weekStart: t.String({ format: 'date' }),
    }),
  })
  .put('/week', async ({ body, cookie, status }) => {
    const user = await authenticatedUser(cookie[SESSION_COOKIE_NAME].value);
    if (!user) return status(401, { error: 'UNAUTHENTICATED' });
    try {
      return await closeHourBankWeek(user.id, body.clientId, body.weekStart, body);
    } catch (error) {
      if (error instanceof HourBankUnavailableError) {
        return status(404, { error: 'HOUR_BANK_UNAVAILABLE', message: error.message });
      }
      if (error instanceof InvalidHourBankWeekError) {
        return status(422, { error: 'INVALID_WEEK', message: error.message });
      }
      throw error;
    }
  }, {
    body: t.Object({
      clientId: t.String({ format: 'uuid' }),
      weekStart: t.String({ format: 'date' }),
      note: t.String({ maxLength: 500 }),
    }),
  });
