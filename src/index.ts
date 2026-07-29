import { sql } from 'drizzle-orm';
import { createApp } from './app';
import { config } from './config';
import { database } from './database';
import { databaseTarget, explainDatabaseError } from './database-diagnostics';

// Point d'entrée minimal : toute la composition de l'API demeure dans createApp,
// ce qui permet de réutiliser exactement la même application dans les tests.
const app = createApp().listen(config.port);

console.log(`Elysia Ontime API listening on http://localhost:${app.server?.port}`);

const reportDatabaseStatus = async () => {
  const target = databaseTarget(config.databaseUrl);
  const label = `${target.database} sur ${target.host}:${target.port} (utilisateur ${target.user})`;

  try {
    const result = await database.execute<{ database: string; user: string }>(
      sql`SELECT current_database() AS database, current_user AS "user"`,
    );
    const connected = result[0];

    console.log(
      `✅ PostgreSQL connecté : ${connected?.database ?? target.database} sur ${target.host}:${target.port} (utilisateur ${connected?.user ?? target.user}).`,
    );
  } catch (error) {
    console.error(`❌ PostgreSQL non connecté : ${label}.`);
    console.error(`   ${explainDatabaseError(error)}`);
  }
};

void reportDatabaseStatus();
