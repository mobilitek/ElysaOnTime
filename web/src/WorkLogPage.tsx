import { type FormEvent, useEffect, useMemo, useState } from 'react';
import { DescriptionOutlineEditor } from './DescriptionOutlineEditor';
import { QuickDurationInput } from './QuickDurationInput';
import { type SystemInfo, UserEnvironmentChip } from './UserEnvironmentChip';
import { normalizeDurationInput } from './durationInput';
import {
  descriptionDocumentForSave,
  descriptionDocumentFreeText,
  descriptionDocumentText,
  newDescriptionLine,
  parseLegacyDescription,
  type DescriptionLine,
} from './descriptionDocument';

type Language = 'fr' | 'en';
type User = {
  firstName: string; lastName: string; isAdmin: boolean;
  subscriptionEndsOn: string | null;
  accessLevel: 'full' | 'subscription_expired';
};
type Client = { id: string; name: string; isActive: boolean };
type Project = {
  id: string; name: string; hourlyRate: string; isActive: boolean;
  hourBankEnabled: boolean; hourBankStartDate: string | null;
  hourBankInitialMinutes: number; maxDailyBillableMinutes: number;
  maxWeeklyBillableMinutes: number;
};
type Entry = { id: string; clientId: string; projectId: string; clientName: string; projectName: string; workDate: string; durationMinutes: number; clientMinutes: number; description: string; descriptionDocument: DescriptionLine[] | null; hourlyRate: string; amount: string; isBilled: boolean; isDeleted: boolean };
type Preset = 'day' | 'week' | 'month' | 'year' | 'custom';
type DescriptionMode = 'guided' | 'free';
type Sort = 'workDate' | 'client' | 'project' | 'duration' | 'hourlyRate' | 'amount' | 'isBilled';
type Props = { language: Language; user: User; systemInfo: SystemInfo | null; systemInfoError: boolean; onLanguageChange: (value: Language) => void; onLogout: () => Promise<void>; onNavigateClients: () => void; onNavigateProjects: () => void; onNavigateProfile: () => void; onNavigateAdmin: () => void };
type HourBankWeek = {
  weekStart: string; weekEnd: string; isClosed: boolean; isConsistent: boolean; note: string;
  openingBalanceMinutes: number; closingBalanceMinutes: number;
  project: { maxDailyBillableMinutes: number; maxWeeklyBillableMinutes: number };
  days: Array<{ workDate: string; actualMinutes: number; billedMinutes: number; movementMinutes: number }>;
};
export const hourBankBalanceThroughDate = (
  week: {
    openingBalanceMinutes: number;
    days: Array<Pick<HourBankWeek['days'][number], 'workDate' | 'movementMinutes'>>;
  },
  throughDate: string,
) => week.openingBalanceMinutes + week.days
  .filter((day) => day.workDate <= throughDate)
  .reduce((sum, day) => sum + day.movementMinutes, 0);

const pad = (value: number) => String(value).padStart(2, '0');
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
export const isTodayWorkDate = (workDate: string, now = new Date()) =>
  workDate === iso(now);
const period = (preset: Preset, anchor: Date) => {
  // Les semaines OnTime vont du samedi au vendredi, comme dans l'application historique.
  const from = new Date(anchor); const to = new Date(anchor);
  if (preset === 'week') { const offset = (anchor.getDay() + 1) % 7; from.setDate(anchor.getDate() - offset); to.setTime(from.getTime()); to.setDate(from.getDate() + 6); }
  if (preset === 'month') { from.setDate(1); to.setMonth(anchor.getMonth() + 1, 0); }
  if (preset === 'year') { from.setMonth(0, 1); to.setMonth(11, 31); }
  return { from: iso(from), to: iso(to) };
};
const formatDate = (value: string) => { const [y, m, d] = value.split('-'); return `${d}/${m}/${y}`; };
export const formatWeekday = (value: string, language: Language) => {
  const weekday = new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA', { weekday: 'long' })
    .format(new Date(`${value}T12:00:00`));
  return `${weekday.charAt(0).toLocaleUpperCase(language === 'fr' ? 'fr-CA' : 'en-CA')}${weekday.slice(1)}`;
};
const formatDuration = (minutes: number) => `${minutes < 0 ? '-' : ''}${pad(Math.floor(Math.abs(minutes) / 60))}:${pad(Math.abs(minutes) % 60)}`;
const parseDuration = (value: string) => {
  const match = /^(\d+):([0-5]\d)$/.exec(value.trim());
  return match ? Number(match[1]) * 60 + Number(match[2]) : null;
};
export const possibleWorkingMinutes = (from: string, to: string) => {
  // Capacité théorique : huit heures du lundi au vendredi; les jours fériés
  // restent volontairement inclus dans cette première version.
  const current = new Date(`${from}T00:00:00Z`);
  const last = new Date(`${to}T00:00:00Z`);
  let weekdays = 0;
  while (current <= last) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) weekdays += 1;
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return weekdays * 8 * 60;
};
export const firstDescriptionLine = (description: string) => description.split(/\r?\n/, 1)[0] ?? '';
const cookieValue = (name: string) => document.cookie.split('; ').find((value) => value.startsWith(`${name}=`))?.split('=')[1] ?? '';
const saveCookie = (name: string, value: string) => { document.cookie = `${name}=${value}; Max-Age=31536000; Path=/; SameSite=Lax`; };
const pageSizeCookie = () => Number(document.cookie.match(/(?:^|; )ontime_page_size=(10|25|50|100)/)?.[1] ?? 50);
const preferredDescriptionMode = (): DescriptionMode =>
  localStorage.getItem('ontime_description_mode') === 'free' ? 'free' : 'guided';
const confidentialCookie = () => {
  const saved = cookieValue('ontime_confidential');
  if (saved === 'true') return true;
  if (saved === 'false') return false;
  // Une première visite protège les renseignements financiers par défaut.
  saveCookie('ontime_confidential', 'true');
  return true;
};
const presetCookie = (): Preset => {
  const value = cookieValue('ontime_period_preset');
  return ['day', 'week', 'month', 'year', 'custom'].includes(value) ? value as Preset : 'month';
};
const initialPeriod = (anchor: Date) => {
  // Restaurer le dernier préréglage et, si nécessaire, ses dates personnalisées.
  const preset = presetCookie();
  if (preset !== 'custom') return { preset, ...period(preset, anchor) };
  const from = cookieValue('ontime_period_from');
  const to = cookieValue('ontime_period_to');
  if (/^\d{4}-\d{2}-\d{2}$/.test(from) && /^\d{4}-\d{2}-\d{2}$/.test(to) && from <= to) {
    return { preset, from, to };
  }
  return { preset: 'month' as const, ...period('month', anchor) };
};
export const shiftPeriod = (preset: Exclude<Preset, 'custom'>, from: string, direction: -1 | 1) => {
  // Déplacer un mois ou une année civile plutôt qu'un nombre fixe de jours.
  const anchor = new Date(`${from}T12:00:00`);
  if (preset === 'day') anchor.setDate(anchor.getDate() + direction);
  if (preset === 'week') anchor.setDate(anchor.getDate() + direction * 7);
  if (preset === 'month') anchor.setMonth(anchor.getMonth() + direction, 1);
  if (preset === 'year') anchor.setFullYear(anchor.getFullYear() + direction, 0, 1);
  return period(preset, anchor);
};

