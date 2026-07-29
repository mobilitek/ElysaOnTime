type DatabaseError = Error & {
  code?: string;
  errno?: string | number;
};

export const databaseTarget = (databaseUrl: string) => {
  const url = new URL(databaseUrl);

  return {
    database: url.pathname.slice(1) || '(non précisée)',
    host: url.hostname,
    port: url.port || '5432',
    user: decodeURIComponent(url.username),
  };
};

export const explainDatabaseError = (error: unknown): string => {
  const databaseError = error as Partial<DatabaseError>;
  const code = String(databaseError.code ?? databaseError.errno ?? '');

  if (code === 'ECONNREFUSED') {
    return 'Connexion refusée. Vérifiez que PostgreSQL écoute sur cet hôte et ce port, ou que le tunnel SSH est ouvert.';
  }
  if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') {
    return 'Hôte introuvable. Vérifiez le nom ou l’adresse du serveur dans DATABASE_URL.';
  }
  if (code === 'ETIMEDOUT' || code === 'CONNECT_TIMEOUT') {
    return 'Délai de connexion dépassé. Vérifiez le réseau, le pare-feu et l’adresse du serveur.';
  }
  if (code === '28P01') {
    return 'Authentification PostgreSQL refusée. Vérifiez le nom d’utilisateur et le mot de passe.';
  }
  if (code === '3D000') {
    return 'La base demandée n’existe pas sur ce serveur.';
  }
  if (code === '42501') {
    return 'L’utilisateur PostgreSQL ne possède pas les permissions requises.';
  }

  return code
    ? `Erreur PostgreSQL ${code}. Consultez DATABASE_URL et la disponibilité du serveur.`
    : 'Erreur PostgreSQL inconnue. Vérifiez DATABASE_URL et la disponibilité du serveur.';
};
