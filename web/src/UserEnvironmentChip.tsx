type User = {
  firstName: string;
  lastName: string;
};

export type SystemInfo = {
  environment: 'development' | 'staging' | 'production';
  database: string;
};

type Props = {
  user: User;
  systemInfo: SystemInfo | null;
  systemInfoError: boolean;
  logoutLabel: string;
  onLogout: () => Promise<void>;
};

const environmentLabel = {
  development: 'DEV',
  staging: 'STAGING',
  production: 'PROD',
} as const;

/**
 * Identifie simultanément la personne connectée et la base réellement utilisée
 * par l'API. L'absence d'information est explicite afin d'éviter une fausse
 * impression de sécurité lorsque PostgreSQL ne peut pas être interrogé.
 */
export function UserEnvironmentChip({
  user,
  systemInfo,
  systemInfoError,
  logoutLabel,
  onLogout,
}: Props) {
  const stateClass = systemInfo
    ? `environment-${systemInfo.environment}`
    : systemInfoError
      ? 'environment-error'
      : 'environment-loading';

  return (
    <div className="user-chip">
      <span>{user.firstName[0]}{user.lastName[0]}</span>
      <div>
        <strong>{user.firstName} {user.lastName}</strong>
        {systemInfo?.environment === 'production' ? null : (
          <small className={`environment-badge ${stateClass}`}>
            {systemInfo
              ? `${environmentLabel[systemInfo.environment]} · ${systemInfo.database}`
              : systemInfoError
                ? 'BD INCONNUE'
                : 'BD…'}
          </small>
        )}
        <button type="button" onClick={() => void onLogout()}>{logoutLabel}</button>
      </div>
    </div>
  );
}
