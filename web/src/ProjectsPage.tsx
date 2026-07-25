import { type FormEvent, useEffect, useState } from 'react';
import { type SystemInfo, UserEnvironmentChip } from './UserEnvironmentChip';
import { completeWholeHours } from './durationInput';

type Language = 'fr' | 'en';
type User = { id: string; email: string; firstName: string; lastName: string; isAdmin: boolean };
type Client = { id: string; name: string; isActive: boolean };
type Project = {
  id: string; clientId: string; name: string; hourlyRate: string; isActive: boolean;
  hourBankEnabled: boolean; hourBankStartDate: string | null;
  hourBankInitialMinutes: number; maxDailyBillableMinutes: number;
  maxWeeklyBillableMinutes: number;
};
type RateMode = 'future_only' | 'update_unbilled';

type Props = {
  language: Language; user: User; systemInfo: SystemInfo | null; systemInfoError: boolean; onLanguageChange: (language: Language) => void;
  onLogout: () => Promise<void>; onNavigateWorkLog: () => void; onNavigateClients: () => void; onNavigateProfile: () => void; onNavigateAdmin: () => void;
};

const copy = {
  fr: {
    workLog: 'Journal', clients: 'Mes clients', projects: 'Projets', profile: 'Profil', logout: 'Se déconnecter', confidential: 'Confidentiel',
    title: 'Projets', subtitle: 'Organisez vos mandats et leurs taux horaires.', selectClient: 'Client',
    chooseClient: 'Choisir un client', noActiveClient: 'Aucun client actif.', manageClients: 'Gérer les clients',
    add: 'Ajouter un projet', name: 'Nom du projet', rate: 'Taux horaire', status: 'Statut', actions: 'Actions',
    active: 'Actif', inactive: 'Inactif', edit: 'Modifier', empty: 'Aucun projet pour ce client.',
    emptyHint: 'Ajoutez un premier projet afin de pouvoir créer des entrées de travail.',
    createTitle: 'Nouveau projet', editTitle: 'Modifier le projet', cancel: 'Annuler', save: 'Enregistrer', create: 'Créer le projet',
    duplicate: 'Un projet portant ce nom existe déjà pour ce client.', required: 'Le nom et le taux horaire sont obligatoires.',
    invalidRate: 'Utilisez un taux positif ou nul avec un point et deux décimales maximum.', error: 'Une erreur est survenue. Réessayez.',
    rateChanged: 'Comment appliquer le nouveau taux?', futureOnly: 'Nouvelles entrées seulement',
    futureHint: 'Les anciennes entrées conservent leur taux.', updateUnbilled: 'Mettre à jour les entrées non facturées',
    updateHint: 'Le taux et la valeur des entrées non facturées seront recalculés.', toggle: 'Changer le statut de',
    bank: 'Banque d’heures', bankEnabled: 'Activer la banque pour ce projet',
    bankStart: 'Date de début', initialBalance: 'Solde initial (HH:MM)',
    dailyMaximum: 'Maximum facturable quotidien (HH:MM)',
    weeklyMaximum: 'Maximum facturable hebdomadaire (HH:MM)',
    invalidBank: 'Vérifiez la date et les limites facturables du projet.',
    completeHours: 'Voulez-vous interpréter ces valeurs comme des heures complètes?',
    showRate: 'Afficher le taux horaire', hideRate: 'Masquer le taux horaire',
  },
  en: {
    workLog: 'Work log', clients: 'My clients', projects: 'Projects', profile: 'Profile', logout: 'Sign out', confidential: 'Confidential',
    title: 'Projects', subtitle: 'Organize your engagements and hourly rates.', selectClient: 'Client',
    chooseClient: 'Choose a client', noActiveClient: 'No active clients.', manageClients: 'Manage clients',
    add: 'Add project', name: 'Project name', rate: 'Hourly rate', status: 'Status', actions: 'Actions',
    active: 'Active', inactive: 'Inactive', edit: 'Edit', empty: 'No projects for this client.',
    emptyHint: 'Add a first project to start creating work entries.',
    createTitle: 'New project', editTitle: 'Edit project', cancel: 'Cancel', save: 'Save', create: 'Create project',
    duplicate: 'A project with this name already exists for this client.', required: 'Project name and hourly rate are required.',
    invalidRate: 'Use a non-negative rate with a period and no more than two decimals.', error: 'Something went wrong. Please try again.',
    rateChanged: 'How should the new rate apply?', futureOnly: 'New entries only',
    futureHint: 'Existing entries keep their rate.', updateUnbilled: 'Update unbilled entries',
    updateHint: 'Rates and values for unbilled entries will be recalculated.', toggle: 'Change status for',
    bank: 'Hour bank', bankEnabled: 'Enable the bank for this project',
    bankStart: 'Start date', initialBalance: 'Initial balance (HH:MM)',
    dailyMaximum: 'Daily billable maximum (HH:MM)',
    weeklyMaximum: 'Weekly billable maximum (HH:MM)',
    invalidBank: 'Check the project’s date and billable limits.',
    completeHours: 'Do you want to interpret these values as whole hours?',
    showRate: 'Show hourly rate', hideRate: 'Hide hourly rate',
  },
} as const;

