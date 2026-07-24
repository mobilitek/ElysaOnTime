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
    return process.env.COOKIE_SECURE
      ? process.env.COOKIE_SECURE === 'true'
      : process.env.NODE_ENV === 'production';
  },
  get forceHttps(): boolean {
    return process.env.FORCE_HTTPS === 'true';
  },
  port: Number(process.env.PORT ?? 3000),
};
