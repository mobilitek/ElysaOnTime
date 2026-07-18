import { type FormEvent, useEffect, useState } from 'react';

type Language = 'fr' | 'en';
type User = { id: string; email: string; firstName: string; lastName: string };
type Client = { id: string; name: string; isActive: boolean; createdAt: string; updatedAt: string };

type Props = {
  language: Language;
  user: User;
  onLanguageChange: (language: Language) => void;
  onLogout: () => Promise<void>;
  onNavigateProjects: () => void;
};

const copy = {
  fr: {
    workLog: 'Journal', clients: 'Mes clients', projects: 'Projets', profile: 'Profil',
    title: 'Mes clients', subtitle: 'Gérez les organisations associées à vos projets.',
    add: 'Ajouter un client', name: 'Nom du client', status: 'Statut', active: 'Actif',
    inactive: 'Inactif', actions: 'Actions', edit: 'Modifier', noClients: 'Aucun client pour le moment.',
    noClientsHint: 'Ajoutez votre premier client pour ensuite créer ses projets.',
    createTitle: 'Nouveau client', editTitle: 'Modifier le client', cancel: 'Annuler', save: 'Enregistrer',
    create: 'Créer le client', required: 'Le nom du client est obligatoire.',
    duplicate: 'Un client portant ce nom existe déjà.', error: 'Une erreur est survenue. Réessayez.',
    logout: 'Se déconnecter', loading: 'Chargement…', toggle: 'Changer le statut de',
  },
  en: {
    workLog: 'Work log', clients: 'My clients', projects: 'Projects', profile: 'Profile',
    title: 'My clients', subtitle: 'Manage the organizations associated with your projects.',
    add: 'Add client', name: 'Client name', status: 'Status', active: 'Active', inactive: 'Inactive',
    actions: 'Actions', edit: 'Edit', noClients: 'No clients yet.',
    noClientsHint: 'Add your first client, then create its projects.',
    createTitle: 'New client', editTitle: 'Edit client', cancel: 'Cancel', save: 'Save',
    create: 'Create client', required: 'Client name is required.',
    duplicate: 'A client with this name already exists.', error: 'Something went wrong. Please try again.',
    logout: 'Sign out', loading: 'Loading…', toggle: 'Change status for',
  },
} as const;

