import { createInterface } from 'node:readline/promises';
import { stdin, stdout } from 'node:process';
import { closeDatabase } from '../database';
import { createUser, DuplicateEmailError } from '../modules/auth/service';

const terminal = createInterface({ input: stdin, output: stdout });

/** Demande une valeur interactive et refuse les réponses vides. */
const askRequired = async (label: string): Promise<string> => {
  const value = (await terminal.question(label)).trim();

  if (!value) {
    throw new Error(`${label.trim()} is required`);
  }

  return value;
};

try {
  // Cette commande permet de créer le premier compte sans exposer de route
  // administrative supplémentaire dans l'API.
  const firstName = await askRequired('First name: ');
  const lastName = await askRequired('Last name: ');
  const email = await askRequired('Email: ');
  const password = await askRequired('Password (minimum 12 characters): ');

  if (password.length < 12) {
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
  // Fermer readline et PostgreSQL permet au processus Bun de se terminer proprement.
  terminal.close();
  await closeDatabase();
}
