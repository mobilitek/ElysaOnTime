import { useEffect, useState } from 'react';

type Language = 'fr' | 'en';
type AuditEvent = {
  id: string;
  actorFirstName: string;
  actorLastName: string;
  actorEmail: string;
  action: string;
  category: string;
  requestId: string;
  metadata: Record<string, string | number | boolean | null>;
  createdAt: string;
};
type TechnicalLog = {
  timestamp: string;
  requestId: string;
  level: 'info' | 'warning' | 'error';
  method: string;
  path: string;
  status: number;
  durationMs: number;
  error?: string;
  errorCode?: string;
  userId?: string | null;
  activity?: AuditEvent | null;
};

const labels: Record<string, { fr: string; en: string }> = {
  'journal.created': { fr: 'Entrée créée', en: 'Entry created' },
  'journal.updated': { fr: 'Entrée modifiée', en: 'Entry updated' },
  'journal.duplicated': { fr: 'Entrée copiée', en: 'Entry duplicated' },
  'journal.billing_changed': { fr: 'Facturation modifiée', en: 'Billing changed' },
  'journal.deletion_changed': { fr: 'Suppression ou restauration modifiée', en: 'Deletion or restoration changed' },
  'client.created': { fr: 'Client créé', en: 'Client created' },
  'client.updated': { fr: 'Client modifié', en: 'Client updated' },
  'project.created': { fr: 'Projet créé', en: 'Project created' },
  'project.updated': { fr: 'Projet modifié', en: 'Project updated' },
  'account.updated': { fr: 'Profil modifié', en: 'Profile updated' },
  'account.created': { fr: 'Action sur le compte', en: 'Account action' },
  'account.logged_in': { fr: 'Connexion réussie', en: 'Signed in' },
  'account.logged_out': { fr: 'Déconnexion', en: 'Signed out' },
  'account.password_changed': { fr: 'Mot de passe modifié', en: 'Password changed' },
  'account.registered': { fr: 'Compte créé', en: 'Account created' },
  'data.created': { fr: 'Sauvegarde ou restauration effectuée', en: 'Backup or restore performed' },
  'data.backup_downloaded': { fr: 'Sauvegarde téléchargée', en: 'Backup downloaded' },
  'data.backup_analyzed': { fr: 'Sauvegarde analysée', en: 'Backup analyzed' },
  'data.restored': { fr: 'Données restaurées', en: 'Data restored' },
  'journal.exported': { fr: 'Journal exporté', en: 'Work log exported' },
  'administration.created': { fr: 'Action administrative effectuée', en: 'Administrative action performed' },
  'administration.updated': { fr: 'Administration modifiée', en: 'Administration updated' },
};
const fieldLabels: Record<string, { fr: string; en: string }> = {
  client: { fr: 'Client', en: 'Client' },
  project: { fr: 'Projet', en: 'Project' },
  workedMinutes: { fr: 'Heures travaillées', en: 'Worked hours' },
  billableMinutes: { fr: 'Heures facturables', en: 'Billable hours' },
  hourlyRate: { fr: 'Taux horaire', en: 'Hourly rate' },
  amount: { fr: 'Montant', en: 'Amount' },
  billed: { fr: 'Facturé', en: 'Billed' },
  deleted: { fr: 'Supprimé', en: 'Deleted' },
  name: { fr: 'Nom', en: 'Name' },
  active: { fr: 'Actif', en: 'Active' },
  hourBankEnabled: { fr: 'Banque d’heures', en: 'Hour bank' },
  hourBankStartDate: { fr: 'Début de la banque', en: 'Hour-bank start' },
  hourBankInitialMinutes: { fr: 'Solde initial', en: 'Opening balance' },
  maxDailyBillableMinutes: { fr: 'Maximum quotidien', en: 'Daily maximum' },
  maxWeeklyBillableMinutes: { fr: 'Maximum hebdomadaire', en: 'Weekly maximum' },
  firstName: { fr: 'Prénom', en: 'First name' },
  lastName: { fr: 'Nom', en: 'Last name' },
  email: { fr: 'Courriel', en: 'Email' },
  states: { fr: 'États des entrées', en: 'Entry states' },
  durationMinutes: { fr: 'Heures travaillées', en: 'Worked hours' },
  clientMinutes: { fr: 'Heures facturables', en: 'Billable hours' },
  workDate: { fr: 'Date', en: 'Date' },
  accountStatus: { fr: 'Statut du compte', en: 'Account status' },
  isAdmin: { fr: 'Administrateur', en: 'Administrator' },
  subscriptionStartedOn: { fr: 'Début de souscription', en: 'Subscription start' },
  subscriptionEndsOn: { fr: 'Fin de souscription', en: 'Subscription end' },
  weekStart: { fr: 'Début de semaine', en: 'Week start' },
  from: { fr: 'Du', en: 'From' },
  to: { fr: 'Au', en: 'To' },
  entries: { fr: 'Entrées', en: 'Entries' },
  clients: { fr: 'Clients', en: 'Clients' },
  projects: { fr: 'Projets', en: 'Projects' },
  contentChanged: { fr: 'Contenu modifié', en: 'Content changed' },
  contentLines: { fr: 'Nombre de lignes', en: 'Line count' },
};

