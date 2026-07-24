import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from './config';
import * as schema from './db/schema';

// Le groupe de connexions est volontairement limité pour convenir aux ressources
// du NAS et éviter qu'une seule instance de l'API monopolise PostgreSQL.
const client = postgres(config.databaseUrl, {
  max: 10,
});

export const database = drizzle(client, { schema });

/** Ferme proprement toutes les connexions, notamment dans les commandes CLI. */
export const closeDatabase = async (): Promise<void> => {
  await client.end();
};