const validRate = /^\d{1,10}(\.\d{1,2})?$/;
const formatDuration = (minutes: number) => `${minutes < 0 ? '-' : ''}${String(Math.floor(Math.abs(minutes) / 60)).padStart(2, '0')}:${String(Math.abs(minutes) % 60).padStart(2, '0')}`;
const parseDuration = (value: string) => {
  const match = /^(-)?(\d+):([0-5]\d)$/.exec(value.trim());
  return match ? (match[1] ? -1 : 1) * (Number(match[2]) * 60 + Number(match[3])) : null;
};
export const projectRateInputType = (confidential: boolean, revealed: boolean) =>
  confidential && !revealed ? 'password' : 'text';

const initialConfidentialMode = () => {
  const saved = document.cookie
    .split('; ')
    .find((value) => value.startsWith('ontime_confidential='))
    ?.split('=')[1];
  if (saved === undefined) {
    document.cookie = 'ontime_confidential=true; Max-Age=31536000; Path=/; SameSite=Lax';
    return true;
  }
  return saved !== 'false';
};

export function ProjectsPage({ language, user, systemInfo, systemInfoError, onLanguageChange, onLogout, onNavigateWorkLog, onNavigateClients, onNavigateProfile, onNavigateAdmin }: Props) {
  const text = copy[language];
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState('');
  const [projects, setProjects] = useState<Project[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [editing, setEditing] = useState<Project | null>(null);
  const [name, setName] = useState('');
  const [rate, setRate] = useState('0.00');
  const [rateMode, setRateMode] = useState<RateMode>('future_only');
  const [hourBankEnabled, setHourBankEnabled] = useState(false);
  const [hourBankStartDate, setHourBankStartDate] = useState('');
  const [hourBankInitial, setHourBankInitial] = useState('00:00');
  const [maxDaily, setMaxDaily] = useState('08:00');
  const [maxWeekly, setMaxWeekly] = useState('40:00');
  const [error, setError] = useState<string | null>(null);
  const [confidential, setConfidential] = useState(initialConfidentialMode);
  const [rateRevealed, setRateRevealed] = useState(false);

  useEffect(() => {
    // Seuls les clients actifs sont proposés : un client inactif ne permet
    // ni la consultation ni la modification de ses projets.
    const load = async () => {
      try {
        const response = await fetch('/api/clients', { credentials: 'include' });
        if (!response.ok) throw new Error();
        const active = ((await response.json()) as { clients: Client[] }).clients.filter((client) => client.isActive);
        setClients(active); setClientId(active[0]?.id ?? '');
      } catch { setError(text.error); }
    };
    void load();
  }, []);

  useEffect(() => {
    // Changer de client recharge son espace de projets et invalide l'ancienne liste.
    if (!clientId) { setProjects([]); setIsLoading(false); return; }
    const load = async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/projects?clientId=${clientId}`, { credentials: 'include' });
        if (!response.ok) throw new Error();
        setProjects(((await response.json()) as { projects: Project[] }).projects);
      } catch { setError(text.error); }
      finally { setIsLoading(false); }
    };
    void load();
  }, [clientId]);

  const openCreate = () => { setEditing(null); setName(''); setRate('0.00'); setRateMode('future_only'); setRateRevealed(false); setHourBankEnabled(false); setHourBankStartDate(new Date().toISOString().slice(0, 10)); setHourBankInitial('00:00'); setMaxDaily('08:00'); setMaxWeekly('40:00'); setError(null); setIsFormOpen(true); };
  const openEdit = (project: Project) => { setEditing(project); setName(project.name); setRate(Number(project.hourlyRate).toFixed(2)); setRateMode('future_only'); setRateRevealed(false); setHourBankEnabled(project.hourBankEnabled); setHourBankStartDate(project.hourBankStartDate ?? new Date().toISOString().slice(0, 10)); setHourBankInitial(formatDuration(project.hourBankInitialMinutes)); setMaxDaily(formatDuration(project.maxDailyBillableMinutes)); setMaxWeekly(formatDuration(project.maxWeeklyBillableMinutes)); setError(null); setIsFormOpen(true); };
  const closeForm = () => { setIsFormOpen(false); setEditing(null); setRateRevealed(false); setError(null); };
  const rateHasChanged = Boolean(editing && validRate.test(rate) && Number(rate).toFixed(2) !== Number(editing.hourlyRate).toFixed(2));

  const save = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!name.trim() || !rate.trim()) { setError(text.required); return; }
    if (!validRate.test(rate)) { setError(text.invalidRate); return; }
    const completedInitial = completeWholeHours(hourBankInitial, true);
    const completedDaily = completeWholeHours(maxDaily);
    const completedWeekly = completeWholeHours(maxWeekly);
    const suggestions = [completedInitial, completedDaily, completedWeekly].filter(Boolean);
    if (suggestions.length && !confirm(`${text.completeHours}\n\n${suggestions.join('\n')}`)) return;
    const initialMinutes = parseDuration(completedInitial ?? hourBankInitial);
    const dailyMinutes = parseDuration(completedDaily ?? maxDaily);
    const weeklyMinutes = parseDuration(completedWeekly ?? maxWeekly);
    if ((hourBankEnabled && !hourBankStartDate) || initialMinutes === null || dailyMinutes === null || weeklyMinutes === null || dailyMinutes <= 0 || weeklyMinutes <= 0) {
      setError(text.invalidBank); return;
    }
    setIsSaving(true); setError(null);
    try {
      const response = await fetch(editing ? `/api/projects/${editing.id}` : '/api/projects', {
        method: editing ? 'PATCH' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        // Le mode d'application est envoyé seulement si le taux change réellement.
        body: JSON.stringify(editing
          ? { name: name.trim(), hourlyRate: Number(rate).toFixed(2), ...(rateHasChanged ? { rateUpdateMode: rateMode } : {}), hourBankEnabled, hourBankStartDate: hourBankEnabled ? hourBankStartDate : null, hourBankInitialMinutes: initialMinutes, maxDailyBillableMinutes: dailyMinutes, maxWeeklyBillableMinutes: weeklyMinutes }
          : { clientId, name: name.trim(), hourlyRate: Number(rate).toFixed(2), hourBankEnabled, hourBankStartDate: hourBankEnabled ? hourBankStartDate : null, hourBankInitialMinutes: initialMinutes, maxDailyBillableMinutes: dailyMinutes, maxWeeklyBillableMinutes: weeklyMinutes }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error === 'PROJECT_NAME_EXISTS' ? text.duplicate : text.error); return;
      }
      closeForm();
      const list = await fetch(`/api/projects?clientId=${clientId}`, { credentials: 'include' });
      if (list.ok) setProjects(((await list.json()) as { projects: Project[] }).projects);
    } catch { setError(text.error); }
    finally { setIsSaving(false); }
  };

  const toggle = async (project: Project) => {
    // Un projet inactif disparaît du journal, mais reste visible et réactivable ici.
    try {
      const response = await fetch(`/api/projects/${project.id}`, {
        method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !project.isActive }),
      });
      if (!response.ok) throw new Error();
      const updated = ((await response.json()) as { project: Project }).project;
      setProjects((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch { setError(text.error); }
  };

  return <main className="app-page">
    <header className="app-header">
      <div className="app-brand"><span className="brand-mark">OT</span><span>OnTime</span></div>
      <nav className="app-nav"><button type="button" onClick={onNavigateWorkLog}>{text.workLog}</button><button type="button" onClick={onNavigateClients}>{text.clients}</button><button type="button" className="active">{text.projects}</button><button type="button" onClick={onNavigateProfile}>{text.profile}</button>{user.isAdmin ? <button type="button" onClick={onNavigateAdmin}>{language === 'fr' ? 'Administration' : 'Admin'}</button> : null}</nav>
      <div className="header-actions"><label className="confidential-switch"><input type="checkbox" checked={confidential} onChange={(event) => { setConfidential(event.target.checked); setRateRevealed(false); document.cookie = `ontime_confidential=${event.target.checked}; Max-Age=31536000; Path=/; SameSite=Lax`; }} />{text.confidential}</label><div className="language-switch compact">{(['fr', 'en'] as const).map((option) => <button key={option} type="button" className={language === option ? 'active' : ''} onClick={() => onLanguageChange(option)}>{option.toUpperCase()}</button>)}</div><UserEnvironmentChip user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} logoutLabel={text.logout} onLogout={onLogout} /></div>
    </header>
    <section className="content-shell">
      <div className="page-heading"><div><p className="eyebrow">ONTIME</p><h1>{text.title}</h1><p>{text.subtitle}</p></div>{clientId ? <button className="add-button" type="button" onClick={openCreate}><span>+</span>{text.add}</button> : null}</div>
      <div className="project-toolbar"><label htmlFor="project-client">{text.selectClient}</label><select id="project-client" value={clientId} onChange={(event) => setClientId(event.target.value)}><option value="">{text.chooseClient}</option>{clients.map((client) => <option value={client.id} key={client.id}>{client.name}</option>)}</select></div>
      {error && !isFormOpen ? <p className="error-message page-error">{error}</p> : null}
      <div className="client-card">
        {!clientId ? <div className="empty-state"><span className="empty-icon">P</span><h2>{text.noActiveClient}</h2><button className="primary-button small" type="button" onClick={onNavigateClients}>{text.manageClients}</button></div>
          : isLoading ? <div className="empty-state"><span className="loading-ring" /></div>
            : projects.length === 0 ? <div className="empty-state"><span className="empty-icon">P</span><h2>{text.empty}</h2><p>{text.emptyHint}</p><button className="primary-button small" type="button" onClick={openCreate}>{text.add}</button></div>
              : <div className={`client-table project-table ${confidential ? 'confidential-projects' : ''}`}><div className="client-row client-table-head"><span>{text.name}</span>{!confidential ? <span>{text.rate}</span> : null}<span>{text.status}</span><span className="action-column">{text.actions}</span></div>{projects.map((project) => <div className={`client-row ${project.isActive ? '' : 'inactive'}`} key={project.id}><div className="client-name"><span className="client-avatar">P</span><span><strong>{project.name}</strong>{project.hourBankEnabled ? <small className="bank-enabled-label">{text.bank}</small> : null}</span></div>{!confidential ? <strong className="rate-value">${Number(project.hourlyRate).toFixed(2)}</strong> : null}<button className={`status-toggle ${project.isActive ? 'active' : ''}`} type="button" onClick={() => void toggle(project)} aria-label={`${text.toggle} ${project.name}`}><span className="toggle-track"><span /></span>{project.isActive ? text.active : text.inactive}</button><div className="action-column"><button className="edit-button" type="button" onClick={() => openEdit(project)}>{text.edit}</button></div></div>)}</div>}
      </div>
    </section>
    {isFormOpen ? <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}><section className="client-modal project-modal" role="dialog" aria-modal="true"><div className="modal-heading"><div><p className="eyebrow">PROJET</p><h2>{editing ? text.editTitle : text.createTitle}</h2></div><button type="button" className="close-button" onClick={closeForm}>×</button></div><form onSubmit={save}><label htmlFor="project-name">{text.name}</label><input id="project-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} autoFocus /><label htmlFor="project-rate">{text.rate}</label><div className={`money-input ${confidential ? 'protected-rate-input' : ''}`}><span>$</span><input id="project-rate" type={projectRateInputType(confidential, rateRevealed)} inputMode="decimal" value={rate} onChange={(event) => setRate(event.target.value)} />{confidential ? <button type="button" className="rate-visibility-button" title={rateRevealed ? text.hideRate : text.showRate} aria-label={rateRevealed ? text.hideRate : text.showRate} aria-pressed={rateRevealed} onClick={() => setRateRevealed((value) => !value)}>{rateRevealed ? '◉' : '◌'}</button> : null}</div>{rateHasChanged ? <fieldset className="rate-choice"><legend>{text.rateChanged}</legend><label><input type="radio" checked={rateMode === 'future_only'} onChange={() => setRateMode('future_only')} /><span><strong>{text.futureOnly}</strong><small>{text.futureHint}</small></span></label><label><input type="radio" checked={rateMode === 'update_unbilled'} onChange={() => setRateMode('update_unbilled')} /><span><strong>{text.updateUnbilled}</strong><small>{text.updateHint}</small></span></label></fieldset> : null}<fieldset className="hour-bank-settings"><legend>{text.bank}</legend><label className="bank-enable"><input type="checkbox" checked={hourBankEnabled} onChange={(event) => setHourBankEnabled(event.target.checked)} />{text.bankEnabled}</label>{hourBankEnabled ? <div className="bank-setting-grid"><label>{text.bankStart}<input type="date" value={hourBankStartDate} onChange={(event) => setHourBankStartDate(event.target.value)} /></label><label>{text.initialBalance}<input value={hourBankInitial} onChange={(event) => setHourBankInitial(event.target.value)} placeholder="00:00" /></label><label>{text.dailyMaximum}<input value={maxDaily} onChange={(event) => setMaxDaily(event.target.value)} placeholder="08:00" /></label><label>{text.weeklyMaximum}<input value={maxWeekly} onChange={(event) => setMaxWeekly(event.target.value)} placeholder="40:00" /></label></div> : null}</fieldset>{error ? <p className="error-message">{error}</p> : null}<div className="modal-actions"><button className="secondary-button" type="button" onClick={closeForm}>{text.cancel}</button><button className="primary-button" type="submit" disabled={isSaving || !name.trim() || !rate.trim()}>{editing ? text.save : text.create}</button></div></form></section></div> : null}
  </main>;
}