function DescriptionPreview({ description }: { description: string }) {
  const [tooltip, setTooltip] = useState<{ left: number; top: number } | null>(null);
  const [pinned, setPinned] = useState(false);
  const show = (element: HTMLElement) => {
    // Un positionnement fixe garde l'infobulle visible dans le tableau défilant.
    const bounds = element.getBoundingClientRect();
    setTooltip({
      left: Math.max(12, Math.min(bounds.left, window.innerWidth - 552)),
      top: Math.min(bounds.bottom + 8, window.innerHeight - 180),
    });
  };

  return <>
    <button
      type="button"
      className="description-preview"
      aria-expanded={tooltip !== null}
      onMouseEnter={(event) => show(event.currentTarget)}
      onMouseLeave={() => { if (!pinned) setTooltip(null); }}
      onFocus={(event) => show(event.currentTarget)}
      onBlur={() => { setPinned(false); setTooltip(null); }}
      onClick={(event) => {
        const nextPinned = !pinned;
        setPinned(nextPinned);
        if (nextPinned) show(event.currentTarget); else setTooltip(null);
      }}
    >{firstDescriptionLine(description)}</button>
    {tooltip ? <span className="description-tooltip" role="tooltip" style={tooltip}>{description}</span> : null}
  </>;
}

function EntryModeIndicator({ guided, language }: { guided: boolean; language: Language }) {
  const title = guided
    ? (language === 'fr' ? 'Organisation guidée' : 'Guided outline')
    : (language === 'fr' ? 'Texte libre' : 'Free typing');
  return <span className={`entry-mode-indicator ${guided ? 'guided' : 'free'}`} title={title} aria-label={title}>
    <span aria-hidden="true">{guided ? '≡' : 'T'}</span>
  </span>;
}

function DescriptionModeSwitch(props: {
  language: Language;
  mode: DescriptionMode;
  onChange: (mode: DescriptionMode) => void;
}) {
  const { language, mode, onChange } = props;
  const fr = language === 'fr';
  return <div className="description-mode-switch" role="group" aria-label={fr ? 'Mode de saisie' : 'Entry mode'}>
    <button type="button" className={mode === 'guided' ? 'active' : ''} aria-pressed={mode === 'guided'} onClick={() => onChange('guided')}>
      {fr ? 'Organisation guidée' : 'Guided outline'}
    </button>
    <button type="button" className={mode === 'free' ? 'active' : ''} aria-pressed={mode === 'free'} onClick={() => onChange('free')}>
      {fr ? 'Texte libre' : 'Free typing'}
    </button>
  </div>;
}

function EntryDescriptionEditor(props: {
  language: Language;
  mode: DescriptionMode;
  lines: DescriptionLine[];
  freeText: string;
  legacySource: boolean;
  onModeChange: (mode: DescriptionMode) => void;
  onLinesChange: (lines: DescriptionLine[]) => void;
  onFreeTextChange: (text: string) => void;
}) {
  const { language, mode, lines, freeText, legacySource, onModeChange, onLinesChange, onFreeTextChange } = props;
  const fr = language === 'fr';
  const modeSwitch = <DescriptionModeSwitch language={language} mode={mode} onChange={onModeChange} />;
  return <div className="entry-description-editor">
    {mode === 'guided'
      ? <DescriptionOutlineEditor language={language} lines={lines} legacySource={legacySource} onChange={onLinesChange} headingAccessory={modeSwitch} />
      : <div className="free-description-editor">
        <div className="free-description-heading"><div><strong>{fr ? 'Écriture libre' : 'Free typing'}</strong><small>{fr ? 'Écrivez ou collez votre journée sans gestion de lignes ni d’indentation.' : 'Write or paste your day without managed lines or indentation.'}</small></div>{modeSwitch}</div>
        <textarea
          value={freeText}
          onChange={(event) => onFreeTextChange(event.target.value)}
          placeholder={fr ? 'Décrivez votre journée…' : 'Describe your day…'}
          aria-label={fr ? 'Description en texte libre' : 'Free-form description'}
        />
      </div>}
  </div>;
}

