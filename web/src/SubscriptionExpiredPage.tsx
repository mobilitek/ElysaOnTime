import { useState } from 'react';
import { type SystemInfo, UserEnvironmentChip } from './UserEnvironmentChip';

type Language = 'fr' | 'en';
type User = {
  email: string;
  firstName: string;
  lastName: string;
  subscriptionEndsOn: string | null;
};

type Props = {
  language: Language;
  user: User;
  systemInfo: SystemInfo | null;
  systemInfoError: boolean;
  onLanguageChange: (value: Language) => void;
  onLogout: () => Promise<void>;
  onNavigateProfile: () => void;
};

const copy = {
  fr: {
    title: 'Votre souscription est terminée',
    description: 'Votre compte demeure sécurisé et vos données sont conservées. Renouvelez votre souscription pour recommencer à modifier votre journal.',
    expiredOn: 'Souscription terminée le',
    renew: 'Demander un renouvellement',
    profile: 'Gérer mon profil et mon mot de passe',
    backup: 'Télécharger une sauvegarde',
    backupBusy: 'Préparation…',
    readOnly: 'Accès limité',
    readOnlyDetail: 'La modification des clients, projets et entrées est désactivée. Votre profil et la sauvegarde de vos données restent accessibles.',
    logout: 'Se déconnecter',
  },
  en: {
    title: 'Your subscription has ended',
    description: 'Your account remains secure and your data is retained. Renew your subscription to resume editing your work log.',
    expiredOn: 'Subscription ended on',
    renew: 'Request renewal',
    profile: 'Manage my profile and password',
    backup: 'Download a backup',
    backupBusy: 'Preparing…',
    readOnly: 'Limited access',
    readOnlyDetail: 'Editing clients, projects and entries is disabled. Your profile and data backup remain available.',
    logout: 'Sign out',
  },
} as const;

export function SubscriptionExpiredPage({
  language,
  user,
  systemInfo,
  systemInfoError,
  onLanguageChange,
  onLogout,
  onNavigateProfile,
}: Props) {
  const text = copy[language];
  const [backupBusy, setBackupBusy] = useState(false);
  const endDate = user.subscriptionEndsOn
    ? new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA', {
      dateStyle: 'long',
    }).format(new Date(`${user.subscriptionEndsOn}T12:00:00`))
    : '—';
  const renewalSubject = encodeURIComponent(`OnTime - renouvellement - ${user.email}`);

  const downloadBackup = async () => {
    setBackupBusy(true);
    try {
      const response = await fetch('/api/backup/download', { credentials: 'include' });
      if (!response.ok) return;
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const filename = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'OnTime-backup.json';
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      link.click();
      URL.revokeObjectURL(url);
    } finally {
      setBackupBusy(false);
    }
  };

  return (
    <main className="app-page">
      <header className="app-header">
        <div className="app-brand"><span className="brand-mark">OT</span><span>OnTime</span></div>
        <div className="header-actions">
          <div className="language-switch compact">
            {(['fr', 'en'] as const).map((value) => (
              <button key={value} className={language === value ? 'active' : ''} onClick={() => onLanguageChange(value)}>
                {value.toUpperCase()}
              </button>
            ))}
          </div>
          <UserEnvironmentChip user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} logoutLabel={text.logout} onLogout={onLogout} />
        </div>
      </header>
      <section className="subscription-expired-shell">
        <div className="subscription-expired-card">
          <span className="subscription-lock" aria-hidden="true">⌛</span>
          <p className="eyebrow">ONTIME</p>
          <h1>{text.title}</h1>
          <p className="subscription-description">{text.description}</p>
          <div className="subscription-date"><span>{text.expiredOn}</span><strong>{endDate}</strong></div>
          <div className="subscription-limited"><strong>{text.readOnly}</strong><p>{text.readOnlyDetail}</p></div>
          <div className="subscription-actions">
            <a className="primary-button" href={`mailto:ontime@mobilitek.com?subject=${renewalSubject}`}>{text.renew}</a>
            <button className="secondary-button" onClick={onNavigateProfile}>{text.profile}</button>
            <button className="secondary-button" disabled={backupBusy} onClick={() => void downloadBackup()}>
              {backupBusy ? text.backupBusy : text.backup}
            </button>
          </div>
        </div>
      </section>
    </main>
  );
}
