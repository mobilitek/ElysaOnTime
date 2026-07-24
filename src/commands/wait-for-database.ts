import postgres from 'postgres';
import { config } from '../config';

const MAX_WAIT_MS = 60_000;
const RETRY_INTERVAL_MS = 3_000;

const sleep = (milliseconds: number) =>
  new Promise((resolve) => setTimeout(resolve, milliseconds));

export const waitForDatabase = async (
  check: () => Promise<void>,
  maxWaitMs = MAX_WAIT_MS,
  retryIntervalMs = RETRY_INTERVAL_MS,
) => {
  const deadline = Date.now() + maxWaitMs;
  let attempt = 0;
  let lastError: unknown;

  while (Date.now() < deadline) {
    attempt += 1;
    try {
      await check();
      return attempt;
    } catch (error) {
      lastError = error;
      const remaining = deadline - Date.now();
      if (remaining > 0) {
        console.log(`PostgreSQL indisponible; nouvelle tentative dans ${Math.min(retryIntervalMs, remaining)} ms...`);
        await sleep(Math.min(retryIntervalMs, remaining));
      }
    }
  }

  throw new Error(
    `PostgreSQL demeure indisponible après ${Math.round(maxWaitMs / 1_000)} secondes.`,
    { cause: lastError },
  );
};

const run = async () => {
  const sql = postgres(config.databaseUrl, {
    max: 1,
    connect_timeout: 3,
  });

  try {
    const attempts = await waitForDatabase(async () => {
      await sql`SELECT 1`;
    });
    console.log(`PostgreSQL prêt après ${attempts} tentative${attempts > 1 ? 's' : ''}.`);
  } finally {
    await sql.end({ timeout: 1 });
  }
};

if (import.meta.main) {
  await run().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  });
}
