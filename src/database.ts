import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from './config';
import * as schema from './db/schema';

const client = postgres(config.databaseUrl, {
  max: 10,
});

export const database = drizzle(client, { schema });

export const closeDatabase = async (): Promise<void> => {
  await client.end();
};