const minuteFields = new Set([
  'workedMinutes', 'billableMinutes', 'hourBankInitialMinutes',
  'maxDailyBillableMinutes', 'maxWeeklyBillableMinutes', 'durationMinutes', 'clientMinutes',
]);
const initialConfidentialMode = () => {
  const saved = document.cookie.split('; ')
    .find((value) => value.startsWith('ontime_confidential='))
    ?.split('=')[1];
  if (saved === 'false') return false;
  if (saved === 'true') return true;
  document.cookie = 'ontime_confidential=true; Max-Age=31536000; Path=/; SameSite=Lax';
  return true;
};
export const auditDetailValue = (
  field: string,
  value: string | number | boolean | null,
  language: Language,
  confidential: boolean,
) => {
  if (confidential && (field === 'hourlyRate' || field === 'amount')) return '••••';
  if (value === null || value === '') return '—';
  if (typeof value === 'boolean') {
    return value
      ? (language === 'fr' ? 'Oui' : 'Yes')
      : (language === 'fr' ? 'Non' : 'No');
  }
  if (minuteFields.has(field) && typeof value === 'number') {
    const sign = value < 0 ? '-' : '';
    const absolute = Math.abs(value);
    return `${sign}${String(Math.floor(absolute / 60)).padStart(2, '0')}:${String(absolute % 60).padStart(2, '0')}`;
  }
  if ((field === 'workDate' || field.endsWith('On')) && typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA', {
      year: 'numeric', month: 'short', day: 'numeric',
    }).format(new Date(`${value}T12:00:00`));
  }
  if (field === 'hourlyRate' || field === 'amount') return `${Number(value).toFixed(2)} $`;
  return String(value);
};

const changesFor = (event: AuditEvent) => Object.entries(event.metadata)
  .filter(([key]) => key.startsWith('before_'))
  .map(([key, before]) => {
    const field = key.slice('before_'.length);
    return { field, before, after: event.metadata[`after_${field}`] ?? null };
  });
const detailsFor = (event: AuditEvent) => Object.entries(event.metadata)
  .filter(([key]) => !key.startsWith('before_') && !key.startsWith('after_'))
  .filter(([key]) => key !== 'projectId' && key !== 'clientId')
  .slice(0, 12)
  .map(([field, value]) => ({ field, value }));
const metadataValue = (event: AuditEvent, field: string) =>
  event.metadata[`after_${field}`] ?? event.metadata[field] ?? event.metadata[`before_${field}`] ?? null;
export const auditEventContext = (event: AuditEvent, language: Language) => {
  const client = metadataValue(event, 'client');
  const project = metadataValue(event, 'project') ?? metadataValue(event, 'name');
  const workDate = metadataValue(event, 'workDate');
  const email = metadataValue(event, 'email');
  const parts: string[] = [];
  if (event.category === 'journal') {
    if (workDate) {
      const value = new Date(`${String(workDate).slice(0, 10)}T12:00:00`);
      parts.push(new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA', {
        day: 'numeric', month: 'short', year: 'numeric',
      }).format(value));
    }
    if (client) parts.push(String(client));
    if (project) parts.push(String(project));
  } else if (event.category === 'project') {
    if (client) parts.push(String(client));
    if (project) parts.push(String(project));
  } else if (event.category === 'client') {
    if (metadataValue(event, 'name')) parts.push(String(metadataValue(event, 'name')));
  } else if (event.category === 'account' || event.category === 'administration') {
    if (email) parts.push(String(email));
  }
  return parts.filter((value, index) => parts.indexOf(value) === index).join(' · ');
};

