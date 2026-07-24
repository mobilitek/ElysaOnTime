import { type FormEvent, useEffect, useMemo, useState } from 'react';

type Language = 'fr' | 'en';
type User = { firstName: string; lastName: string };
type Client = { id: string; name: string; isActive: boolean };
type Project = { id: string; name: string; hourlyRate: string; isActive: boolean };
type Entry = { id: string; clientName: string; projectName: string; workDate: string; durationMinutes: number; description: string; hourlyRate: string; amount: string; isBilled: boolean; isDeleted: boolean };
type Preset = 'day' | 'week' | 'month' | 'year' | 'custom';
type Sort = 'workDate' | 'client' | 'project' | 'duration' | 'hourlyRate' | 'amount' | 'isBilled';
type Props = { language: Language; user: User; onLanguageChange: (value: Language) => void; onLogout: () => Promise<void>; onNavigateClients: () => void; onNavigateProjects: () => void; onNavigateProfile: () => void };
type ImportAnalysis = { digest: string; clients: number; projects: number; entries: number; billed: number; deleted: number; totalMinutes: number; totalAmount: string; firstDate: string; lastDate: string; duplicateRows: number; zeroMinuteEntries: number; negativeRateEntries: number };

const pad = (value: number) => String(value).padStart(2, '0');
const iso = (date: Date) => `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
const period = (preset: Preset, anchor: Date) => {
  const from = new Date(anchor); const to = new Date(anchor);
  if (preset === 'week') { const offset = (anchor.getDay() + 1) % 7; from.setDate(anchor.getDate() - offset); to.setTime(from.getTime()); to.setDate(from.getDate() + 6); }
  if (preset === 'month') { from.setDate(1); to.setMonth(anchor.getMonth() + 1, 0); }
  if (preset === 'year') { from.setMonth(0, 1); to.setMonth(11, 31); }
  return { from: iso(from), to: iso(to) };
};
const formatDate = (value: string) => { const [y, m, d] = value.split('-'); return `${d}/${m}/${y}`; };
const formatDuration = (minutes: number) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;
export const possibleWorkingMinutes = (from: string, to: string) => {
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
const presetCookie = (): Preset => {
  const value = cookieValue('ontime_period_preset');
  return ['day', 'week', 'month', 'year', 'custom'].includes(value) ? value as Preset : 'month';
};
const initialPeriod = (anchor: Date) => {
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

const copy = {
  fr: { journal: 'Journal', clients: 'Mes clients', projects: 'Projets', logout: 'Se déconnecter', title: 'Journal de travail', period: 'Période', day: 'Jour', week: 'Semaine', month: 'Mois', year: 'Année', custom: 'Personnalisé', from: 'Du', to: 'Au', allClients: 'Tous les clients', allProjects: 'Tous les projets', client: 'Client', project: 'Projet', add: 'Nouvelle entrée', export: 'Exporter Excel', import: 'Importer Excel', date: 'Date', description: 'Description', hours: 'Heures', rate: 'Taux', value: 'Valeur', billed: 'Facturé', items: 'Entrées', confidential: 'Confidentiel', deleted: 'Afficher les supprimées', edit: 'Modifier', duplicate: 'Copier', next: 'Copier au prochain jour ouvrable', toggleBilled: 'Inverser facturation', toggleDeleted: 'Masquer / restaurer', empty: 'Aucune entrée pour ces filtres.', selectProject: 'Sélectionnez un client et un projet précis pour ajouter une entrée.', newEntry: 'Nouvelle entrée', editEntry: 'Modifier l’entrée', back: 'Retour', save: 'Valider', duration: 'Durée (HH:MM)', required: 'La description est obligatoire et la durée doit être un multiple de 15 minutes.', warning: 'Cette entrée est facturée. Voulez-vous vraiment continuer?', confirmDelete: 'Inverser le statut supprimé des entrées sélectionnées?', error: 'Une erreur est survenue.', page: 'Page', previous: 'Précédente', following: 'Suivante' },
  en: { journal: 'Work log', clients: 'My clients', projects: 'Projects', logout: 'Sign out', title: 'Work log', period: 'Period', day: 'Day', week: 'Week', month: 'Month', year: 'Year', custom: 'Custom', from: 'From', to: 'To', allClients: 'All clients', allProjects: 'All projects', client: 'Client', project: 'Project', add: 'New entry', export: 'Export Excel', import: 'Import Excel', date: 'Date', description: 'Description', hours: 'Hours', rate: 'Rate', value: 'Value', billed: 'Billed', items: 'Entries', confidential: 'Confidential', deleted: 'Show deleted', edit: 'Edit', duplicate: 'Copy', next: 'Copy to next business day', toggleBilled: 'Toggle billed', toggleDeleted: 'Hide / restore', empty: 'No entries match these filters.', selectProject: 'Select one client and one project to add an entry.', newEntry: 'New entry', editEntry: 'Edit entry', back: 'Back', save: 'Save', duration: 'Duration (HH:MM)', required: 'Description is required and duration must be a multiple of 15 minutes.', warning: 'This entry is billed. Do you really want to continue?', confirmDelete: 'Toggle deleted status for selected entries?', error: 'Something went wrong.', page: 'Page', previous: 'Previous', following: 'Next' },
} as const;

export function WorkLogPage(props: Props) {
  const { language, user, onLanguageChange, onLogout, onNavigateClients, onNavigateProjects, onNavigateProfile } = props;
  const text = copy[language]; const today = useMemo(() => new Date(), []); const initial = useMemo(() => initialPeriod(today), [today]);
  const [preset, setPreset] = useState<Preset>(initial.preset); const [from, setFrom] = useState(initial.from); const [to, setTo] = useState(initial.to);
  const [clients, setClients] = useState<Client[]>([]); const [clientId, setClientId] = useState(() => cookieValue('ontime_client_filter')); const [projects, setProjects] = useState<Project[]>([]); const [projectId, setProjectId] = useState(() => cookieValue('ontime_project_filter'));
  const [entries, setEntries] = useState<Entry[]>([]); const [selected, setSelected] = useState<string[]>([]); const [summary, setSummary] = useState({ itemCount: 0, totalMinutes: 0, totalAmount: '0.00' });
  const [includeDeleted, setIncludeDeleted] = useState(false); const [confidential, setConfidential] = useState(document.cookie.includes('ontime_confidential=true')); const [pageSize, setPageSize] = useState(pageSizeCookie); const [page, setPage] = useState(1); const [pageCount, setPageCount] = useState(1); const [sortBy, setSortBy] = useState<Sort>('workDate'); const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc'); const [reload, setReload] = useState(0);
  const [editing, setEditing] = useState<Entry | null>(null); const [formOpen, setFormOpen] = useState(false); const [workDate, setWorkDate] = useState(iso(today)); const [time, setTime] = useState('08:00'); const [description, setDescription] = useState(''); const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [loadingEntries, setLoadingEntries] = useState(false); const [exporting, setExporting] = useState(false); const [actionBusy, setActionBusy] = useState(false);
  const [importOpen, setImportOpen] = useState(false); const [importFile, setImportFile] = useState<File | null>(null); const [importAnalysis, setImportAnalysis] = useState<ImportAnalysis | null>(null); const [importConfirmation, setImportConfirmation] = useState(''); const [importBusy, setImportBusy] = useState(false); const [importError, setImportError] = useState('');
  const possibleMinutes = useMemo(() => from <= to ? possibleWorkingMinutes(from, to) : 0, [from, to]);
  const weightedRate = Number(summary.totalMinutes) > 0
    ? Number(summary.totalAmount) / (Number(summary.totalMinutes) / 60)
    : projects.length
      ? projects.reduce((sum, project) => sum + Number(project.hourlyRate), 0) / projects.length
      : 0;
  const possibleAmount = clientId ? (possibleMinutes / 60) * weightedRate : null;

  useEffect(() => { void fetch('/api/clients', { credentials: 'include' }).then((response) => response.json()).then((data: { clients: Client[] }) => { const active = data.clients.filter((item) => item.isActive); setClients(active); if (clientId && !active.some((item) => item.id === clientId)) { setClientId(''); setProjectId(''); saveCookie('ontime_client_filter', ''); saveCookie('ontime_project_filter', ''); } }).catch(() => setError(text.error)); }, []);
  useEffect(() => { if (!clientId) { setProjects([]); setProjectId(''); return; } void fetch(`/api/projects?clientId=${clientId}`, { credentials: 'include' }).then((response) => response.json()).then((data: { projects: Project[] }) => { const active = data.projects.filter((item) => item.isActive); setProjects(active); const saved = cookieValue('ontime_project_filter'); const next = active.some((item) => item.id === saved) ? saved : ''; setProjectId(next); if (!next) saveCookie('ontime_project_filter', ''); }).catch(() => setError(text.error)); }, [clientId]);
  useEffect(() => {
    if (from > to) { setLoadingEntries(false); setError(language === 'fr' ? 'La date de début doit précéder ou égaler la date de fin.' : 'The start date must be before or equal to the end date.'); setEntries([]); setSummary({ itemCount: 0, totalMinutes: 0, totalAmount: '0.00' }); return; }
    setLoadingEntries(true); setError('');
    const params = new URLSearchParams({ from, to, includeDeleted: String(includeDeleted), page: String(page), pageSize: String(pageSize), sortBy, sortDirection });
    if (clientId) params.set('clientId', clientId); if (projectId) params.set('projectId', projectId);
    void fetch(`/api/work-entries?${params}`, { credentials: 'include' }).then(async (response) => { if (!response.ok) throw new Error(); return response.json(); }).then((data: { entries: Entry[]; summary: typeof summary; pageCount: number }) => { setEntries(data.entries); setSummary(data.summary); setPageCount(data.pageCount); setSelected([]); }).catch(() => setError(text.error)).finally(() => setLoadingEntries(false));
  }, [from, to, clientId, projectId, includeDeleted, page, pageSize, sortBy, sortDirection, reload]);

  const choosePreset = (value: Preset) => { setPreset(value); saveCookie('ontime_period_preset', value); setPage(1); if (value !== 'custom') { const range = period(value, today); setFrom(range.from); setTo(range.to); } else { saveCookie('ontime_period_from', from); saveCookie('ontime_period_to', to); } };
  const movePeriod = (direction: -1 | 1) => { if (preset === 'custom') return; const range = shiftPeriod(preset, from, direction); setFrom(range.from); setTo(range.to); setPage(1); };
  const sort = (value: Sort) => { if (sortBy === value) setSortDirection((current) => current === 'asc' ? 'desc' : 'asc'); else { setSortBy(value); setSortDirection('asc'); } };
  const openCreate = () => { setEditing(null); setWorkDate(iso(today)); setTime('08:00'); setDescription(''); setError(''); setFormOpen(true); };
  const openEdit = (entry: Entry) => { if (entry.isBilled && !confirm(text.warning)) return; setEditing(entry); setWorkDate(entry.workDate); setTime(formatDuration(entry.durationMinutes)); setDescription(entry.description); setError(''); setFormOpen(true); };
  const minutes = () => { const match = /^(\d+):([0-5]\d)$/.exec(time); return match ? Number(match[1]) * 60 + Number(match[2]) : 0; };
  const save = async (event: FormEvent) => { event.preventDefault(); const durationMinutes = minutes(); if (!description.trim() || durationMinutes < 15 || durationMinutes % 15) { setError(text.required); return; } const response = await fetch(editing ? `/api/work-entries/${editing.id}` : '/api/work-entries', { method: editing ? 'PATCH' : 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...(!editing ? { projectId } : {}), workDate, durationMinutes, description: description.trim() }) }); if (!response.ok) { setError(text.error); return; } setFormOpen(false); setReload((current) => current + 1); };
  const action = async (path: string, body: unknown) => { if (actionBusy) return; setActionBusy(true); try { const response = await fetch(path, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }); if (!response.ok) setError(text.error); else setReload((current) => current + 1); } finally { setActionBusy(false); } };
  const exportExcel = async () => { if (exporting || from > to) return; setExporting(true); try { const params = new URLSearchParams({ from, to, includeDeleted: String(includeDeleted), confidential: String(confidential), language }); if (clientId) params.set('clientId', clientId); if (projectId) params.set('projectId', projectId); const response = await fetch(`/api/work-entries/export?${params}`, { credentials: 'include' }); if (!response.ok) { setError(text.error); return; } const blob = await response.blob(); const disposition = response.headers.get('content-disposition') ?? ''; const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'OnTime.xlsx'; const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = name; link.click(); URL.revokeObjectURL(link.href); } finally { setExporting(false); } };
  const openImport = () => { setImportFile(null); setImportAnalysis(null); setImportConfirmation(''); setImportError(''); setImportOpen(true); };
  const analyzeImport = async () => {
    if (!importFile || importBusy) return;
    setImportBusy(true); setImportError(''); setImportAnalysis(null);
    try {
      const body = new FormData(); body.set('file', importFile);
      const response = await fetch('/api/data-import/analyze', { method: 'POST', credentials: 'include', body });
      const payload = await response.json() as { analysis?: ImportAnalysis; detail?: string };
      if (!response.ok || !payload.analysis) { setImportError(payload.detail ?? text.error); return; }
      setImportAnalysis(payload.analysis);
    } catch { setImportError(text.error); } finally { setImportBusy(false); }
  };
  const executeImport = async () => {
    if (!importFile || !importAnalysis || importConfirmation !== 'REMPLACER' || importBusy) return;
    setImportBusy(true); setImportError('');
    try {
      const body = new FormData(); body.set('file', importFile); body.set('digest', importAnalysis.digest); body.set('confirmation', importConfirmation);
      const response = await fetch('/api/data-import/execute', { method: 'POST', credentials: 'include', body });
      const payload = await response.json() as { detail?: string };
      if (!response.ok) { setImportError(payload.detail ?? text.error); return; }
      saveCookie('ontime_client_filter', '');
      saveCookie('ontime_project_filter', '');
      setClientId('');
      setProjectId('');
      setProjects([]);
      setPage(1);
      setSelected([]);
      setImportOpen(false);
      setImportFile(null);
      setImportAnalysis(null);
      setImportConfirmation('');
      setError('');
      setNotice(language === 'fr' ? 'Importation terminée avec succès.' : 'Import completed successfully.');
      const clientsResponse = await fetch('/api/clients', { credentials: 'include' });
      if (clientsResponse.ok) {
        const clientsPayload = await clientsResponse.json() as { clients: Client[] };
        setClients(clientsPayload.clients.filter((item) => item.isActive));
      }
      setReload((current) => current + 1);
    } catch { setImportError(text.error); } finally { setImportBusy(false); }
  };
  const columns = !clientId ? 'both' : !projectId ? 'project' : 'none';

  return <main className="app-page"><header className="app-header"><div className="app-brand"><span className="brand-mark">OT</span><span>OnTime</span></div><nav className="app-nav"><button className="active">{text.journal}</button><button onClick={onNavigateClients}>{text.clients}</button><button onClick={onNavigateProjects}>{text.projects}</button><button onClick={onNavigateProfile}>{language === 'fr' ? 'Profil' : 'Profile'}</button></nav><div className="header-actions"><label className="confidential-switch"><input type="checkbox" checked={confidential} onChange={(event) => { setConfidential(event.target.checked); document.cookie = `ontime_confidential=${event.target.checked}; Max-Age=31536000; Path=/; SameSite=Lax`; }} />{text.confidential}</label><div className="language-switch compact">{(['fr', 'en'] as const).map((value) => <button key={value} className={language === value ? 'active' : ''} onClick={() => onLanguageChange(value)}>{value.toUpperCase()}</button>)}</div><div className="user-chip"><span>{user.firstName[0]}{user.lastName[0]}</span><div><strong>{user.firstName} {user.lastName}</strong><button onClick={() => void onLogout()}>{text.logout}</button></div></div></div></header>
    <section className="content-shell worklog-shell"><div className="page-heading"><div><p className="eyebrow">ONTIME</p><h1>{text.title}</h1></div><div className="heading-actions"><button className="secondary-button export-button" disabled={exporting || from > to} onClick={() => void exportExcel()}>{exporting ? (language === 'fr' ? 'Export…' : 'Exporting…') : text.export}</button><button className="secondary-button import-button" onClick={openImport}>{text.import}</button><button className="add-button" disabled={!projectId || actionBusy} onClick={openCreate}><span>+</span>{text.add}</button></div></div>
      <div className="journal-filters"><div className="period-selector"><span className="filter-label">{text.period}</span><div className="period-controls"><button className="period-arrow" disabled={preset === 'custom'} title={text.previous} aria-label={text.previous} onClick={() => movePeriod(-1)}>←</button><div className="preset-group" role="group" aria-label={text.period}>{(['day', 'week', 'month', 'year', 'custom'] as Preset[]).map((value) => <button aria-pressed={preset === value} className={preset === value ? 'active' : ''} onClick={() => choosePreset(value)} key={value}>{text[value]}</button>)}</div><button className="period-arrow" disabled={preset === 'custom'} title={text.following} aria-label={text.following} onClick={() => movePeriod(1)}>→</button></div></div><label>{text.from}<input type="date" value={from} onChange={(event) => { const value = event.target.value; setPreset('custom'); setFrom(value); saveCookie('ontime_period_preset', 'custom'); saveCookie('ontime_period_from', value); saveCookie('ontime_period_to', to); setPage(1); }} /></label><label>{text.to}<input type="date" value={to} onChange={(event) => { const value = event.target.value; setPreset('custom'); setTo(value); saveCookie('ontime_period_preset', 'custom'); saveCookie('ontime_period_from', from); saveCookie('ontime_period_to', value); setPage(1); }} /></label><label>{text.client}<select value={clientId} onChange={(event) => { const value = event.target.value; setClientId(value); setProjectId(''); saveCookie('ontime_client_filter', value); saveCookie('ontime_project_filter', ''); setPage(1); }}><option value="">{text.allClients}</option>{clients.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label><label>{text.project}<select disabled={!clientId} value={projectId} onChange={(event) => { setProjectId(event.target.value); saveCookie('ontime_project_filter', event.target.value); setPage(1); }}><option value="">{text.allProjects}</option>{projects.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label></div>
      {!projectId ? <p className="journal-hint">{text.selectProject}</p> : null}{notice ? <p className="success-message page-notice">{notice}</p> : null}{error ? <p className="error-message page-error">{error}</p> : null}
      <div className="journal-summary"><div><span>{text.items}</span><strong>{summary.itemCount}</strong></div><div><span>{text.hours}</span><strong>{formatDuration(Number(summary.totalMinutes))} <small>/ {formatDuration(possibleMinutes)}</small></strong></div>{!confidential ? <div><span>{text.value}</span><strong>${Number(summary.totalAmount).toLocaleString('en-CA', { minimumFractionDigits: 2 })}{possibleAmount !== null ? <small> / ${possibleAmount.toLocaleString('en-CA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</small> : null}</strong></div> : null}<label><input type="checkbox" checked={includeDeleted} onChange={(event) => { setIncludeDeleted(event.target.checked); setPage(1); }} />{text.deleted}</label></div>
      <div className="journal-actions"><button disabled={!selected.length || actionBusy} onClick={() => void action('/api/work-entries/toggle-billed', { ids: selected })}>{text.toggleBilled}</button><button disabled={!selected.length || actionBusy} className="danger" onClick={() => { const hasBilled = entries.some((entry) => selected.includes(entry.id) && entry.isBilled); const message = `${hasBilled ? `${text.warning}\n\n` : ''}${text.confirmDelete}`; if (confirm(message)) void action('/api/work-entries/toggle-deleted', { ids: selected }); }}>{text.toggleDeleted}</button></div>
      {loadingEntries ? <p className="journal-loading"><span className="loading-ring" />{language === 'fr' ? 'Chargement…' : 'Loading…'}</p> : null}
      <div className="journal-table-wrap"><table className="journal-table"><thead><tr><th><input type="checkbox" checked={entries.length > 0 && selected.length === entries.length} onChange={(event) => setSelected(event.target.checked ? entries.map((item) => item.id) : [])} /></th>{columns === 'both' ? <th onClick={() => sort('client')}>{text.client}</th> : null}{columns !== 'none' ? <th onClick={() => sort('project')}>{text.project}</th> : null}<th onClick={() => sort('workDate')}>{text.date}</th><th>{text.description}</th><th onClick={() => sort('duration')}>{text.hours}</th>{!confidential ? <><th onClick={() => sort('hourlyRate')}>{text.rate}</th><th onClick={() => sort('amount')}>{text.value}</th></> : null}<th onClick={() => sort('isBilled')}>{text.billed}</th><th /></tr></thead><tbody>{entries.map((entry) => <tr key={entry.id} className={entry.isDeleted ? 'deleted-entry' : ''}><td><input type="checkbox" checked={selected.includes(entry.id)} onChange={(event) => setSelected((current) => event.target.checked ? [...current, entry.id] : current.filter((id) => id !== entry.id))} /></td>{columns === 'both' ? <td>{entry.clientName}</td> : null}{columns !== 'none' ? <td>{entry.projectName}</td> : null}<td>{formatDate(entry.workDate)}</td><td className="description-cell"><DescriptionPreview description={entry.description} /></td><td>{formatDuration(entry.durationMinutes)}</td>{!confidential ? <><td>${Number(entry.hourlyRate).toFixed(2)}</td><td>${Number(entry.amount).toFixed(2)}</td></> : null}<td><input type="checkbox" checked={entry.isBilled} disabled={actionBusy} title={text.toggleBilled} aria-label={`${text.toggleBilled}: ${formatDate(entry.workDate)}`} onChange={() => void action('/api/work-entries/toggle-billed', { ids: [entry.id] })} /></td><td className="row-actions"><button title={text.edit} onClick={() => openEdit(entry)}>✎</button><button title={text.duplicate} onClick={() => void action(`/api/work-entries/${entry.id}/duplicate`, { nextWorkday: false })}>⧉</button><button title={text.next} onClick={() => void action(`/api/work-entries/${entry.id}/duplicate`, { nextWorkday: true })}>⧉+1</button></td></tr>)}{!entries.length ? <tr><td colSpan={12} className="empty-table">{text.empty}</td></tr> : null}</tbody></table></div>
      <div className="journal-pagination"><label>{text.items}<select value={pageSize} onChange={(event) => { const value = Number(event.target.value); setPageSize(value); setPage(1); document.cookie = `ontime_page_size=${value}; Max-Age=31536000; Path=/; SameSite=Lax`; }}>{[10, 25, 50, 100].map((value) => <option key={value}>{value}</option>)}</select></label><button disabled={page <= 1} onClick={() => setPage((current) => current - 1)}>{text.previous}</button><span>{text.page} {page} / {pageCount}</span><button disabled={page >= pageCount} onClick={() => setPage((current) => current + 1)}>{text.following}</button></div>
    </section>
    {formOpen ? <div className="modal-backdrop"><section className="client-modal entry-modal"><div className="modal-heading"><h2>{editing ? text.editEntry : text.newEntry}</h2><button className="close-button" onClick={() => setFormOpen(false)}>×</button></div><form onSubmit={save}><label>{text.date}<input type="date" value={workDate} onChange={(event) => setWorkDate(event.target.value)} required /></label><label>{text.duration}<input value={time} onChange={(event) => setTime(event.target.value)} placeholder="08:00" required /></label><label>{text.description}<textarea value={description} onChange={(event) => setDescription(event.target.value)} rows={10} required /></label>{error ? <p className="error-message">{error}</p> : null}<div className="modal-actions"><button type="button" className="secondary-button" onClick={() => setFormOpen(false)}>{text.back}</button><button className="primary-button">{text.save}</button></div></form></section></div> : null}
    {importOpen ? <div className="modal-backdrop"><section className="client-modal import-modal"><div className="modal-heading"><h2>{text.import}</h2><button className="close-button" disabled={importBusy} onClick={() => setImportOpen(false)}>×</button></div><p className="import-warning">{language === 'fr' ? 'Cet outil remplacera tous vos clients, projets et entrées actuels. Votre compte et les données des autres utilisateurs ne seront pas modifiés.' : 'This tool will replace all your current clients, projects and entries. Your account and other users’ data will not be changed.'}</p><label className="import-file">{language === 'fr' ? 'Fichier Excel (.xlsx)' : 'Excel file (.xlsx)'}<input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" disabled={importBusy} onChange={(event) => { setImportFile(event.target.files?.[0] ?? null); setImportAnalysis(null); setImportConfirmation(''); setImportError(''); }} /></label><button className="secondary-button" disabled={!importFile || importBusy} onClick={() => void analyzeImport()}>{importBusy && !importAnalysis ? (language === 'fr' ? 'Analyse…' : 'Analyzing…') : (language === 'fr' ? 'Analyser le fichier' : 'Analyze file')}</button>{importAnalysis ? <><div className="import-summary"><div><span>{language === 'fr' ? 'Clients' : 'Clients'}</span><strong>{importAnalysis.clients}</strong></div><div><span>{language === 'fr' ? 'Projets' : 'Projects'}</span><strong>{importAnalysis.projects}</strong></div><div><span>{text.items}</span><strong>{importAnalysis.entries}</strong></div><div><span>{text.hours}</span><strong>{formatDuration(importAnalysis.totalMinutes)}</strong></div><div><span>{language === 'fr' ? 'Période' : 'Period'}</span><strong>{formatDate(importAnalysis.firstDate)} – {formatDate(importAnalysis.lastDate)}</strong></div><div><span>{text.value}</span><strong>${Number(importAnalysis.totalAmount).toLocaleString('en-CA', { minimumFractionDigits: 2 })}</strong></div></div><p className="import-details">{language === 'fr' ? `${importAnalysis.billed} facturées · ${importAnalysis.zeroMinuteEntries} à durée zéro · ${importAnalysis.negativeRateEntries} à taux négatif · toutes les données importées seront actives et non supprimées.` : `${importAnalysis.billed} billed · ${importAnalysis.zeroMinuteEntries} with zero duration · ${importAnalysis.negativeRateEntries} with negative rates · all imported data will be active and not deleted.`}</p><label className="import-confirmation">{language === 'fr' ? 'Pour confirmer le remplacement, écrivez REMPLACER' : 'To confirm replacement, type REMPLACER'}<input value={importConfirmation} disabled={importBusy} onChange={(event) => setImportConfirmation(event.target.value)} autoComplete="off" /></label></> : null}{importError ? <p className="error-message">{importError}</p> : null}<div className="modal-actions"><button className="secondary-button" disabled={importBusy} onClick={() => setImportOpen(false)}>{text.back}</button><button className="primary-button danger-import" disabled={!importAnalysis || importConfirmation !== 'REMPLACER' || importBusy} onClick={() => void executeImport()}>{importBusy && importAnalysis ? (language === 'fr' ? 'Importation…' : 'Importing…') : (language === 'fr' ? 'Remplacer mes données' : 'Replace my data')}</button></div></section></div> : null}
  </main>;
}
