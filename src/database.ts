import postgres from 'postgres';
import { config } from './config';

export const database = postgres(config.databaseUrl, {
  max: 10,
});

export const closeDatabase = async (): Promise<void> => {
  await database.end();
};