const formatDateTime = (value: string, language: Language) =>
  new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA', {
    dateStyle: 'medium',
    timeStyle: 'medium',
  }).format(new Date(value));
const formatDay = (value: string, language: Language) =>
  new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(new Date(value));
const formatTime = (value: string, language: Language) =>
  new Intl.DateTimeFormat(language === 'fr' ? 'fr-CA' : 'en-CA', {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).format(new Date(value));

function PaginationControls(props: {
  page: number;
  pageCount: number;
  total: number;
  pageSize: number;
  resultLabel: string;
  text: { previous: string; next: string; page: string; of: string; perPage: string };
  onPageChange: (page: number) => void;
  onPageSizeChange?: (pageSize: number) => void;
}) {
  const { page, pageCount, total, pageSize, resultLabel, text, onPageChange, onPageSizeChange } = props;
  return <nav className="activity-pagination" aria-label={`${text.page} ${page}`}>
    <span>{total} {resultLabel}</span>
    <div>
      {onPageSizeChange ? <label>{text.perPage}<select value={pageSize} onChange={(event) => onPageSizeChange(Number(event.target.value))}>
        {[5, 10, 20, 50].map((value) => <option key={value} value={value}>{value}</option>)}
      </select></label> : null}
      <button type="button" disabled={page <= 1} onClick={() => onPageChange(Math.max(1, page - 1))}>{text.previous}</button>
      <strong>{text.page} {page} {text.of} {pageCount}</strong>
      <button type="button" disabled={page >= pageCount} onClick={() => onPageChange(Math.min(pageCount, page + 1))}>{text.next}</button>
    </div>
  </nav>;
}

export function ActivityPanel({ language, admin = false }: {
  language: Language;
  admin?: boolean;
}) {
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [technical, setTechnical] = useState<TechnicalLog[]>([]);
  const [technicalLevel, setTechnicalLevel] = useState('');
  const [technicalStatus, setTechnicalStatus] = useState('');
  const [technicalPath, setTechnicalPath] = useState('');
  const [technicalUser, setTechnicalUser] = useState('');
  const [technicalRequest, setTechnicalRequest] = useState('');
  const [technicalPage, setTechnicalPage] = useState(1);
  const [technicalPageCount, setTechnicalPageCount] = useState(1);
  const [technicalTotal, setTechnicalTotal] = useState(0);
  const [technicalPageSize, setTechnicalPageSize] = useState(10);
  const [selectedTechnical, setSelectedTechnical] = useState<TechnicalLog | null>(null);
  const [tab, setTab] = useState<'activity' | 'technical'>('activity');
  const [category, setCategory] = useState('');
  const [activityPage, setActivityPage] = useState(1);
  const [activityPageCount, setActivityPageCount] = useState(1);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityPageSize, setActivityPageSize] = useState(10);
  const [error, setError] = useState('');
  const [confidential, setConfidential] = useState(initialConfidentialMode);

  useEffect(() => {
    if (tab === 'technical' && admin) {
      const params = new URLSearchParams({ page: String(technicalPage), pageSize: String(technicalPageSize) });
      if (technicalLevel) params.set('level', technicalLevel);
      if (technicalStatus) params.set('status', technicalStatus);
      if (technicalPath) params.set('path', technicalPath);
      if (/^[0-9a-f-]{36}$/.test(technicalUser)) params.set('userId', technicalUser);
      if (/^[0-9a-f-]{36}$/.test(technicalRequest)) params.set('requestId', technicalRequest);
      void fetch(`/api/audit/technical?${params}`, { credentials: 'include' })
        .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
        .then((payload: { logs: TechnicalLog[]; total: number; pageCount: number }) => {
          setTechnical(payload.logs);
          setTechnicalTotal(payload.total);
          setTechnicalPageCount(payload.pageCount);
          setError('');
        })
        .catch((reason: Error) => setError(reason.message));
      return;
    }
    const params = new URLSearchParams({ page: String(activityPage), pageSize: String(activityPageSize) });
    if (category) params.set('category', category);
    void fetch(`/api/audit/${admin ? 'admin' : 'mine'}?${params}`, { credentials: 'include' })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error(`HTTP ${response.status}`)))
      .then((payload: { events: AuditEvent[]; total: number; pageCount: number }) => {
        setEvents(payload.events);
        setActivityTotal(payload.total);
        setActivityPageCount(payload.pageCount);
        setError('');
      })
      .catch((reason: Error) => setError(reason.message));
  }, [activityPage, activityPageSize, admin, category, tab, technicalLevel, technicalPage, technicalPageSize, technicalPath, technicalRequest, technicalStatus, technicalUser]);

  const text = language === 'fr'
    ? {
      title: admin ? 'Journaux' : 'Activité récente',
      subtitle: admin ? 'Actions des utilisateurs et diagnostic technique.' : 'Historique des opérations effectuées sur votre compte.',
      activity: 'Activité',
      technical: 'Technique',
      all: 'Toutes les catégories',
      empty: 'Aucune activité enregistrée.',
      error: 'Impossible de charger le journal.',
      request: 'Requête',
      confidential: 'Confidentiel',
      route: 'Filtrer par route',
      status: 'Statut HTTP',
      allLevels: 'Tous les niveaux',
      details: 'Détails techniques',
      activities: 'activités',
      activityCount: 'activité',
      showDetails: 'Afficher les détails',
      previous: 'Précédente',
      next: 'Suivante',
      page: 'Page',
      of: 'sur',
      results: 'activités',
      technicalResults: 'journaux techniques',
      perPage: 'Par page',
      viewTechnical: 'Voir la requête technique',
      linkedActivity: 'Activité associée',
      noLinkedActivity: 'Aucune activité métier associée à cette requête.',
      technicalRequest: 'Requête',
      technicalRoute: 'Route',
      technicalStatus: 'Statut',
      technicalDuration: 'Durée',
      technicalUser: 'Utilisateur',
      technicalErrorCode: 'Code d’erreur',
      technicalError: 'Erreur',
      technicalDate: 'Date',
      userId: 'ID utilisateur',
      requestId: 'ID de requête',
    }
    : {
      title: admin ? 'Logs' : 'Recent activity',
      subtitle: admin ? 'User activity and technical diagnostics.' : 'History of operations performed on your account.',
      activity: 'Activity',
      technical: 'Technical',
      all: 'All categories',
      empty: 'No activity recorded.',
      error: 'Unable to load the log.',
      request: 'Request',
      confidential: 'Confidential',
      route: 'Filter by route',
      status: 'HTTP status',
      allLevels: 'All levels',
      details: 'Technical details',
      activities: 'activities',
      activityCount: 'activity',
      showDetails: 'Show details',
      previous: 'Previous',
      next: 'Next',
      page: 'Page',
      of: 'of',
      results: 'activities',
      technicalResults: 'technical logs',
      perPage: 'Per page',
      viewTechnical: 'View technical request',
      linkedActivity: 'Associated activity',
      noLinkedActivity: 'No business activity is associated with this request.',
      technicalRequest: 'Request',
      technicalRoute: 'Route',
      technicalStatus: 'Status',
      technicalDuration: 'Duration',
      technicalUser: 'User',
      technicalErrorCode: 'Error code',
      technicalError: 'Error',
      technicalDate: 'Date',
      userId: 'User ID',
      requestId: 'Request ID',
    };
  const groupedEvents = events.reduce<Array<{ day: string; events: AuditEvent[] }>>(
    (groups, event) => {
      const day = formatDay(event.createdAt, language);
      const current = groups.at(-1);
      if (current?.day === day) current.events.push(event);
      else groups.push({ day, events: [event] });
      return groups;
    },
    [],
  );

  return <section className="profile-card activity-panel">
    <div className="activity-heading"><div><h2>{text.title}</h2><p>{text.subtitle}</p></div>
      <div className="activity-heading-controls"><label className="confidential-switch"><input type="checkbox" checked={confidential} onChange={(event) => { setConfidential(event.target.checked); document.cookie = `ontime_confidential=${event.target.checked}; Max-Age=31536000; Path=/; SameSite=Lax`; }} />{text.confidential}</label>
        {admin ? <div className="activity-tabs"><button className={tab === 'activity' ? 'active' : ''} onClick={() => setTab('activity')}>{text.activity}</button><button className={tab === 'technical' ? 'active' : ''} onClick={() => setTab('technical')}>{text.technical}</button></div> : null}
      </div>
    </div>
    {tab === 'activity' ? <>
      <select className="activity-filter" value={category} onChange={(event) => { setCategory(event.target.value); setActivityPage(1); }}>
        <option value="">{text.all}</option>
        {['journal', 'client', 'project', 'account', 'data', 'administration'].map((value) => <option key={value} value={value}>{value}</option>)}
      </select>
      {activityTotal > 0 ? <PaginationControls
        page={activityPage} pageCount={activityPageCount} total={activityTotal}
        pageSize={activityPageSize} resultLabel={text.results} text={text}
        onPageChange={setActivityPage}
        onPageSizeChange={(value) => { setActivityPageSize(value); setActivityPage(1); }}
      /> : null}
      <div className="activity-list">{groupedEvents.map((group, groupIndex) => <details className="activity-day-group" key={group.day} open={groupIndex === 0}>
        <summary><strong>{group.day}</strong><span>{group.events.length} {group.events.length === 1 ? text.activityCount : text.activities}</span></summary>
        <div>{group.events.map((event) => {
          const changes = changesFor(event);
          const details = detailsFor(event);
          const context = auditEventContext(event, language);
          return <details className={`activity-event activity-${event.category}`} key={event.id}>
            <summary>
              <span className="activity-category-mark" aria-hidden="true" />
              <time>{formatTime(event.createdAt, language)}</time>
              <span className="activity-event-main"><strong>{labels[event.action]?.[language] ?? event.action}</strong>{context ? <small>{context}</small> : admin ? <small>{event.actorFirstName} {event.actorLastName} · {event.actorEmail}</small> : null}</span>
              <span className="activity-expand-label">{text.showDetails}</span>
            </summary>
            <div className="activity-summary">
              {changes.length ? <dl className="activity-changes">{changes.map((change) => <div key={change.field}><dt>{fieldLabels[change.field]?.[language] ?? change.field}</dt><dd><span>{auditDetailValue(change.field, change.before, language, confidential)}</span><b>→</b><strong>{auditDetailValue(change.field, change.after, language, confidential)}</strong></dd></div>)}</dl> : null}
              {!changes.length && details.length ? <dl className="activity-changes">{details.map((detail) => <div key={detail.field}><dt>{fieldLabels[detail.field]?.[language] ?? detail.field}</dt><dd><strong>{auditDetailValue(detail.field, detail.value, language, confidential)}</strong></dd></div>)}</dl> : null}
              <footer className="activity-request"><small>{admin ? `${event.actorFirstName} ${event.actorLastName} · ` : ''}{text.request} {event.requestId.slice(0, 8)}</small>
                {admin ? <button type="button" onClick={() => {
                  setTechnicalRequest(event.requestId);
                  setTechnicalPage(1);
                  setTab('technical');
                }}>{text.viewTechnical}</button> : null}
              </footer>
            </div>
          </details>;
        })}</div>
      </details>)}{!events.length && !error ? <p>{text.empty}</p> : null}</div>
      {activityTotal > 0 ? <PaginationControls
        page={activityPage} pageCount={activityPageCount} total={activityTotal}
        pageSize={activityPageSize} resultLabel={text.results} text={text}
        onPageChange={setActivityPage}
        onPageSizeChange={(value) => { setActivityPageSize(value); setActivityPage(1); }}
      /> : null}
    </> : <><div className="technical-filters"><select value={technicalLevel} onChange={(event) => { setTechnicalLevel(event.target.value); setTechnicalPage(1); }}><option value="">{text.allLevels}</option><option value="info">Info</option><option value="warning">Warning</option><option value="error">Error</option></select><input placeholder={text.status} inputMode="numeric" value={technicalStatus} onChange={(event) => { setTechnicalStatus(event.target.value.replace(/\D/g, '').slice(0, 3)); setTechnicalPage(1); }} /><input placeholder={text.route} value={technicalPath} onChange={(event) => { setTechnicalPath(event.target.value); setTechnicalPage(1); }} /><input placeholder={text.userId} value={technicalUser} onChange={(event) => { setTechnicalUser(event.target.value.trim()); setTechnicalPage(1); }} /><input placeholder={text.requestId} value={technicalRequest} onChange={(event) => { setTechnicalRequest(event.target.value.trim()); setTechnicalPage(1); }} /></div>{technicalTotal > 0 ? <PaginationControls
      page={technicalPage} pageCount={technicalPageCount} total={technicalTotal}
      pageSize={technicalPageSize} resultLabel={text.technicalResults} text={text}
      onPageChange={setTechnicalPage}
      onPageSizeChange={(value) => { setTechnicalPageSize(value); setTechnicalPage(1); }}
    /> : null}<div className="technical-log-list">{technical.map((log) => <button type="button" onClick={() => setSelectedTechnical(log)} className={log.level === 'error' ? 'technical-error' : log.level === 'warning' ? 'technical-warning' : ''} key={`${log.requestId}-${log.timestamp}`}>
      <code>{log.method} {log.path}</code><strong>{log.status}</strong><span>{log.durationMs} ms</span><small>{formatDateTime(log.timestamp, language)} · {log.requestId}{log.errorCode ? ` · ${log.errorCode}` : ''}</small>
    </button>)}</div>{technicalTotal > 0 ? <PaginationControls
      page={technicalPage} pageCount={technicalPageCount} total={technicalTotal}
      pageSize={technicalPageSize} resultLabel={text.technicalResults} text={text}
      onPageChange={setTechnicalPage}
      onPageSizeChange={(value) => { setTechnicalPageSize(value); setTechnicalPage(1); }}
    /> : null}</>}
    {error ? <p className="error-message">{text.error} <small>({error})</small></p> : null}
    {selectedTechnical ? <div className="modal-backdrop"><section className="client-modal technical-detail-modal"><div className="modal-heading"><h2>{text.details}</h2><button className="close-button" onClick={() => setSelectedTechnical(null)}>×</button></div><dl className="technical-overview"><div className="technical-wide"><dt>{text.technicalRequest}</dt><dd><code>{selectedTechnical.requestId}</code></dd></div><div className="technical-wide"><dt>{text.technicalRoute}</dt><dd><code>{selectedTechnical.method} {selectedTechnical.path}</code></dd></div><div><dt>{text.technicalStatus}</dt><dd>{selectedTechnical.status} · {selectedTechnical.level}</dd></div><div><dt>{text.technicalDuration}</dt><dd>{selectedTechnical.durationMs} ms</dd></div><div className="technical-wide"><dt>{text.technicalUser}</dt><dd><code>{selectedTechnical.userId ?? '—'}</code></dd></div><div><dt>{text.technicalErrorCode}</dt><dd><code>{selectedTechnical.errorCode ?? '—'}</code></dd></div><div><dt>{text.technicalError}</dt><dd><code>{selectedTechnical.error ?? '—'}</code></dd></div><div className="technical-wide"><dt>{text.technicalDate}</dt><dd>{formatDateTime(selectedTechnical.timestamp, language)}</dd></div></dl>
      <section className="technical-linked-activity"><h3>{text.linkedActivity}</h3>
        {selectedTechnical.activity ? <>
          <div className="technical-linked-heading"><strong>{labels[selectedTechnical.activity.action]?.[language] ?? selectedTechnical.activity.action}</strong><span>{selectedTechnical.activity.actorFirstName} {selectedTechnical.activity.actorLastName} · {selectedTechnical.activity.actorEmail}</span>{auditEventContext(selectedTechnical.activity, language) ? <small>{auditEventContext(selectedTechnical.activity, language)}</small> : null}</div>
          {changesFor(selectedTechnical.activity).length ? <dl className="activity-changes">{changesFor(selectedTechnical.activity).map((change) => <div key={change.field}><dt>{fieldLabels[change.field]?.[language] ?? change.field}</dt><dd><span>{auditDetailValue(change.field, change.before, language, confidential)}</span><b>→</b><strong>{auditDetailValue(change.field, change.after, language, confidential)}</strong></dd></div>)}</dl> : detailsFor(selectedTechnical.activity).length ? <dl className="activity-changes">{detailsFor(selectedTechnical.activity).map((detail) => <div key={detail.field}><dt>{fieldLabels[detail.field]?.[language] ?? detail.field}</dt><dd><strong>{auditDetailValue(detail.field, detail.value, language, confidential)}</strong></dd></div>)}</dl> : null}
        </> : <p>{text.noLinkedActivity}</p>}
      </section>
    </section></div> : null}
  </section>;
}
