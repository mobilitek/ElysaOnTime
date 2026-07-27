import { type FormEvent, useEffect, useState } from 'react';
import { type SystemInfo, UserEnvironmentChip } from './UserEnvironmentChip';

type Language = 'fr' | 'en';
type User = {
  id: string; email: string; firstName: string; lastName: string; isAdmin: boolean;
  accountStatus: 'active' | 'suspended' | 'disabled';
  subscriptionStartedOn: string; subscriptionEndsOn: string | null;
  accessLevel: 'full' | 'subscription_expired';
};
type Subscription = {
  id: string; periodStartedOn: string; periodEndsOn: string;
  paymentDate: string | null; amount: string;
  subscriptionType: 'trial' | 'free' | 'paid' | 'manual';
  paymentStatus: 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
  paymentProvider: string | null; externalReference: string | null; note: string;
};
type Props = {
  language: Language; user: User; systemInfo: SystemInfo | null; systemInfoError: boolean;
  onUserChange: (user: User) => void; onLanguageChange: (value: Language) => void;
  onLogout: () => Promise<void>; onNavigateWorkLog: () => void;
  onNavigateClients: () => void; onNavigateProjects: () => void;
};

const copy = {
  fr: {
    journal: 'Journal', clients: 'Mes clients', projects: 'Projets', profile: 'Profil',
    logout: 'Se déconnecter', title: 'Mon profil',
    subtitle: 'Gérez vos renseignements, votre sécurité et votre souscription.',
    info: 'Renseignements personnels', firstName: 'Prénom', lastName: 'Nom',
    email: 'Adresse courriel', save: 'Enregistrer les modifications', saved: 'Profil mis à jour.',
    password: 'Changer le mot de passe', current: 'Mot de passe actuel',
    next: 'Nouveau mot de passe', confirm: 'Confirmer le nouveau mot de passe',
    change: 'Changer le mot de passe', changed: 'Mot de passe modifié.',
    mismatch: 'Les nouveaux mots de passe ne correspondent pas.',
    invalid: 'Le mot de passe actuel est incorrect.', duplicate: 'Cette adresse courriel est déjà utilisée.',
    required: 'Tous les champs sont obligatoires.', error: 'Une erreur est survenue.',
    subscription: 'Souscription', active: 'Active', expired: 'Expirée', unlimited: 'Sans échéance',
    starts: 'Début', ends: 'Fin', renew: 'Demander un renouvellement',
    history: 'Historique des souscriptions', period: 'Période', type: 'Type', payment: 'Paiement',
    amount: 'Montant', status: 'Statut', noHistory: 'Aucun renouvellement enregistré.',
    pending: 'En attente', paid: 'Payé', failed: 'Échoué', refunded: 'Remboursé',
    cancelled: 'Annulé', trial: 'Essai gratuit', free: 'Gratuite', paidSubscription: 'Payante', manual: 'Ajustement manuel',
  },
  en: {
    journal: 'Work log', clients: 'My clients', projects: 'Projects', profile: 'Profile',
    logout: 'Sign out', title: 'My profile',
    subtitle: 'Manage your information, security and subscription.',
    info: 'Personal information', firstName: 'First name', lastName: 'Last name',
    email: 'Email address', save: 'Save changes', saved: 'Profile updated.',
    password: 'Change password', current: 'Current password', next: 'New password',
    confirm: 'Confirm new password', change: 'Change password', changed: 'Password changed.',
    mismatch: 'New passwords do not match.', invalid: 'Current password is incorrect.',
    duplicate: 'This email address is already in use.', required: 'All fields are required.',
    error: 'Something went wrong.', subscription: 'Subscription', active: 'Active',
    expired: 'Expired', unlimited: 'No expiry', starts: 'Start', ends: 'End',
    renew: 'Request renewal', history: 'Subscription history', period: 'Period', type: 'Type',
    payment: 'Payment', amount: 'Amount', status: 'Status',
    noHistory: 'No renewal has been recorded.', pending: 'Pending', paid: 'Paid',
    failed: 'Failed', refunded: 'Refunded', cancelled: 'Cancelled',
    trial: 'Free trial', free: 'Free', paidSubscription: 'Paid', manual: 'Manual adjustment',
  },
} as const;

const displayDate = (value: string | null, language: Language) =>
  value
    ? new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA').format(new Date(`${value}T12:00:00`))
    : '—';

