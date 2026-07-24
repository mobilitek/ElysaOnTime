import { defineConfig } from 'drizzle-kit';

if (!process.env.DATABASE_URL) {
  // Drizzle Kit doit cibler explicitement la même base que l'application.
  throw new Error('Missing environment variable: DATABASE_URL');
}

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/db/schema.ts',
  out: './drizzle',
  dbCredentials: {
    url: process.env.DATABASE_URL,
  },
  // Le mode strict demande une confirmation pour les opérations risquées
  // exécutées directement par Drizzle Kit.
  strict: true,
  verbose: true,
});
