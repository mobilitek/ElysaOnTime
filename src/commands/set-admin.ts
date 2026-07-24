import { closeDatabase } from '../database';
import { setAdminByEmail, UserNotFoundError } from '../modules/auth/service';

const argumentsAfterSeparator = process.argv.slice(2);
const emailIndex = argumentsAfterSeparator.indexOf('--email');
const email = emailIndex >= 0 ? argumentsAfterSeparator[emailIndex + 1]?.trim() : undefined;
const grant = argumentsAfterSeparator.includes('--grant');
const revoke = argumentsAfterSeparator.includes('--revoke');

try {
  if (!email) {
    throw new Error('Usage: bun run user:admin -- --email user@example.com --grant|--revoke');
  }
  if (grant === revoke) {
    throw new Error('Choose exactly one option: --grant or --revoke');
  }

  const user = await setAdminByEmail(email, grant);
  console.log(`Administrator access ${grant ? 'granted to' : 'revoked from'} ${user.email}`);
} catch (error) {
  if (error instanceof UserNotFoundError) {
    console.error('User not found');
  } else {
    console.error(error instanceof Error ? error.message : 'Administrator update failed');
  }
  process.exitCode = 1;
} finally {
  await closeDatabase();
}
