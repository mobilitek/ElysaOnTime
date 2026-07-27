type RateLimitBucket = {
  requests: number[];
};

const buckets = new Map<string, RateLimitBucket>();
const MAXIMUM_BUCKETS = 10_000;

export type RateLimitRule = {
  key: string;
  limit: number;
  windowMs: number;
};

/**
 * Limiteur volontairement local au processus : OnTime n'exécute qu'un backend.
 * Les clés combinent une portée (route, compte ou adresse) et une valeur normalisée.
 */
export const consumeRateLimit = (
  rule: RateLimitRule,
  now = Date.now(),
): boolean => {
  // Une attaque avec des identifiants toujours différents ne doit pas pouvoir
  // faire croître la mémoire du processus sans limite.
  while (buckets.size >= MAXIMUM_BUCKETS && !buckets.has(rule.key)) {
    const oldestKey = buckets.keys().next().value;
    if (!oldestKey) break;
    buckets.delete(oldestKey);
  }

  const cutoff = now - rule.windowMs;
  const bucket = buckets.get(rule.key) ?? { requests: [] };
  bucket.requests = bucket.requests.filter((timestamp) => timestamp > cutoff);

  if (bucket.requests.length >= rule.limit) {
    buckets.set(rule.key, bucket);
    return false;
  }

  bucket.requests.push(now);
  buckets.set(rule.key, bucket);
  return true;
};

export const consumeRateLimits = (
  rules: RateLimitRule[],
  now = Date.now(),
): boolean => {
  let allowed = true;

  // Consommer chaque compteur évite qu'une clé bloquée permette de contourner
  // silencieusement les autres limites (par exemple compte versus adresse IP).
  for (const rule of rules) {
    if (!consumeRateLimit(rule, now)) allowed = false;
  }

  return allowed;
};

export const requestAddress = (request: Request): string => {
  const forwardedAddresses = request.headers.get('x-forwarded-for')
    ?.split(',')
    .map((address) => address.trim())
    .filter(Boolean);
  // Le proxy de confiance ajoute l'adresse qu'il voit à la fin de la chaîne.
  // Prendre la dernière valeur empêche un client de choisir la première.
  const forwarded = forwardedAddresses?.at(-1);
  const real = request.headers.get('x-real-ip')?.trim();

  return forwarded || real || 'unknown';
};

export const resetRateLimitsForTests = () => buckets.clear();
