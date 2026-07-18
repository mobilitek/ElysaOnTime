export const getSessionToken = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