export function ClientsPage({ language, user, onLanguageChange, onLogout, onNavigateProjects }: Props) {
  const text = copy[language];
  const [clients, setClients] = useState<Client[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);

  const loadClients = async () => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/clients', { credentials: 'include' });
      if (response.ok) setClients(((await response.json()) as { clients: Client[] }).clients);
      else setError(text.error);
    } catch {
      setError(text.error);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => { void loadClients(); }, []);

  const openCreate = () => {
    setEditingClient(null); setName(''); setError(null); setIsFormOpen(true);
  };
  const openEdit = (client: Client) => {
    setEditingClient(client); setName(client.name); setError(null); setIsFormOpen(true);
  };
  const closeForm = () => { setIsFormOpen(false); setEditingClient(null); setError(null); };

  const saveClient = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedName = name.trim();
    if (!normalizedName) { setError(text.required); return; }
    setIsSaving(true); setError(null);
    try {
      const response = await fetch(editingClient ? `/api/clients/${editingClient.id}` : '/api/clients', {
        method: editingClient ? 'PATCH' : 'POST', credentials: 'include',
        headers: { 'content-type': 'application/json' }, body: JSON.stringify({ name: normalizedName }),
      });
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        setError(payload.error === 'CLIENT_NAME_EXISTS' ? text.duplicate : text.error);
        return;
      }
      closeForm();
      await loadClients();
    } catch {
      setError(text.error);
    } finally {
      setIsSaving(false);
    }
  };

  const toggleClient = async (client: Client) => {
    setError(null);
    try {
      const response = await fetch(`/api/clients/${client.id}`, {
        method: 'PATCH', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ isActive: !client.isActive }),
      });
      if (!response.ok) { setError(text.error); return; }
      const updated = ((await response.json()) as { client: Client }).client;
      setClients((current) => current.map((item) => item.id === updated.id ? updated : item));
    } catch {
      setError(text.error);
    }
  };

  return (
    <main className="app-page">
      <header className="app-header">
        <div className="app-brand"><span className="brand-mark">OT</span><span>OnTime</span></div>
        <nav className="app-nav" aria-label="Navigation principale">
          <button type="button" disabled>{text.workLog}</button>
          <button type="button" className="active">{text.clients}</button>
          <button type="button" onClick={onNavigateProjects}>{text.projects}</button>
        </nav>
        <div className="header-actions">
          <div className="language-switch compact">
            {(['fr', 'en'] as const).map((option) => <button key={option} type="button" className={language === option ? 'active' : ''} onClick={() => onLanguageChange(option)}>{option.toUpperCase()}</button>)}
          </div>
          <div className="user-chip"><span>{user.firstName[0]}{user.lastName[0]}</span><div><strong>{user.firstName} {user.lastName}</strong><button type="button" onClick={() => void onLogout()}>{text.logout}</button></div></div>
        </div>
      </header>

      <section className="content-shell">
        <div className="page-heading"><div><p className="eyebrow">ONTIME</p><h1>{text.title}</h1><p>{text.subtitle}</p></div><button className="add-button" type="button" onClick={openCreate}><span>+</span>{text.add}</button></div>
        {error && !isFormOpen ? <p className="error-message page-error" role="alert">{error}</p> : null}

        <div className="client-card">
          {isLoading ? <div className="empty-state"><span className="loading-ring" /><p>{text.loading}</p></div>
            : clients.length === 0 ? <div className="empty-state"><span className="empty-icon">C</span><h2>{text.noClients}</h2><p>{text.noClientsHint}</p><button className="primary-button small" type="button" onClick={openCreate}>{text.add}</button></div>
              : <div className="client-table" role="table" aria-label={text.title}>
                  <div className="client-row client-table-head" role="row"><span role="columnheader">{text.name}</span><span role="columnheader">{text.status}</span><span role="columnheader" className="action-column">{text.actions}</span></div>
                  {clients.map((client) => <div className={`client-row ${client.isActive ? '' : 'inactive'}`} role="row" key={client.id}>
                    <div className="client-name" role="cell"><span className="client-avatar">{client.name.slice(0, 2).toUpperCase()}</span><strong>{client.name}</strong></div>
                    <div role="cell"><button className={`status-toggle ${client.isActive ? 'active' : ''}`} type="button" onClick={() => void toggleClient(client)} aria-label={`${text.toggle} ${client.name}`}><span className="toggle-track"><span /></span>{client.isActive ? text.active : text.inactive}</button></div>
                    <div className="action-column" role="cell"><button className="edit-button" type="button" onClick={() => openEdit(client)}>{text.edit}</button></div>
                  </div>)}
                </div>}
        </div>
      </section>

      {isFormOpen ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) closeForm(); }}>
        <section className="client-modal" role="dialog" aria-modal="true" aria-labelledby="client-form-title">
          <div className="modal-heading"><div><p className="eyebrow">CLIENT</p><h2 id="client-form-title">{editingClient ? text.editTitle : text.createTitle}</h2></div><button type="button" className="close-button" onClick={closeForm} aria-label={text.cancel}>×</button></div>
          <form onSubmit={saveClient}><label htmlFor="client-name">{text.name}</label><input id="client-name" value={name} onChange={(event) => setName(event.target.value)} maxLength={200} autoFocus disabled={isSaving} />
            {error ? <p className="error-message" role="alert">{error}</p> : null}
            <div className="modal-actions"><button type="button" className="secondary-button" onClick={closeForm} disabled={isSaving}>{text.cancel}</button><button type="submit" className="primary-button" disabled={isSaving || !name.trim()}>{editingClient ? text.save : text.create}</button></div>
          </form>
        </section>
      </div> : null}
    </main>
  );
}