const copy = {
  fr: { journal: 'Journal', clients: 'Mes clients', projects: 'Projets', logout: 'Se déconnecter', title: 'Journal de travail', period: 'Période', day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année', custom: 'Personnalisé', from: 'Du', to: 'Au', allClients: 'Tous les clients', allProjects: 'Tous les projets', chooseClient: 'Choisir un client', chooseProject: 'Choisir un projet', client: 'Client', project: 'Projet', add: 'Nouvelle entrée', export: 'Rapport Excel', backup: 'Sauvegarder', restore: 'Restaurer', date: 'Date', description: 'Description', hours: 'Heures', rate: 'Taux', value: 'Valeur', billed: 'Facturé', items: 'Entrées', confidential: 'Confidentiel', deleted: 'Afficher les supprimées', edit: 'Modifier', duplicate: 'Copier', next: 'Copier au prochain jour ouvrable', toggleBilled: 'Inverser facturation', deleteEntry: 'Supprimer cette entrée', restoreEntry: 'Restaurer cette entrée', empty: 'Aucune entrée pour ces filtres.', selectProject: 'Vous pouvez sélectionner un client et un projet pour filtrer la liste.', newEntry: 'Nouvelle entrée', editEntry: 'Modifier l’entrée', back: 'Retour', save: 'Valider', duration: 'Heures travaillées (HH:MM)', clientDuration: 'Heures facturables (HH:MM)', completeHours: 'Voulez-vous interpréter ces valeurs comme des heures complètes?', required: 'Le client, le projet et la description sont obligatoires. Utilisez le format HH:MM et des blocs de 15 minutes.', warning: 'Cette entrée est facturée. Voulez-vous vraiment continuer?', assignmentLocked: 'Retirez d’abord le statut facturé pour changer le client ou le projet.', reassignmentConfirm: 'Ce changement de projet modifiera les heures facturables de cette entrée. Voulez-vous continuer?', confirmDelete: 'Voulez-vous vraiment supprimer cette entrée?', error: 'Une erreur est survenue.', page: 'Page', previous: 'Précédente', following: 'Suivante', hourBank: 'Banque d’heures', actual: 'Réel', clientTime: 'Facturable', bankMovement: 'Banque', openingBalance: 'Solde initial', closingBalance: 'Solde final', closeWeek: 'Confirmer la semaine', updateWeek: 'Mettre à jour la semaine', reviewWeek: 'Réviser la semaine', bankNote: 'Note (facultative)', bankSaved: 'Fermeture hebdomadaire enregistrée.', invalidBank: 'Les heures facturables doivent respecter les limites du projet et les blocs de 15 minutes.', bankInconsistent: 'Cette semaine a été modifiée après sa fermeture. Enregistrez-la de nouveau pour synchroniser son historique.' },
  en: { journal: 'Work log', clients: 'My clients', projects: 'Projects', logout: 'Sign out', title: 'Work log', period: 'Period', day: 'Day', week: 'Week', month: 'Month', year: 'Year', custom: 'Custom', from: 'From', to: 'To', allClients: 'All clients', allProjects: 'All projects', chooseClient: 'Choose a client', chooseProject: 'Choose a project', client: 'Client', project: 'Project', add: 'New entry', export: 'Excel report', backup: 'Backup', restore: 'Restore', date: 'Date', description: 'Description', hours: 'Hours', rate: 'Rate', value: 'Value', billed: 'Billed', items: 'Entries', confidential: 'Confidential', deleted: 'Show deleted', edit: 'Edit', duplicate: 'Copy', next: 'Copy to next business day', toggleBilled: 'Toggle billed', deleteEntry: 'Delete this entry', restoreEntry: 'Restore this entry', empty: 'No entries match these filters.', selectProject: 'You can select a client and project to filter the list.', newEntry: 'New entry', editEntry: 'Edit entry', back: 'Back', save: 'Save', duration: 'Worked hours (HH:MM)', clientDuration: 'Billable hours (HH:MM)', completeHours: 'Do you want to interpret these values as whole hours?', required: 'Client, project and description are required. Use HH:MM format and 15-minute increments.', warning: 'This entry is billed. Do you really want to continue?', assignmentLocked: 'Remove the billed status first to change the client or project.', reassignmentConfirm: 'This project change will modify the billable hours for this entry. Do you want to continue?', confirmDelete: 'Do you really want to delete this entry?', error: 'Something went wrong.', page: 'Page', previous: 'Previous', following: 'Next', hourBank: 'Hour bank', actual: 'Actual', clientTime: 'Billable', bankMovement: 'Bank', openingBalance: 'Opening balance', closingBalance: 'Closing balance', closeWeek: 'Confirm week', updateWeek: 'Update week', reviewWeek: 'Review week', bankNote: 'Note (optional)', bankSaved: 'Weekly closure saved.', invalidBank: 'Billable hours must respect the project limits and 15-minute increments.', bankInconsistent: 'This week changed after it was closed. Save it again to synchronize its history.' },
} as const;

const exportBankReminder = {
  fr: 'Au moins un projet concerné utilise une banque d’heures.\n\nAvant de remettre le fichier au client, assurez-vous d’avoir confirmé ou révisé chaque semaine exportée afin que les lignes « Code H » soient à jour.\n\nContinuer l’export?',
  en: 'At least one affected project uses an hour bank.\n\nBefore sending the file to the client, make sure every exported week has been confirmed or reviewed so the “Code H” lines are current.\n\nContinue the export?',
} as const;

export const hasEnabledHourBank = (
  items: Array<Pick<Project, 'hourBankEnabled' | 'isActive'>>,
) => items.some((item) => item.isActive && item.hourBankEnabled);

export function WorkLogPage(props: Props) {
  const { language, user, systemInfo, systemInfoError, onLanguageChange, onLogout, onNavigateClients, onNavigateProjects, onNavigateProfile, onNavigateAdmin } = props;
  const text = copy[language]; const today = useMemo(() => new Date(), []); const initial = useMemo(() => initialPeriod(today), [today]);
  const todayLabel = language === 'fr' ? 'Aujourd’hui' : 'Today';
  const [preset, setPreset] = useState<Preset>(initial.preset); const [from, setFrom] = useState(initial.from); const [to, setTo] = useState(initial.to);
  const [clients, setClients] = useState<Client[]>([]); const [clientId, setClientId] = useState(() => cookieValue('ontime_client_filter')); const [projects, setProjects] = useState<Project[]>([]); const [projectId, setProjectId] = useState(() => cookieValue('ontime_project_filter'));
  const [entries, setEntries] = useState<Entry[]>([]); const [selected, setSelected] = useState<string[]>([]); const [summary, setSummary] = useState({ itemCount: 0, totalMinutes: 0, totalClientMinutes: 0, totalActualAmount: '0.00', totalAmount: '0.00' });
  const [includeDeleted, setIncludeDeleted] = useState(false); const [confidential, setConfidential] = useState(confidentialCookie); const [pageSize, setPageSize] = useState(pageSizeCookie); const [page, setPage] = useState(1); const [pageCount, setPageCount] = useState(1); const [sortBy, setSortBy] = useState<Sort>('workDate'); const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc'); const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Entry | null>(null); const [formOpen, setFormOpen] = useState(false); const [entryModalExpanded, setEntryModalExpanded] = useState(() => localStorage.getItem('ontime_entry_modal_expanded') === 'true'); const [entryClientId, setEntryClientId] = useState(''); const [entryProjectId, setEntryProjectId] = useState(''); const [entryProjects, setEntryProjects] = useState<Project[]>([]); const [workDate, setWorkDate] = useState(iso(today)); const [time, setTime] = useState('08:00'); const [clientTime, setClientTime] = useState('08:00'); const [descriptionLines, setDescriptionLines] = useState<DescriptionLine[]>(() => [newDescriptionLine()]); const [legacyDescription, setLegacyDescription] = useState(false); const [error, setError] = useState(''); const [filterError, setFilterError] = useState('');
  const [descriptionMode, setDescriptionMode] = useState<DescriptionMode>(preferredDescriptionMode);
  const [freeDescription, setFreeDescription] = useState('');
  const [notice, setNotice] = useState('');
  const [loadingEntries, setLoadingEntries] = useState(false); const [exporting, setExporting] = useState(false); const [actionBusy, setActionBusy] = useState(false);
  const [bankWeek, setBankWeek] = useState<HourBankWeek | null>(null);
  const [bankNote, setBankNote] = useState('');
  const [bankModalOpen, setBankModalOpen] = useState(false);
  const [bankBusy, setBankBusy] = useState(false);
  const [bankError, setBankError] = useState('');
  const possibleMinutes = useMemo(() => from <= to ? possibleWorkingMinutes(from, to) : 0, [from, to]);
  const weightedRate = Number(summary.totalMinutes) > 0
    ? Number(summary.totalAmount) / (Number(summary.totalMinutes) / 60)
    : projects.length
      ? projects.reduce((sum, project) => sum + Number(project.hourlyRate), 0) / projects.length
      : 0;
  const possibleAmount = clientId ? (possibleMinutes / 60) * weightedRate : null;
  const selectedProject = projects.find((item) => item.id === projectId);
  const entryProject = entryProjects.find((item) => item.id === entryProjectId);
  const entryUsesBank = Boolean(
    entryProject?.hourBankEnabled
    && entryProject.hourBankStartDate
    && workDate >= entryProject.hourBankStartDate,
  );
  const bankBalance = bankWeek ? hourBankBalanceThroughDate(bankWeek, to) : null;
  const bankPeriodMovement = bankWeek && bankBalance !== null
    ? bankBalance - bankWeek.openingBalanceMinutes
    : 0;
  const subscriptionDaysRemaining = useMemo(() => {
    if (user.isAdmin || !user.subscriptionEndsOn || user.accessLevel !== 'full') return null;
    const expiry = new Date(`${user.subscriptionEndsOn}T12:00:00`);
    const current = new Date();
    current.setHours(12, 0, 0, 0);
    const difference = Math.round((expiry.getTime() - current.getTime()) / 86_400_000);
    return difference >= 0 && difference <= 3 ? difference : null;
  }, [user.accessLevel, user.isAdmin, user.subscriptionEndsOn]);

  // Charger les clients actifs et nettoyer un filtre mémorisé devenu invalide.
  // Une seconde tentative absorbe les rares courses de démarrage suivant la connexion.
  useEffect(() => {
    let cancelled = false;
    const loadClients = async (attempt = 1): Promise<void> => {
      try {
        const response = await fetch('/api/clients', { credentials: 'include' });
        if (!response.ok) throw new Error(`CLIENTS_HTTP_${response.status}`);
        const data = await response.json() as { clients?: Client[] };
        if (!Array.isArray(data.clients)) throw new Error('INVALID_CLIENTS_RESPONSE');
        if (cancelled) return;
        const active = data.clients.filter((item) => item.isActive);
        setClients(active);
        setFilterError('');
        if (clientId && !active.some((item) => item.id === clientId)) {
          setClientId(''); setProjectId('');
          saveCookie('ontime_client_filter', ''); saveCookie('ontime_project_filter', '');
        }
      } catch {
        if (cancelled) return;
        if (attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          if (!cancelled) await loadClients(2);
          return;
        }
        setFilterError(language === 'fr' ? 'Impossible de charger la liste des clients.' : 'Unable to load the client list.');
      }
    };
    void loadClients();
    return () => { cancelled = true; };
  }, []);
  // Les projets sont chargés uniquement pour le client actif sélectionné.
  useEffect(() => {
    if (!clientId) { setProjects([]); setProjectId(''); setFilterError(''); return; }
    let cancelled = false;
    const loadProjects = async (attempt = 1): Promise<void> => {
      try {
        const response = await fetch(`/api/projects?clientId=${clientId}`, { credentials: 'include' });
        if (!response.ok) throw new Error(`PROJECTS_HTTP_${response.status}`);
        const data = await response.json() as { projects?: Project[] };
        if (!Array.isArray(data.projects)) throw new Error('INVALID_PROJECTS_RESPONSE');
        if (cancelled) return;
        const active = data.projects.filter((item) => item.isActive);
        setProjects(active);
        setFilterError('');
        const saved = cookieValue('ontime_project_filter');
        const next = active.some((item) => item.id === saved) ? saved : '';
        setProjectId(next);
        if (!next) saveCookie('ontime_project_filter', '');
      } catch {
        if (cancelled) return;
        if (attempt === 1) {
          await new Promise((resolve) => setTimeout(resolve, 400));
          if (!cancelled) await loadProjects(2);
          return;
        }
        setProjects([]);
        setProjectId('');
        setFilterError(language === 'fr' ? 'Impossible de charger la liste des projets.' : 'Unable to load the project list.');
      }
    };
    void loadProjects();
    return () => { cancelled = true; };
  }, [clientId]);
  // Les choix de la fiche sont indépendants des filtres de la liste.
  useEffect(() => {
    if (!formOpen || !entryClientId) { setEntryProjects([]); return; }
    void fetch(`/api/projects?clientId=${entryClientId}`, { credentials: 'include' })
      .then((response) => response.json())
      .then((data: { projects: Project[] }) => {
        const active = data.projects.filter((item) => item.isActive);
        setEntryProjects(active);
        setEntryProjectId((current) => active.some((item) => item.id === current) ? current : '');
      })
      .catch(() => { setEntryProjects([]); setEntryProjectId(''); setError(text.error); });
  }, [entryClientId, formOpen]);
  useEffect(() => {
    const project = projects.find((item) => item.id === projectId);
    if (
      !project?.hourBankEnabled
      || !project.hourBankStartDate
      || from > to
      || to < project.hourBankStartDate
    ) {
      setBankWeek(null); setBankError(''); return;
    }
    // Pour une période mensuelle ou personnalisée qui chevauche la banque,
    // montrer la semaine contenant la fin de la période sélectionnée.
    const weekStart = period('week', new Date(`${to}T12:00:00`)).from;
    setBankBusy(true); setBankError('');
    void fetch(`/api/hour-bank/week?projectId=${projectId}&weekStart=${weekStart}`, { credentials: 'include' })
      .then(async (response) => {
        if (!response.ok) throw new Error();
        return response.json() as Promise<HourBankWeek>;
      })
      .then((result) => {
        setBankWeek(result);
        setBankNote(result.note);
      })
      .catch(() => { setBankWeek(null); setBankError(language === 'fr' ? 'La banque d’heures ne s’applique pas à cette semaine.' : 'The hour bank does not apply to this week.'); })
      .finally(() => setBankBusy(false));
  }, [projectId, projects, from, to, reload]);
  useEffect(() => {
    // Toute modification d'un filtre, tri ou page recharge les entrées et remet
    // la sélection multiple à zéro.
    if (from > to) { setLoadingEntries(false); setError(language === 'fr' ? 'La date de début doit précéder ou égaler la date de fin.' : 'The start date must be before or equal to the end date.'); setEntries([]); setSummary({ itemCount: 0, totalMinutes: 0, totalClientMinutes: 0, totalActualAmount: '0.00', totalAmount: '0.00' }); return; }
    setLoadingEntries(true); setError('');
    const params = new URLSearchParams({ from, to, includeDeleted: String(includeDeleted), page: String(page), pageSize: String(pageSize), sortBy, sortDirection });
    if (clientId) params.set('clientId', clientId); if (projectId) params.set('projectId', projectId);
    void fetch(`/api/work-entries?${params}`, { credentials: 'include' }).then(async (response) => { if (!response.ok) throw new Error(); return response.json(); }).then((data: { entries: Entry[]; summary: typeof summary; pageCount: number }) => { setEntries(data.entries); setSummary(data.summary); setPageCount(data.pageCount); setSelected([]); }).catch(() => setError(text.error)).finally(() => setLoadingEntries(false));
  }, [from, to, clientId, projectId, includeDeleted, page, pageSize, sortBy, sortDirection, reload]);

  const choosePreset = (value: Preset) => { setPreset(value); saveCookie('ontime_period_preset', value); setPage(1); if (value !== 'custom') { const range = period(value, today); setFrom(range.from); setTo(range.to); } else { saveCookie('ontime_period_from', from); saveCookie('ontime_period_to', to); } };
  const movePeriod = (direction: -1 | 1) => { if (preset === 'custom') return; const range = shiftPeriod(preset, from, direction); setFrom(range.from); setTo(range.to); setPage(1); };
  const sort = (value: Sort) => { if (sortBy === value) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(value); setSortDirection('asc'); } };
  const openCreate = () => {
    const preferredClient = clientId || cookieValue('ontime_entry_client');
    const preferredProject = projectId || cookieValue('ontime_entry_project');
    setEditing(null);
    setEntryClientId(clients.some((item) => item.id === preferredClient) ? preferredClient : '');
    setEntryProjectId(preferredProject);
    setWorkDate(iso(today));
    setTime('08:00');
    setClientTime('08:00');
    const mode = preferredDescriptionMode();
    setDescriptionMode(mode);
    setDescriptionLines([newDescriptionLine()]);
    setFreeDescription('');
    setLegacyDescription(false);
    setError('');
    setFormOpen(true);
  };
  const openEdit = (entry: Entry) => {
    if (entry.isBilled && !confirm(text.warning)) return;
    setEditing(entry);
    setEntryClientId(entry.clientId);
    setEntryProjectId(entry.projectId);
    setWorkDate(entry.workDate);
    setTime(formatDuration(entry.durationMinutes));
    setClientTime(formatDuration(entry.clientMinutes));
    setDescriptionMode(entry.descriptionDocument ? 'guided' : 'free');
    setDescriptionLines(entry.descriptionDocument ?? parseLegacyDescription(entry.description));
    setFreeDescription(entry.description);
    setLegacyDescription(!entry.descriptionDocument);
    setError('');
    setFormOpen(true);
  };
  const changeDescriptionMode = (mode: DescriptionMode) => {
    if (mode === descriptionMode) return;
    if (mode === 'free') {
      const guided = descriptionDocumentForSave(descriptionLines);
      if (guided.length && !confirm(language === 'fr'
        ? 'Le texte sera conservé, mais l’indentation guidée et les statuts Client/Interne ne pourront plus être gérés séparément. Continuer?'
        : 'The text will be preserved, but guided indentation and individual Client/Internal statuses can no longer be managed. Continue?')) return;
      setFreeDescription(descriptionDocumentFreeText(guided));
    } else {
      setDescriptionLines(parseLegacyDescription(freeDescription));
      setLegacyDescription(Boolean(freeDescription.trim()));
    }
    setDescriptionMode(mode);
    localStorage.setItem('ontime_description_mode', mode);
  };
  const save = async (event: FormEvent) => {
    event.preventDefault();
    const normalizedTime = normalizeDurationInput(time) ?? time;
    const normalizedClientTime = entryUsesBank ? normalizeDurationInput(clientTime) ?? clientTime : normalizedTime;
    if (normalizedTime !== time) setTime(normalizedTime);
    if (normalizedClientTime !== clientTime) setClientTime(normalizedClientTime);
    const durationMinutes = parseDuration(normalizedTime);
    const clientMinutes = parseDuration(normalizedClientTime);
    const descriptionDocument = descriptionMode === 'guided'
      ? descriptionDocumentForSave(descriptionLines)
      : null;
    const description = descriptionMode === 'guided'
      ? descriptionDocumentText(descriptionDocument ?? [])
      : freeDescription.trim();
    if (
      !entryClientId
      || !entryProjectId
      || !description.trim()
      || durationMinutes === null
      || durationMinutes % 15 !== 0
      || (entryUsesBank && (clientMinutes === null || clientMinutes % 15 !== 0))
    ) { setError(text.required); return; }
    const nextClientMinutes = entryUsesBank ? clientMinutes : durationMinutes;
    if (
      editing
      && editing.projectId !== entryProjectId
      && nextClientMinutes !== editing.clientMinutes
      && !confirm(text.reassignmentConfirm)
    ) return;
    const response = await fetch(editing ? `/api/work-entries/${editing.id}` : '/api/work-entries', {
      method: editing ? 'PATCH' : 'POST',
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        projectId: entryProjectId,
        workDate,
        durationMinutes,
        ...(entryUsesBank ? { clientMinutes } : {}),
        description,
        descriptionDocument,
      }),
    });
    if (!response.ok) {
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      setError(payload?.error === 'CLIENT_TIME_LIMIT' ? text.invalidBank : payload?.error === 'BILLED_ENTRY_ASSIGNMENT_LOCKED' ? text.assignmentLocked : text.error);
      return;
    }
    saveCookie('ontime_entry_client', entryClientId);
    saveCookie('ontime_entry_project', entryProjectId);
    setFormOpen(false);
    setReload((current) => current + 1);
  };
  const action = async (path: string, body: unknown) => { if (actionBusy) return; setActionBusy(true); try { const response = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) setError(text.error); else setReload((current) => current + 1); } finally { setActionBusy(false); } };
  const duplicate = async (entry: Entry, nextWorkday: boolean) => {
    if (actionBusy) return;
    setActionBusy(true);
    setError('');
    try {
      const send = (confirmExisting: boolean) => fetch(
        `/api/work-entries/${entry.id}/duplicate`,
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ nextWorkday, confirmExisting }),
        },
      );
      let response = await send(false);
      if (response.status === 409) {
        const payload = await response.json() as {
          error?: string;
          targetDate?: string;
        };
        if (payload.error !== 'DUPLICATE_TARGET_OCCUPIED' || !payload.targetDate) {
          setError(text.error);
          return;
        }
        const confirmed = confirm(language === 'fr'
          ? `Il existe déjà au moins une entrée le ${formatDate(payload.targetDate)}.\n\nVoulez-vous tout de même créer la copie?`
          : `At least one entry already exists on ${formatDate(payload.targetDate)}.\n\nDo you still want to create the copy?`);
        if (!confirmed) return;
        response = await send(true);
      }
      if (!response.ok) {
        setError(text.error);
        return;
      }
      setReload((current) => current + 1);
    } catch {
      setError(text.error);
    } finally {
      setActionBusy(false);
    }
  };
  const toggleDeletedEntry = (entry: Entry) => {
    if (!entry.isDeleted) {
      const message = `${entry.isBilled ? `${text.warning}\n\n` : ''}${text.confirmDelete}`;
      if (!confirm(message)) return;
    }
    void action('/api/work-entries/toggle-deleted', { ids: [entry.id] });
  };
  const saveBankWeek = async () => {
    if (!bankWeek || bankBusy) return;
    setBankBusy(true); setBankError('');
    try {
      const response = await fetch('/api/hour-bank/week', {
        method: 'PUT', credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          projectId, weekStart: bankWeek.weekStart, note: bankNote,
        }),
      });
      if (!response.ok) { setBankError(text.invalidBank); return; }
      const result = await response.json() as HourBankWeek;
      setBankWeek(result);
      setBankModalOpen(false);
      setNotice(text.bankSaved);
    } catch { setBankError(text.error); }
    finally { setBankBusy(false); }
  };
  // Télécharger le Blob avec le nom de fichier calculé par le backend.
  const exportExcel = async () => {
    if (exporting || from > to) return;
    setExporting(true);
    setError('');
    try {
      // Avec un client sélectionné, sa liste de projets est déjà chargée. Pour
      // « Tous les clients », les projets actifs sont consultés avant l'export
      // afin que le rappel couvre réellement tout le fichier demandé.
      let exportProjects = projects;
      if (!clientId) {
        const responses = await Promise.all(clients.map(async (client) => {
          const response = await fetch(`/api/projects?clientId=${client.id}`, {
            credentials: 'include',
          });
          if (!response.ok) throw new Error('Unable to inspect hour-bank projects');
          return ((await response.json()) as { projects: Project[] }).projects;
        }));
        exportProjects = responses.flat();
      }

      if (hasEnabledHourBank(exportProjects) && !confirm(exportBankReminder[language])) {
        return;
      }

      const params = new URLSearchParams({
        from,
        to,
        includeDeleted: String(includeDeleted),
        confidential: String(confidential),
        language,
      });
      if (clientId) params.set('clientId', clientId);
      if (projectId) params.set('projectId', projectId);
      const response = await fetch(`/api/work-entries/export?${params}`, {
        credentials: 'include',
      });
      if (!response.ok) { setError(text.error); return; }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'OnTime.xlsx';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch {
      setError(text.error);
    } finally {
      setExporting(false);
    }
  };
  // Tous les clients : afficher client et projet. Un client : afficher le projet.
  // Un projet précis : masquer les deux colonnes déjà connues par les filtres.
  const columns = !clientId ? 'both' : !projectId ? 'project' : 'none';

  return <main className="app-page"><header className="app-header"><div className="app-brand"><span className="brand-mark">OT</span><span>OnTime</span></div><nav className="app-nav"><button className="active">{text.journal}</button><button onClick={onNavigateClients}>{text.clients}</button><button onClick={onNavigateProjects}>{text.projects}</button><button onClick={onNavigateProfile}>{language === 'fr' ? 'Profil' : 'Profile'}</button>{user.isAdmin ? <button onClick={onNavigateAdmin}>{language === 'fr' ? 'Administration' : 'Admin'}</button> : null}</nav><div className="header-actions"><label className="confidential-switch"><input type="checkbox" checked={confidential} onChange={(event) => { setConfidential(event.target.checked); document.cookie = `ontime_confidential=${event.target.checked}; Max-Age=31536000; Path=/; SameSite=Lax`; }} />{text.confidential}</label><div className="language-switch compact">{(['fr', 'en'] as const).map((value) => <button key={value} className={language === value ? 'active' : ''} onClick={() => onLanguageChange(value)}>{value.toUpperCase()}</button>)}</div><UserEnvironmentChip user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} logoutLabel={text.logout} onLogout={onLogout} /></div></header>
    <section className="content-shell worklog-shell"><div className="page-heading"><div><p className="eyebrow">ONTIME</p><h1>{text.title}</h1></div><div className="heading-actions"><button className="secondary-button export-button" disabled={exporting || from > to} onClick={() => void exportExcel()}>{exporting ? (language === 'fr' ? 'Export…' : 'Exporting…') : text.export}</button><button className="add-button" disabled={actionBusy} onClick={openCreate}><span>+</span>{text.add}</button></div></div>
      <div className="journal-filters"><div className="period-selector"><span className="filter-label">{text.period}</span><div className="period-controls"><button className="period-arrow" disabled={preset === 'custom'} title={text.previous} aria-label={text.previous} onClick={() => movePeriod(-1)}>←</button><div className="preset-group" role="group" aria-label={text.period}>{(['day', 'week', 'month', 'year', 'custom'] as Preset[]).map((value) => <button aria-pressed={preset === value} className={preset === value ? 'active' : ''} onClick={() => choosePreset(value)} key={value}>{text[value]}</button>)}</div><button className="period-arrow" disabled={preset === 'custom'} title={text.following} aria-label={text.following} onClick={() => movePeriod(1)}>→</button></div></div><label>{text.from}<input type="date" value={from} onChange={(event) => { const value = event.target.value; setPreset('custom'); setFrom(value); saveCookie('ontime_period_preset', 'custom'); saveCookie('ontime_period_from', value); saveCookie('ontime_period_to', to); setPage(1); }} /></label><label>{text.to}<input type="date" value={to} onChange={(event) => { const value = event.target.value; setPreset('custom'); setTo(value); saveCookie('ontime_period_preset', 'custom'); saveCookie('ontime_period_from', from); saveCookie('ontime_period_to', value); setPage(1); }} /></label><label>{text.client}<select value={clientId} onChange={(event) => { const value = event.target.value; setClientId(value); setProjectId(''); saveCookie('ontime_client_filter', value); saveCookie('ontime_project_filter', ''); setPage(1); }}><option value="">{text.allClients}</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{text.project}<select disabled={!clientId} value={projectId} onChange={(event) => { setProjectId(event.target.value); saveCookie('ontime_project_filter', event.target.value); setPage(1); }}><option value="">{text.allProjects}</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      {subscriptionDaysRemaining !== null ? <p className="subscription-warning" role="status">{
        language === 'fr'
          ? subscriptionDaysRemaining === 0
            ? 'Votre souscription expire aujourd’hui. Renouvelez-la à partir de votre profil pour conserver votre accès.'
            : subscriptionDaysRemaining === 1
              ? 'Votre souscription expire demain. Vous pouvez demander son renouvellement dans votre profil.'
              : `Votre souscription expire dans ${subscriptionDaysRemaining} jours. Vous pouvez demander son renouvellement dans votre profil.`
          : subscriptionDaysRemaining === 0
            ? 'Your subscription expires today. Renew it from your profile to keep access.'
            : subscriptionDaysRemaining === 1
              ? 'Your subscription expires tomorrow. You can request a renewal from your profile.'
              : `Your subscription expires in ${subscriptionDaysRemaining} days. You can request a renewal from your profile.`
      }</p> : null}
      {!projectId ? <p className="journal-hint">{text.selectProject}</p> : null}{notice ? <p className="success-message page-notice">{notice}</p> : null}{bankWeek && !bankWeek.isConsistent ? <p className="warning-message page-notice">{text.bankInconsistent}</p> : null}{filterError ? <p className="error-message page-error">{filterError}</p> : null}{error ? <p className="error-message page-error">{error}</p> : null}
      {bankBusy && !bankWeek ? <p className="journal-loading"><span className="loading-ring" />{text.hourBank}</p> : null}
      {bankError ? <p className="error-message page-error">{bankError}</p> : null}
      <div className="journal-summary"><div><span>{text.items}</span><strong>{summary.itemCount}</strong></div><div><span>{text.actual}</span><strong>{formatDuration(Number(summary.totalMinutes))} <small>/ {formatDuration(possibleMinutes)}</small></strong></div>{selectedProject?.hourBankEnabled ? <div><span>{text.clientTime}</span><strong>{formatDuration(Number(summary.totalClientMinutes))}</strong></div> : null}{bankWeek && bankBalance !== null ? <button className="bank-summary-card" onClick={() => setBankModalOpen(true)}><span>{text.hourBank}</span><strong>{formatDuration(bankBalance)} <small className={bankPeriodMovement < 0 ? 'negative' : 'positive'}>{bankPeriodMovement > 0 ? '+' : ''}{formatDuration(bankPeriodMovement)}</small></strong><em>{text.reviewWeek}</em></button> : null}{!confidential ? <div><span>{text.value}</span><strong>${Number(summary.totalAmount).toLocaleString('en-CA', { minimumFractionDigits: 2 })}{possibleAmount !== null ? <small> / ${possibleAmount.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small> : null}</strong></div> : null}<label><input type="checkbox" checked={includeDeleted} onChange={(event) => { setIncludeDeleted(event.target.checked); setPage(1); }} />{text.deleted}</label></div>
      <div className="journal-actions"><button disabled={!selected.length || actionBusy} onClick={() => void action('/api/work-entries/toggle-billed', { ids: selected })}>{text.toggleBilled}</button></div>
      {loadingEntries ? <p className="journal-loading"><span className="loading-ring" />{language === 'fr' ? 'Chargement…' : 'Loading…'}</p> : null}
      <div className="mobile-entry-list" aria-label={language === 'fr' ? 'Entrées du journal' : 'Work log entries'}>
        {entries.map((entry) => {
          const movement = entry.durationMinutes - entry.clientMinutes;
          const isToday = isTodayWorkDate(entry.workDate, today);
          return <article className={`mobile-entry-card ${entry.isDeleted ? 'deleted-entry ' : ''}${isToday ? 'today-entry' : ''}`} key={entry.id}>
            <div className="mobile-entry-heading">
              <div><strong>{entry.clientName}</strong><span>{entry.projectName}</span></div>
              <time dateTime={entry.workDate}>{isToday ? <span className="today-entry-badge">{todayLabel}</span> : null}{formatWeekday(entry.workDate, language)} {formatDate(entry.workDate)}</time>
            </div>
            <button type="button" className="mobile-entry-description" onClick={() => openEdit(entry)}><EntryModeIndicator guided={Boolean(entry.descriptionDocument)} language={language} /><span>{firstDescriptionLine(entry.description)}</span></button>
            <div className="mobile-entry-metrics">
              <span><small>{text.actual}</small><strong>{formatDuration(entry.durationMinutes)}</strong></span>
              {entry.clientMinutes !== entry.durationMinutes ? <span><small>{text.clientTime}</small><strong>{formatDuration(entry.clientMinutes)}</strong></span> : null}
              {movement !== 0 ? <span><small>{text.bankMovement}</small><strong className={movement < 0 ? 'negative' : 'positive'}>{movement > 0 ? '+' : ''}{formatDuration(movement)}</strong></span> : null}
            </div>
            <div className="mobile-entry-footer">
              <label><input type="checkbox" checked={entry.isBilled} disabled={actionBusy} onChange={() => void action('/api/work-entries/toggle-billed', { ids: [entry.id] })} />{text.billed}</label>
              <div className="mobile-entry-actions">
                <button type="button" onClick={() => openEdit(entry)}>{text.edit}</button>
                <button type="button" onClick={() => void duplicate(entry, false)}>{text.duplicate}</button>
                <button type="button" onClick={() => void duplicate(entry, true)}>{language === 'fr' ? 'Jour suivant' : 'Next day'}</button>
                <button type="button" className={entry.isDeleted ? 'restore-entry-action' : 'delete-entry-action'} title={entry.isDeleted ? text.restoreEntry : text.deleteEntry} onClick={() => toggleDeletedEntry(entry)}>{entry.isDeleted ? (language === 'fr' ? 'Restaurer' : 'Restore') : (language === 'fr' ? 'Supprimer' : 'Delete')}</button>
              </div>
            </div>
          </article>;
        })}
        {!entries.length && !loadingEntries ? <p className="mobile-empty-state">{text.empty}</p> : null}
      </div>
      <div className="journal-table-wrap"><table className="journal-table"><thead><tr><th><input type="checkbox" checked={entries.length > 0 && selected.length === entries.length} onChange={(event) => setSelected(event.target.checked ? entries.map((item) => item.id) : [])} /></th>{columns === 'both' ? <th onClick={() => sort('client')}>{text.client}</th> : null}{columns !== 'none' ? <th onClick={() => sort('project')}>{text.project}</th> : null}<th>{text.day}</th><th onClick={() => sort('workDate')}>{text.date}</th><th>{text.description}</th><th onClick={() => sort('duration')}>{selectedProject?.hourBankEnabled ? text.actual : text.hours}</th>{selectedProject?.hourBankEnabled ? <><th>{text.clientTime}</th><th>{text.bankMovement}</th></> : null}{!confidential ? <><th onClick={() => sort('hourlyRate')}>{text.rate}</th><th onClick={() => sort('amount')}>{text.value}</th></> : null}<th onClick={() => sort('isBilled')}>{text.billed}</th><th /></tr></thead><tbody>{entries.map((entry) => { const movement = entry.durationMinutes - entry.clientMinutes; const isToday = isTodayWorkDate(entry.workDate, today); return <tr key={entry.id} className={`${entry.isDeleted ? 'deleted-entry ' : ''}${isToday ? 'today-entry' : ''}`}><td><input type="checkbox" checked={selected.includes(entry.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id))} /></td>{columns === 'both' ? <td>{entry.clientName}</td> : null}{columns !== 'none' ? <td>{entry.projectName}</td> : null}<td>{formatWeekday(entry.workDate, language)}</td><td>{formatDate(entry.workDate)}{isToday ? <span className="today-entry-badge">{todayLabel}</span> : null}</td><td className="description-cell"><div className="entry-description-summary"><EntryModeIndicator guided={Boolean(entry.descriptionDocument)} language={language} /><DescriptionPreview description={entry.description} /></div></td><td>{formatDuration(entry.durationMinutes)}</td>{selectedProject?.hourBankEnabled ? <><td>{formatDuration(entry.clientMinutes)}</td><td className={movement < 0 ? 'negative' : movement > 0 ? 'positive' : ''}>{movement > 0 ? '+' : ''}{formatDuration(movement)}</td></> : null}{!confidential ? <><td>${Number(entry.hourlyRate).toFixed(2)}</td><td>${Number(entry.amount).toFixed(2)}</td></> : null}<td><input type="checkbox" checked={entry.isBilled} disabled={actionBusy} title={text.toggleBilled} aria-label={`${text.toggleBilled}: ${formatDate(entry.workDate)}`} onChange={() => void action('/api/work-entries/toggle-billed', { ids: [entry.id] })} /></td><td className="row-actions"><button title={text.edit} onClick={() => openEdit(entry)}>✎</button><button title={text.duplicate} onClick={() => void duplicate(entry, false)}>⧉</button><button title={text.next} onClick={() => void duplicate(entry, true)}>⧉+1</button><button className={entry.isDeleted ? 'restore-entry-action' : 'delete-entry-action'} title={entry.isDeleted ? text.restoreEntry : text.deleteEntry} aria-label={`${entry.isDeleted ? text.restoreEntry : text.deleteEntry}: ${formatDate(entry.workDate)}`} disabled={actionBusy} onClick={() => toggleDeletedEntry(entry)}>{entry.isDeleted ? '↺' : '−'}</button></td></tr>; })}{!entries.length ? <tr><td colSpan={15} className="empty-table">{text.empty}</td></tr> : null}</tbody></table></div>
      <div className="journal-pagination"><label>{text.items}<select value={pageSize} onChange={(event) => { const value = Number(event.target.value); setPageSize(value); setPage(1); document.cookie = `ontime_page_size=${value}; Max-Age=31536000; Path=/; SameSite=Lax`; }}>{[10, 25, 50, 100].map((value) => <option key={value}>{value}</option>)}</select></label><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{text.previous}</button><span>{text.page} {page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>{text.following}</button></div>
    </section>
    <nav className="mobile-primary-nav" aria-label={language === 'fr' ? 'Navigation mobile' : 'Mobile navigation'}>
      <button type="button" className="active" onClick={() => { choosePreset('day'); window.scrollTo({ top: 0, behavior: 'smooth' }); }}><span aria-hidden="true">☷</span>{text.journal}</button>
      <button type="button" className="mobile-add-entry" onClick={openCreate}><span aria-hidden="true">＋</span>{language === 'fr' ? 'Ajouter' : 'Add'}</button>
      <button type="button" onClick={onNavigateProfile}><span aria-hidden="true">○</span>{language === 'fr' ? 'Profil' : 'Profile'}</button>
    </nav>
    {formOpen ? <div className="modal-backdrop"><section className={`client-modal entry-modal ${entryModalExpanded ? 'entry-modal-expanded' : ''}`}><div className="modal-heading"><h2>{editing ? text.editEntry : text.newEntry}</h2><div className="modal-heading-actions"><button type="button" className="entry-modal-size-button" aria-pressed={entryModalExpanded} onClick={() => { const expanded = !entryModalExpanded; setEntryModalExpanded(expanded); localStorage.setItem('ontime_entry_modal_expanded', String(expanded)); }}>{entryModalExpanded ? (language === 'fr' ? 'Réduire' : 'Restore') : (language === 'fr' ? 'Agrandir' : 'Expand')}</button><button className="close-button" onClick={() => setFormOpen(false)}>×</button></div></div><form onSubmit={save}><div className="entry-assignment-grid"><label>{text.client}<select value={entryClientId} disabled={Boolean(editing?.isBilled)} required onChange={(event) => { const value = event.target.value; setEntryClientId(value); setEntryProjectId(''); if (!editing) { saveCookie('ontime_entry_client', value); saveCookie('ontime_entry_project', ''); } }}><option value="">{text.chooseClient}</option>{clients.map((client) => <option key={client.id} value={client.id}>{client.name}</option>)}</select></label><label>{text.project}<select value={entryProjectId} disabled={Boolean(editing?.isBilled) || !entryClientId} required onChange={(event) => { setEntryProjectId(event.target.value); if (!editing) saveCookie('ontime_entry_project', event.target.value); }}><option value="">{text.chooseProject}</option>{entryProjects.map((project) => <option key={project.id} value={project.id}>{project.name}</option>)}</select></label></div>{editing?.isBilled ? <p className="entry-assignment-note">{text.assignmentLocked}</p> : null}<div className={`entry-time-summary-grid ${entryUsesBank ? 'with-bank' : ''}`}><label>{text.date}<input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} required /></label><label>{text.duration}<QuickDurationInput value={time} onChange={(value) => { setTime(value); if (!editing) setClientTime(value); }} onComplete={(value) => { if (!editing) setClientTime(value); }} /></label>{entryUsesBank ? <label>{text.clientDuration}<QuickDurationInput value={clientTime} onChange={setClientTime} /></label> : null}{entryUsesBank ? <div className="entry-bank-preview"><span>{text.bankMovement}</span><div className="entry-bank-value"><strong className={(parseDuration(time) ?? 0) - (parseDuration(clientTime) ?? 0) < 0 ? 'negative' : 'positive'}>{(parseDuration(time) ?? 0) - (parseDuration(clientTime) ?? 0) > 0 ? '+' : ''}{formatDuration((parseDuration(time) ?? 0) - (parseDuration(clientTime) ?? 0))}</strong><small>{language === 'fr' ? 'Maximum facturable' : 'Billable maximum'} : {formatDuration(entryProject?.maxDailyBillableMinutes ?? 480)} / {language === 'fr' ? 'jour' : 'day'}</small></div></div> : null}</div><div className="entry-description-field"><span>{text.description}</span><EntryDescriptionEditor language={language} mode={descriptionMode} lines={descriptionLines} freeText={freeDescription} legacySource={legacyDescription} onModeChange={changeDescriptionMode} onLinesChange={setDescriptionLines} onFreeTextChange={setFreeDescription} /></div>{error ? <p className="error-message">{error}</p> : null}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>{text.back}</button><button className="primary-button">{text.save}</button></div></form></section></div> : null}
    {bankModalOpen && bankWeek ? <div className="modal-backdrop"><section className="client-modal hour-bank-modal"><div className="modal-heading"><div><p className="eyebrow">{text.hourBank}</p><h2>{formatDate(bankWeek.weekStart)} – {formatDate(bankWeek.weekEnd)}</h2></div><button className="close-button" onClick={() => setBankModalOpen(false)}>×</button></div><div className="hour-bank-balances"><span>{text.openingBalance}<strong>{formatDuration(bankWeek.openingBalanceMinutes)}</strong></span><span>{text.closingBalance}<strong>{formatDuration(bankWeek.closingBalanceMinutes)}</strong></span></div><div className="hour-bank-days"><div className="hour-bank-day hour-bank-day-head"><span>{text.date}</span><span>{text.actual}</span><span>{text.clientTime}</span><span>{text.bankMovement}</span></div>{bankWeek.days.map((day) => <div className="hour-bank-day" key={day.workDate}><span>{formatDate(day.workDate)}</span><strong>{formatDuration(day.actualMinutes)}</strong><strong>{formatDuration(day.billedMinutes)}</strong><strong className={day.movementMinutes < 0 ? 'negative' : day.movementMinutes > 0 ? 'positive' : ''}>{day.movementMinutes > 0 ? '+' : ''}{formatDuration(day.movementMinutes)}</strong></div>)}</div><label className="hour-bank-note">{text.bankNote}<input value={bankNote} maxLength={500} onChange={(event) => setBankNote(event.target.value)} /></label>{bankError ? <p className="error-message">{bankError}</p> : null}<div className="hour-bank-footer"><small>{formatDuration(bankWeek.project.maxDailyBillableMinutes)} / {language === 'fr' ? 'jour' : 'day'} · {formatDuration(bankWeek.project.maxWeeklyBillableMinutes)} / {language === 'fr' ? 'semaine' : 'week'}</small><button className="primary-button small" disabled={bankBusy} onClick={() => void saveBankWeek()}>{bankWeek.isClosed ? text.updateWeek : text.closeWeek}</button></div></section></div> : null}
  </main>;
}
