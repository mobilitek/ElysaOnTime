import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { closeDatabase } from '../database';
import { createUser, DuplicateEmailError } from '../modules/auth/service';

const terminal = createInterface({ input: stdin, output: stdout });

const askRequired = async (label: string): Promise<string> => {
  const value = (await terminal.question(label)).trim();

  if (!value) {
    throw new Error(`${label.trim()} is required`);
  }

  return value;
};

try {
  const firstName = await askRequired('First name: ');
  const lastName = await askRequired('Last name: ');
  const email = await askRequired('Email: ');
  const password = await askRequired('Password (minimum 8 characters): ');

  if (password.length < 8) {
    throw new Error('Password must contain at least 8 characters');
  }

  const user = await createUser({ firstName, lastName, email, password });
  console.log(`User created: ${user.email}`);
} catch (error) {
  if (error instanceof DuplicateEmailError) {
    console.error(error.message);
  } else {
    console.error(error instanceof Error ? error.message : 'User creation failed');
  }
  process.exitCode = 1;
} finally {
  terminal.close();
  await closeDatabase();
}
