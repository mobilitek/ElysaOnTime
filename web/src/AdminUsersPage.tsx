import { type FormEvent, useEffect, useState } from 'react';
import { type SystemInfo, UserEnvironmentChip } from './UserEnvironmentChip';
import { ActivityPanel } from './ActivityPanel';

type Language = 'fr' | 'en';
type AccountStatus = 'active' | 'suspended' | 'disabled';
type CurrentUser = {
  id: string; firstName: string; lastName: string; isAdmin: boolean;
};
type ManagedUser = {
  id: string; email: string; firstName: string; lastName: string;
  isAdmin: boolean; accountStatus: AccountStatus;
  subscriptionStartedOn: string; subscriptionEndsOn: string | null;
  createdAt: string; lastLoginAt: string | null;
  clientCount: number; projectCount: number; entryCount: number;
};
type PaymentStatus = 'pending' | 'paid' | 'failed' | 'refunded' | 'cancelled';
type SubscriptionType = 'trial' | 'free' | 'paid' | 'manual';
type Props = {
  language: Language; user: CurrentUser; systemInfo: SystemInfo | null;
  systemInfoError: boolean; onLanguageChange: (value: Language) => void;
  onLogout: () => Promise<void>; onNavigateWorkLog: () => void;
  onNavigateClients: () => void; onNavigateProjects: () => void;
  onNavigateProfile: () => void;
};

