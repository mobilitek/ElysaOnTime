/** Extrait uniquement une valeur de témoin textuelle acceptée par le service. */
export const getSessionToken = (value: unknown): string | undefined =>
  typeof value === 'string' ? value : undefined;
