/**
 * Centralise la validation des variables obligatoires afin que l'application
 * échoue dès son démarrage plutôt que plus tard au milieu d'une requête.
 */
const requiredEnvironmentVariable = (name: string): string => {
  const value = process.env[name];

  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }

  return value;
};

export const config = {
  get databaseUrl(): string {
    return requiredEnvironmentVariable('DATABASE_URL');
  },
  isProduction: process.env.NODE_ENV === 'production',
  get secureCookies(): boolean {
    // En production, les témoins sont sécurisés par défaut. Une valeur explicite
    // permet toutefois d'exécuter l'application dans un environnement HTTP local.
    return process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production';
  },
  get forceHttps(): boolean {
    return process.env.FORCE_HTTPS === 'true';
  },
  get appUrl(): string {
    // Retirer la barre finale évite de produire des URL contenant deux barres.
    return requiredEnvironmentVariable('APP_URL').replace(/\/+$/, '');
  },
  get smtp() {
    return {
      host: requiredEnvironmentVariable('SMTP_HOST'),
      port: Number(requiredEnvironmentVariable('SMTP_PORT')),
      secure: process.env.SMTP_SECURE === 'true',
      user: requiredEnvironmentVariable('SMTP_USER'),
      password: requiredEnvironmentVariable('SMTP_PASSWORD'),
      from: requiredEnvironmentVariable('SMTP_FROM'),
    };
  },
  port: Number(process.env.PORT ?? 3000),
};