export function ProfilePage({
  language, user, systemInfo, systemInfoError, onUserChange, onLanguageChange,
  onLogout, onNavigateWorkLog, onNavigateClients, onNavigateProjects,
}: Props) {
  const text = copy[language];
  const [firstName, setFirstName] = useState(user.firstName);
  const [lastName, setLastName] = useState(user.lastName);
  const [email, setEmail] = useState(user.email);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [profileMessage, setProfileMessage] = useState('');
  const [passwordMessage, setPasswordMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState<Subscription[]>([]);

  useEffect(() => {
    void fetch('/api/subscriptions', { credentials: 'include' })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then((payload: { history: Subscription[] }) => setHistory(payload.history))
      .catch(() => setHistory([]));
  }, []);

  const saveProfile = async (event: FormEvent) => {
    event.preventDefault(); setProfileMessage('');
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setProfileMessage(text.required); return;
    }
    setSaving(true);
    try {
      const response = await fetch('/api/auth/profile', {
        method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim() }),
      });
      const payload = await response.json() as { user?: User; error?: string };
      if (!response.ok) setProfileMessage(payload.error === 'EMAIL_EXISTS' ? text.duplicate : text.error);
      else if (payload.user) { onUserChange(payload.user); setProfileMessage(text.saved); }
    } catch { setProfileMessage(text.error); } finally { setSaving(false); }
  };

  const savePassword = async (event: FormEvent) => {
    event.preventDefault(); setPasswordMessage('');
    if (newPassword !== confirmation) { setPasswordMessage(text.mismatch); return; }
    setSaving(true);
    try {
      const response = await fetch('/api/auth/change-password', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ currentPassword, newPassword }),
      });
      const payload = await response.json() as { error?: string };
      if (!response.ok) setPasswordMessage(payload.error === 'INVALID_CURRENT_PASSWORD' ? text.invalid : text.error);
      else { setCurrentPassword(''); setNewPassword(''); setConfirmation(''); setPasswordMessage(text.changed); }
    } catch { setPasswordMessage(text.error); } finally { setSaving(false); }
  };

  const renewalSubject = encodeURIComponent(`OnTime - renouvellement - ${user.email}`);
  return (
    <main className="app-page">
      <header className="app-header">
        <div className="app-brand"><span className="brand-mark">OT</span><span>OnTime</span></div>
        <nav className="app-nav">
          <button onClick={onNavigateWorkLog}>{text.journal}</button>
          <button onClick={onNavigateClients}>{text.clients}</button>
          <button onClick={onNavigateProjects}>{text.projects}</button>
          <button className="active">{text.profile}</button>
        </nav>
        <div className="header-actions">
          <div className="language-switch compact">{(['fr', 'en'] as const).map((value) => <button key={value} className={language === value ? 'active' : ''} onClick={() => onLanguageChange(value)}>{value.toUpperCase()}</button>)}</div>
          <UserEnvironmentChip user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} logoutLabel={text.logout} onLogout={onLogout} />
        </div>
      </header>
      <section className="content-shell profile-shell">
        <div className="page-heading"><div><p className="eyebrow">ONTIME</p><h1>{text.title}</h1><p>{text.subtitle}</p></div></div>
        <div className="profile-grid">
          <section className="profile-card"><h2>{text.info}</h2><form onSubmit={saveProfile}>
            <label>{text.firstName}<input value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={100} /></label>
            <label>{text.lastName}<input value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={100} /></label>
            <label>{text.email}<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} maxLength={320} /></label>
            {profileMessage ? <p className={profileMessage === text.saved ? 'success-message' : 'error-message'}>{profileMessage}</p> : null}
            <button className="primary-button" disabled={saving}>{text.save}</button>
          </form></section>
          <section className="profile-card"><h2>{text.password}</h2><form onSubmit={savePassword}>
            <label>{text.current}<input type="password" value={currentPassword} onChange={(event) => setCurrentPassword(event.target.value)} minLength={1} autoComplete="current-password" /></label>
            <label>{text.next}<input type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} minLength={12} autoComplete="new-password" /></label>
            <label>{text.confirm}<input type="password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} minLength={12} autoComplete="new-password" /></label>
            {passwordMessage ? <p className={passwordMessage === text.changed ? 'success-message' : 'error-message'}>{passwordMessage}</p> : null}
            <button className="primary-button" disabled={saving || currentPassword.length < 1 || newPassword.length < 12 || confirmation.length < 12}>{text.change}</button>
          </form></section>
        </div>
        <section className="profile-card subscription-profile-card">
          <div className="subscription-profile-heading"><div><p className="eyebrow">{text.subscription}</p><h2>{user.accessLevel === 'subscription_expired' ? text.expired : user.subscriptionEndsOn ? text.active : text.unlimited}</h2></div><a className="secondary-button" href={`mailto:ontime@mobilitek.com?subject=${renewalSubject}`}>{text.renew}</a></div>
          <div className="subscription-current"><div><span>{text.starts}</span><strong>{displayDate(user.subscriptionStartedOn, language)}</strong></div><div><span>{text.ends}</span><strong>{user.subscriptionEndsOn ? displayDate(user.subscriptionEndsOn, language) : text.unlimited}</strong></div></div>
          <h3>{text.history}</h3>
          <div className="subscription-history"><table><thead><tr><th>{text.period}</th><th>{text.type}</th><th>{text.payment}</th><th>{text.amount}</th><th>{text.status}</th></tr></thead><tbody>
            {history.map((item) => <tr key={item.id}><td>{displayDate(item.periodStartedOn, language)} → {displayDate(item.periodEndsOn, language)}</td><td>{item.subscriptionType === 'paid' ? text.paidSubscription : text[item.subscriptionType]}</td><td>{displayDate(item.paymentDate, language)}</td><td>{new Intl.NumberFormat(language === 'fr' ? 'fr-CA' : 'en-CA', { style: 'currency', currency: 'CAD' }).format(Number(item.amount))}</td><td>{text[item.paymentStatus]}</td></tr>)}
            {!history.length ? <tr><td colSpan={5}>{text.noHistory}</td></tr> : null}
          </tbody></table></div>
        </section>
      </section>
    </main>
  );
}