const today = () => {
  const value = new Date();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${value.getFullYear()}-${month}-${day}`;
};
const dateLabel = (value: string | null, language: Language) =>
  value ? new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA').format(new Date(`${value}T12:00:00`)) : '—';

const copy = {
  fr: {
    title: 'Administration', subtitle: 'Gérer les comptes et leurs souscriptions.',
    journal: 'Journal', clients: 'Mes clients', projects: 'Projets', profile: 'Profil',
    admin: 'Administration', logout: 'Se déconnecter', search: 'Rechercher un utilisateur',
    add: 'Nouvel utilisateur', name: 'Utilisateur', status: 'Statut', subscription: 'Souscription',
    activity: 'Données', lastLogin: 'Dernière connexion', actions: 'Actions',
    active: 'Actif', suspended: 'Suspendu', disabled: 'Désactivé', unlimited: 'Sans échéance',
    clientsCount: 'clients', projectsCount: 'projets', entriesCount: 'entrées',
    edit: 'Modifier', create: 'Créer le compte', save: 'Enregistrer', cancel: 'Annuler',
    firstName: 'Prénom', lastName: 'Nom', email: 'Adresse courriel', password: 'Mot de passe initial',
    administrator: 'Administrateur', start: 'Début de souscription', end: 'Fin de souscription',
    noEnd: 'Aucune date de fin', error: 'Impossible d’effectuer cette opération.',
    saved: 'Compte enregistré.', previous: 'Précédente', next: 'Suivante', page: 'Page',
    renewal: 'Renouvellement', renewalTitle: 'Enregistrer un renouvellement',
    paymentDate: 'Date du paiement', amount: 'Montant CAD', paymentStatus: 'Statut du paiement', subscriptionType: 'Type de souscription',
    provider: 'Fournisseur / méthode', reference: 'Référence externe', note: 'Note',
    pending: 'En attente', paid: 'Payé', failed: 'Échoué', refunded: 'Remboursé',
    cancelled: 'Annulé', trial: 'Essai gratuit', free: 'Gratuite', paidSubscription: 'Payante', manual: 'Ajustement manuel', renewalSaved: 'Renouvellement enregistré.',
  },
  en: {
    title: 'Administration', subtitle: 'Manage accounts and subscriptions.',
    journal: 'Work log', clients: 'My clients', projects: 'Projects', profile: 'Profile',
    admin: 'Administration', logout: 'Sign out', search: 'Search users',
    add: 'New user', name: 'User', status: 'Status', subscription: 'Subscription',
    activity: 'Data', lastLogin: 'Last sign-in', actions: 'Actions',
    active: 'Active', suspended: 'Suspended', disabled: 'Disabled', unlimited: 'No expiry',
    clientsCount: 'clients', projectsCount: 'projects', entriesCount: 'entries',
    edit: 'Edit', create: 'Create account', save: 'Save', cancel: 'Cancel',
    firstName: 'First name', lastName: 'Last name', email: 'Email address', password: 'Initial password',
    administrator: 'Administrator', start: 'Subscription start', end: 'Subscription end',
    noEnd: 'No end date', error: 'Unable to complete this operation.',
    saved: 'Account saved.', previous: 'Previous', next: 'Next', page: 'Page',
    renewal: 'Renewal', renewalTitle: 'Record a renewal', paymentDate: 'Payment date',
    amount: 'Amount CAD', paymentStatus: 'Payment status', subscriptionType: 'Subscription type', provider: 'Provider / method',
    reference: 'External reference', note: 'Note', pending: 'Pending', paid: 'Paid',
    failed: 'Failed', refunded: 'Refunded', cancelled: 'Cancelled',
    trial: 'Free trial', free: 'Free', paidSubscription: 'Paid', manual: 'Manual adjustment', renewalSaved: 'Renewal recorded.',
  },
} as const;

export function AdminUsersPage(props: Props) {
  const {
    language, user, systemInfo, systemInfoError, onLanguageChange, onLogout,
    onNavigateWorkLog, onNavigateClients, onNavigateProjects, onNavigateProfile,
  } = props;
  const text = copy[language];
  const [rows, setRows] = useState<ManagedUser[]>([]);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageCount, setPageCount] = useState(1);
  const [total, setTotal] = useState(0);
  const [reload, setReload] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<ManagedUser | null>(null);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isAdmin, setIsAdmin] = useState(false);
  const [accountStatus, setAccountStatus] = useState<AccountStatus>('active');
  const [subscriptionStartedOn, setSubscriptionStartedOn] = useState(today);
  const [subscriptionEndsOn, setSubscriptionEndsOn] = useState('');
  const [renewalUser, setRenewalUser] = useState<ManagedUser | null>(null);
  const [renewalStart, setRenewalStart] = useState(today);
  const [renewalEnd, setRenewalEnd] = useState(today);
  const [paymentDate, setPaymentDate] = useState(today);
  const [amount, setAmount] = useState('0.00');
  const [subscriptionType, setSubscriptionType] = useState<SubscriptionType>('free');
  const [paymentStatus, setPaymentStatus] = useState<PaymentStatus>('paid');
  const [paymentProvider, setPaymentProvider] = useState('');
  const [externalReference, setExternalReference] = useState('');
  const [renewalNote, setRenewalNote] = useState('');

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      setBusy(true); setError('');
      const params = new URLSearchParams({ search, page: String(page), pageSize: '25' });
      void fetch(`/api/admin/users?${params}`, { credentials: 'include' })
        .then(async (response) => {
          if (!response.ok) throw new Error();
          return response.json() as Promise<{ users: ManagedUser[]; pageCount: number; total: number }>;
        })
        .then((result) => { setRows(result.users); setPageCount(result.pageCount); setTotal(result.total); })
        .catch(() => setError(text.error))
        .finally(() => setBusy(false));
    }, 250);
    return () => window.clearTimeout(timeout);
  }, [page, reload, search, text.error]);

  const openCreate = () => {
    setEditing(null); setFirstName(''); setLastName(''); setEmail(''); setPassword('');
    setIsAdmin(false); setAccountStatus('active'); setSubscriptionStartedOn(today());
    setSubscriptionEndsOn(''); setError(''); setModalOpen(true);
  };
  const openEdit = (row: ManagedUser) => {
    setEditing(row); setFirstName(row.firstName); setLastName(row.lastName);
    setEmail(row.email); setPassword(''); setIsAdmin(row.isAdmin);
    setAccountStatus(row.accountStatus); setSubscriptionStartedOn(row.subscriptionStartedOn);
    setSubscriptionEndsOn(row.subscriptionEndsOn ?? ''); setError(''); setModalOpen(true);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch(editing ? `/api/admin/users/${editing.id}` : '/api/admin/users', {
        method: editing ? 'PATCH' : 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(),
          ...(!editing ? { password } : {}), isAdmin, accountStatus,
          subscriptionStartedOn, subscriptionEndsOn: subscriptionEndsOn || null,
        }),
      });
      if (!response.ok) { setError(text.error); return; }
      setModalOpen(false); setNotice(text.saved); setReload((value) => value + 1);
    } catch {
      setError(text.error);
    } finally {
      setBusy(false);
    }
  };
  const openRenewal = (row: ManagedUser) => {
    const start = row.subscriptionEndsOn ? new Date(`${row.subscriptionEndsOn}T12:00:00`) : new Date();
    if (row.subscriptionEndsOn) start.setDate(start.getDate() + 1);
    const end = new Date(start);
    end.setFullYear(end.getFullYear() + 1); end.setDate(end.getDate() - 1);
    const iso = (date: Date) => `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
    setRenewalUser(row); setRenewalStart(iso(start)); setRenewalEnd(iso(end));
    setPaymentDate(today()); setAmount('0.00'); setSubscriptionType('free'); setPaymentStatus('paid');
    setPaymentProvider(''); setExternalReference(''); setRenewalNote(''); setError('');
  };
  const saveRenewal = async (event: FormEvent) => {
    event.preventDefault();
    if (!renewalUser) return;
    setBusy(true); setError('');
    try {
      const response = await fetch(`/api/admin/users/${renewalUser.id}/subscriptions`, {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          periodStartedOn: renewalStart, periodEndsOn: renewalEnd,
          paymentDate: paymentDate || null, amount,
          subscriptionType,
          paymentStatus,
          paymentProvider: paymentProvider.trim() || null,
          externalReference: externalReference.trim() || null, note: renewalNote.trim(),
        }),
      });
      if (!response.ok) { setError(text.error); return; }
      setRenewalUser(null); setNotice(text.renewalSaved); setReload((value) => value + 1);
    } catch { setError(text.error); } finally { setBusy(false); }
  };

  return <main className="app-page">
    <header className="app-header"><div className="app-brand"><span className="brand-mark">OT</span><span>OnTime</span></div>
      <nav className="app-nav"><button onClick={onNavigateWorkLog}>{text.journal}</button><button onClick={onNavigateClients}>{text.clients}</button><button onClick={onNavigateProjects}>{text.projects}</button><button onClick={onNavigateProfile}>{text.profile}</button><button className="active">{text.admin}</button></nav>
      <div className="header-actions"><div className="language-switch compact">{(['fr', 'en'] as const).map((value) => <button key={value} className={language === value ? 'active' : ''} onClick={() => onLanguageChange(value)}>{value.toUpperCase()}</button>)}</div><UserEnvironmentChip user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} logoutLabel={text.logout} onLogout={onLogout} /></div>
    </header>
    <section className="content-shell admin-shell">
      <div className="page-heading"><div><h1>{text.title}</h1><p>{text.subtitle}</p></div><button className="add-button" onClick={openCreate}><span>+</span>{text.add}</button></div>
      <div className="admin-toolbar"><label>{text.search}<input type="search" value={search} onChange={(event) => { setSearch(event.target.value); setPage(1); }} /></label><strong>{total}</strong></div>
      {notice ? <p className="success-message page-notice">{notice}</p> : null}{error && !modalOpen ? <p className="error-message page-error">{error}</p> : null}
      <div className="admin-table-wrap"><table className="admin-table"><thead><tr><th>{text.name}</th><th>{text.status}</th><th>{text.subscription}</th><th>{text.activity}</th><th>{text.lastLogin}</th><th>{text.actions}</th></tr></thead><tbody>{rows.map((row) => <tr key={row.id}><td><strong>{row.firstName} {row.lastName}</strong><small>{row.email}</small>{row.isAdmin ? <span className="admin-role">{text.administrator}</span> : null}</td><td><span className={`account-status status-${row.accountStatus}`}>{text[row.accountStatus]}</span></td><td><strong>{dateLabel(row.subscriptionStartedOn, language)}</strong><small>→ {row.subscriptionEndsOn ? dateLabel(row.subscriptionEndsOn, language) : text.unlimited}</small></td><td><span>{row.clientCount} {text.clientsCount}</span><small>{row.projectCount} {text.projectsCount} · {row.entryCount} {text.entriesCount}</small></td><td>{row.lastLoginAt ? new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(row.lastLoginAt)) : '—'}</td><td><div className="admin-row-actions"><button className="secondary-button small" onClick={() => openEdit(row)}>{text.edit}</button><button className="secondary-button small" onClick={() => openRenewal(row)}>{text.renewal}</button></div></td></tr>)}{!rows.length && !busy ? <tr><td colSpan={6}>—</td></tr> : null}</tbody></table></div>
      <div className="journal-pagination"><span>{text.page} {page} / {pageCount}</span><button disabled={page <= 1 || busy} onClick={() => setPage((value) => value - 1)}>{text.previous}</button><button disabled={page >= pageCount || busy} onClick={() => setPage((value) => value + 1)}>{text.next}</button></div>
      <ActivityPanel language={language} admin />
    </section>
    {modalOpen ? <div className="modal-backdrop"><section className="client-modal admin-user-modal"><div className="modal-heading"><h2>{editing ? text.edit : text.add}</h2><button className="close-button" onClick={() => setModalOpen(false)}>×</button></div><form onSubmit={save}><div className="form-two-columns"><label>{text.firstName}<input value={firstName} required maxLength={100} onChange={(event) => setFirstName(event.target.value)} /></label><label>{text.lastName}<input value={lastName} required maxLength={100} onChange={(event) => setLastName(event.target.value)} /></label></div><label>{text.email}<input type="email" value={email} required maxLength={320} onChange={(event) => setEmail(event.target.value)} /></label>{!editing ? <label>{text.password}<input type="password" value={password} required minLength={12} onChange={(event) => setPassword(event.target.value)} /></label> : null}<div className="form-two-columns"><label>{text.status}<select value={accountStatus} disabled={editing?.id === user.id} onChange={(event) => setAccountStatus(event.target.value as AccountStatus)}><option value="active">{text.active}</option><option value="suspended">{text.suspended}</option><option value="disabled">{text.disabled}</option></select></label><label className="admin-checkbox"><input type="checkbox" checked={isAdmin} disabled={editing?.id === user.id} onChange={(event) => setIsAdmin(event.target.checked)} />{text.administrator}</label></div><div className="form-two-columns"><label>{text.start}<input type="date" value={subscriptionStartedOn} required onChange={(event) => setSubscriptionStartedOn(event.target.value)} /></label><label>{text.end}<input type="date" value={subscriptionEndsOn} min={subscriptionStartedOn} onChange={(event) => setSubscriptionEndsOn(event.target.value)} /><small>{text.noEnd}</small></label></div>{error ? <p className="error-message">{error}</p> : null}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setModalOpen(false)}>{text.cancel}</button><button className="primary-button" disabled={busy}>{editing ? text.save : text.create}</button></div></form></section></div> : null}
    {renewalUser ? <div className="modal-backdrop"><section className="client-modal admin-user-modal"><div className="modal-heading"><div><h2>{text.renewalTitle}</h2><small>{renewalUser.firstName} {renewalUser.lastName}</small></div><button className="close-button" onClick={() => setRenewalUser(null)}>×</button></div><form onSubmit={saveRenewal}><div className="form-two-columns"><label>{text.start}<input type="date" required value={renewalStart} onChange={(event) => setRenewalStart(event.target.value)} /></label><label>{text.end}<input type="date" required min={renewalStart} value={renewalEnd} onChange={(event) => setRenewalEnd(event.target.value)} /></label></div><div className="form-two-columns"><label>{text.subscriptionType}<select value={subscriptionType} onChange={(event) => setSubscriptionType(event.target.value as SubscriptionType)}>{(['trial', 'free', 'paid', 'manual'] as SubscriptionType[]).map((value) => <option key={value} value={value}>{value === 'paid' ? text.paidSubscription : text[value]}</option>)}</select></label><label>{text.paymentStatus}<select value={paymentStatus} onChange={(event) => setPaymentStatus(event.target.value as PaymentStatus)}>{(['pending', 'paid', 'failed', 'refunded', 'cancelled'] as PaymentStatus[]).map((value) => <option key={value} value={value}>{text[value]}</option>)}</select></label></div><div className="form-two-columns"><label>{text.paymentDate}<input type="date" value={paymentDate} onChange={(event) => setPaymentDate(event.target.value)} /></label><label>{text.amount}<input inputMode="decimal" pattern="\d{1,10}(\.\d{1,2})?" required value={amount} onChange={(event) => setAmount(event.target.value)} /></label></div><div className="form-two-columns"><label>{text.provider}<input maxLength={50} value={paymentProvider} onChange={(event) => setPaymentProvider(event.target.value)} /></label><label>{text.reference}<input maxLength={200} value={externalReference} onChange={(event) => setExternalReference(event.target.value)} /></label></div><label>{text.note}<textarea maxLength={1000} value={renewalNote} onChange={(event) => setRenewalNote(event.target.value)} /></label>{error ? <p className="error-message">{error}</p> : null}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setRenewalUser(null)}>{text.cancel}</button><button className="primary-button" disabled={busy}>{text.save}</button></div></form></section></div> : null}
  </main>;
}
