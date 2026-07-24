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
  get appUrl(): string {
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
