import { useState } from 'react';

type Language = 'fr' | 'en';
type BackupAnalysis = {
  digest: string;
  clients: number;
  projects: number;
  entries: number;
  billed: number;
  deleted: number;
  totalMinutes: number;
  totalAmount: string;
  firstDate: string | null;
  lastDate: string | null;
};

const formatDuration = (minutes: number) =>
  `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
const formatDate = (value: string) => {
  const [year, month, day] = value.split('-');
  return `${day}/${month}/${year}`;
};

export function BackupProfileCard({ language }: { language: Language }) {
  const fr = language === 'fr';
  const [backupBusy, setBackupBusy] = useState(false);
  const [restoreOpen, setRestoreOpen] = useState(false);
  const [restoreFile, setRestoreFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<BackupAnalysis | null>(null);
  const [confirmation, setConfirmation] = useState('');
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const downloadBackup = async () => {
    if (backupBusy) return;
    setBackupBusy(true); setError(''); setNotice('');
    try {
      const response = await fetch('/api/backup/download', { credentials: 'include' });
      if (!response.ok) { setError(fr ? 'La sauvegarde a échoué.' : 'Backup failed.'); return; }
      const blob = await response.blob();
      const disposition = response.headers.get('content-disposition') ?? '';
      const name = disposition.match(/filename="([^"]+)"/)?.[1] ?? 'OnTime-backup.json';
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = name;
      link.click();
      URL.revokeObjectURL(link.href);
      setNotice(fr ? 'Sauvegarde téléchargée.' : 'Backup downloaded.');
    } catch {
      setError(fr ? 'La sauvegarde a échoué.' : 'Backup failed.');
    } finally {
      setBackupBusy(false);
    }
  };

  const openRestore = () => {
    setRestoreFile(null); setAnalysis(null); setConfirmation('');
    setError(''); setNotice(''); setRestoreOpen(true);
  };

  const analyzeRestore = async () => {
    if (!restoreFile || restoreBusy) return;
    setRestoreBusy(true); setError(''); setAnalysis(null);
    try {
      const body = new FormData();
      body.set('file', restoreFile);
      const response = await fetch('/api/backup/analyze', {
        method: 'POST', credentials: 'include', body,
      });
      const payload = await response.json() as { analysis?: BackupAnalysis; detail?: string };
      if (!response.ok || !payload.analysis) {
        setError(payload.detail ?? (fr ? 'La sauvegarde est invalide.' : 'The backup is invalid.'));
        return;
      }
      setAnalysis(payload.analysis);
    } catch {
      setError(fr ? 'La sauvegarde est invalide.' : 'The backup is invalid.');
    } finally {
      setRestoreBusy(false);
    }
  };

  const executeRestore = async () => {
    if (!restoreFile || !analysis || confirmation !== 'RESTAURER' || restoreBusy) return;
    setRestoreBusy(true); setError('');
    try {
      const body = new FormData();
      body.set('file', restoreFile);
      body.set('digest', analysis.digest);
      body.set('confirmation', confirmation);
      const response = await fetch('/api/backup/restore', {
        method: 'POST', credentials: 'include', body,
      });
      const payload = await response.json() as { detail?: string };
      if (!response.ok) {
        setError(payload.detail ?? (fr ? 'La restauration a échoué.' : 'Restore failed.'));
        return;
      }
      document.cookie = 'ontime_client_filter=; Max-Age=0; Path=/; SameSite=Lax';
      document.cookie = 'ontime_project_filter=; Max-Age=0; Path=/; SameSite=Lax';
      document.cookie = 'ontime_entry_client=; Max-Age=0; Path=/; SameSite=Lax';
      document.cookie = 'ontime_entry_project=; Max-Age=0; Path=/; SameSite=Lax';
      setRestoreOpen(false);
      setRestoreFile(null); setAnalysis(null); setConfirmation('');
      setNotice(fr ? 'Restauration terminée avec succès.' : 'Restore completed successfully.');
    } catch {
      setError(fr ? 'La restauration a échoué.' : 'Restore failed.');
    } finally {
      setRestoreBusy(false);
    }
  };

  return <>
    <section className="profile-card backup-profile-card">
      <div className="backup-profile-heading">
        <div>
          <p className="eyebrow">{fr ? 'DONNÉES' : 'DATA'}</p>
          <h2>{fr ? 'Sauvegarde et restauration' : 'Backup and restore'}</h2>
          <p>{fr
            ? 'Téléchargez une copie complète de vos données ou restaurez une sauvegarde OnTime.'
            : 'Download a complete copy of your data or restore an OnTime backup.'}</p>
        </div>
        <div className="backup-profile-actions">
          <button className="secondary-button" disabled={backupBusy} onClick={() => void downloadBackup()}>
            {backupBusy ? (fr ? 'Sauvegarde…' : 'Backing up…') : (fr ? 'Sauvegarder' : 'Backup')}
          </button>
          <button className="secondary-button" onClick={openRestore}>
            {fr ? 'Restaurer' : 'Restore'}
          </button>
        </div>
      </div>
      {notice ? <p className="success-message">{notice}</p> : null}
      {error && !restoreOpen ? <p className="error-message">{error}</p> : null}
    </section>

    {restoreOpen ? <div className="modal-backdrop"><section className="client-modal import-modal">
      <div className="modal-heading">
        <h2>{fr ? 'Restaurer' : 'Restore'}</h2>
        <button className="close-button" disabled={restoreBusy} onClick={() => setRestoreOpen(false)}>×</button>
      </div>
      <p className="import-warning">{fr
        ? 'La restauration remplacera tous vos clients, projets et entrées actuels. Votre compte et les données des autres utilisateurs ne seront pas modifiés.'
        : 'Restore will replace all your current clients, projects and entries. Your account and other users’ data will not be changed.'}</p>
      <label className="import-file">
        {fr ? 'Sauvegarde OnTime (.json)' : 'OnTime backup (.json)'}
        <input type="file" accept=".json,application/json" disabled={restoreBusy} onChange={(event) => {
          setRestoreFile(event.target.files?.[0] ?? null);
          setAnalysis(null); setConfirmation(''); setError('');
        }} />
      </label>
      <button className="secondary-button" disabled={!restoreFile || restoreBusy} onClick={() => void analyzeRestore()}>
        {restoreBusy && !analysis ? (fr ? 'Analyse…' : 'Analyzing…') : (fr ? 'Analyser la sauvegarde' : 'Analyze backup')}
      </button>
      {analysis ? <>
        <div className="import-summary">
          <div><span>Clients</span><strong>{analysis.clients}</strong></div>
          <div><span>{fr ? 'Projets' : 'Projects'}</span><strong>{analysis.projects}</strong></div>
          <div><span>{fr ? 'Entrées' : 'Entries'}</span><strong>{analysis.entries}</strong></div>
          <div><span>{fr ? 'Heures' : 'Hours'}</span><strong>{formatDuration(analysis.totalMinutes)}</strong></div>
          <div><span>{fr ? 'Période' : 'Period'}</span><strong>{analysis.firstDate && analysis.lastDate ? `${formatDate(analysis.firstDate)} – ${formatDate(analysis.lastDate)}` : '—'}</strong></div>
          <div><span>{fr ? 'Valeur' : 'Value'}</span><strong>${Number(analysis.totalAmount).toLocaleString('en-CA', { minimumFractionDigits: 2 })}</strong></div>
        </div>
        <p className="import-details">{fr
          ? `${analysis.billed} facturées · ${analysis.deleted} supprimées. Les états actifs, les tarifs et les dates originales seront conservés.`
          : `${analysis.billed} billed · ${analysis.deleted} deleted. Active states, rates and original dates will be preserved.`}</p>
        <label className="import-confirmation">
          {fr ? 'Pour confirmer le remplacement, écrivez RESTAURER' : 'To confirm replacement, type RESTAURER'}
          <input value={confirmation} disabled={restoreBusy} onChange={(event) => setConfirmation(event.target.value)} autoComplete="off" />
        </label>
      </> : null}
      {error ? <p className="error-message">{error}</p> : null}
      <div className="modal-actions">
        <button className="secondary-button" disabled={restoreBusy} onClick={() => setRestoreOpen(false)}>{fr ? 'Retour' : 'Back'}</button>
        <button className="primary-button danger-import" disabled={!analysis || confirmation !== 'RESTAURER' || restoreBusy} onClick={() => void executeRestore()}>
          {restoreBusy && analysis ? (fr ? 'Restauration…' : 'Restoring…') : (fr ? 'Restaurer mes données' : 'Restore my data')}
        </button>
      </div>
    </section></div> : null}
  </>;
}
