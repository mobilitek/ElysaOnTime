import { useState } from 'react';
import { type SystemInfo, UserEnvironmentChip } from './UserEnvironmentChip';

export type HelpContext = 'worklog' | 'clients' | 'projects' | 'profile' | 'admin' | 'subscription';
type Language = 'fr' | 'en';
type Tab = 'manual' | 'page' | 'about';
type User = { firstName: string; lastName: string; isAdmin: boolean };
type Props = {
  language: Language;
  user: User;
  context: HelpContext;
  systemInfo: SystemInfo | null;
  systemInfoError: boolean;
  onLanguageChange: (language: Language) => void;
  onLogout: () => Promise<void>;
  onBack: () => void;
};

export const CURRENT_VERSION = '0.1.0';

export const HELP_CONTENT = {
  fr: {
    back: 'Retour', logout: 'Se déconnecter', eyebrow: 'CENTRE D’AIDE',
    title: 'Comment pouvons-nous vous aider?',
    subtitle: 'Consultez le manuel complet, l’aide de votre écran ou les nouveautés d’OnTime.',
    manual: 'Manuel', page: 'Cette page', about: 'À propos',
    version: 'Version actuelle', released: 'Version initiale',
    manualSections: [
      ['Bien démarrer', 'Créez votre compte pour profiter d’un essai gratuit de 7 jours. Ajoutez ensuite un client actif, puis au moins un projet actif avec son taux horaire. Vous pourrez alors consigner vos premières heures.'],
      ['Journal de travail', 'Utilisez les périodes Jour, Semaine, Mois, Année ou Personnalisé. Les flèches déplacent la période courante. Les filtres Client et Projet changent uniquement la liste affichée; ils ne sont pas obligatoires pour créer une entrée.'],
      ['Créer une entrée', 'Cliquez sur Nouvelle entrée, choisissez le client et le projet, puis saisissez la date, les heures et une description. Une valeur entière comme 4 peut être convertie en 04:00 après votre confirmation. Les heures utilisent des blocs de 15 minutes.'],
      ['Facturation et suppression', 'La case Facturé permet de suivre les entrées déjà remises au client. Plusieurs entrées sélectionnées peuvent être inversées ensemble. La suppression se fait individuellement et demeure réversible grâce à Afficher les supprimées.'],
      ['Banque d’heures', 'Activez la banque dans la fiche du projet, choisissez un solde initial et les limites quotidiennes et hebdomadaires propres à ce contrat. Dans une entrée, Heures travaillées représente le temps réel et Heures facturables le temps porté au projet; la différence alimente ou utilise la banque.'],
      ['Mode confidentiel', 'Le mode confidentiel est activé par défaut lors d’une première utilisation. Il masque les taux, les montants et toutes les informations financières à l’écran et dans les exports. Votre choix est mémorisé dans le navigateur.'],
      ['Export Excel', 'L’export reprend la période et les filtres affichés. Il produit le format destiné au client, sans la colonne Facturé. Les lignes de description commençant par trois traits d’union ne sont pas exportées.'],
      ['Sauvegarde et restauration', 'Sauvegarder télécharge toutes vos données OnTime dans un fichier JSON. Restaurer analyse d’abord le fichier, présente un résumé, puis remplace uniquement vos clients, projets et entrées après une confirmation explicite.'],
      ['Clients et projets', 'Seuls les clients et projets actifs peuvent recevoir de nouvelles entrées. Un projet appartient obligatoirement à un client et porte son propre taux horaire. Les anciennes entrées conservent leur taux historique.'],
      ['Profil et souscription', 'Votre profil permet de modifier vos coordonnées et votre mot de passe. La section Souscription présente la période active et son historique. À l’échéance, vos données demeurent accessibles pour sauvegarde et renouvellement.'],
      ['Administration', 'Les administrateurs peuvent créer et gérer les comptes, suspendre un accès et enregistrer les périodes de souscription. Chaque utilisateur demeure propriétaire de ses propres clients, projets et entrées.'],
    ],
    pageHelp: {
      worklog: ['Journal de travail', ['Choisissez une période pour limiter les résultats.', 'Les filtres Client et Projet sont facultatifs.', 'Nouvelle entrée possède ses propres choix de client et de projet.', 'Sélectionnez des lignes uniquement pour inverser leur état Facturé.', 'Utilisez Afficher les supprimées pour restaurer une entrée.']],
      clients: ['Mes clients', ['Ajoutez une organisation avec un nom unique.', 'Désactiver un client masque aussi ses projets et ses entrées du journal.', 'La banque d’heures et ses limites se configurent dans Modifier.', 'Un solde de banque peut devenir négatif.']],
      projects: ['Projets', ['Sélectionnez d’abord le client à administrer.', 'Chaque projet possède un taux horaire en dollars canadiens.', 'Un projet inactif ne peut plus recevoir d’entrée.', 'Une modification de taux ne change pas les entrées historiques déjà facturées.']],
      profile: ['Profil', ['Modifiez ici votre nom, votre courriel et votre mot de passe.', 'Consultez les dates et le type de votre souscription.', 'L’historique présente les essais, périodes gratuites, paiements et ajustements.', 'Utilisez Demander un renouvellement pour communiquer avec OnTime.']],
      admin: ['Administration', ['Recherchez et modifiez les comptes utilisateurs.', 'Les statuts suspendu et désactivé bloquent la connexion.', 'Enregistrez les renouvellements avec leur type, période et statut de paiement.', 'Votre propre droit administrateur est protégé contre une suppression accidentelle.']],
      subscription: ['Souscription expirée', ['Votre compte et vos données ne sont pas supprimés.', 'Vous pouvez consulter votre profil, changer votre mot de passe et sauvegarder vos données.', 'Demandez un renouvellement pour retrouver toutes les fonctions du journal.']],
    },
    improvements: [
      'Journal de travail bilingue avec périodes, filtres, tri et pagination.',
      'Gestion complète des clients, projets, taux horaires et entrées.',
      'Export Excel compatible avec le format historique destiné aux clients.',
      'Mode confidentiel protégeant toutes les informations financières.',
      'Banque d’heures avec temps réel, temps client et soldes hebdomadaires.',
      'Sauvegarde, restauration et import contrôlé des données.',
      'Comptes sécurisés, récupération du mot de passe et profils personnels.',
      'Souscriptions, essai gratuit de 7 jours et historique des renouvellements.',
      'Administration des utilisateurs et de leurs accès.',
      'Améliorations d’accessibilité, messages d’aide et validations guidées.',
    ],
  },
  en: {
    back: 'Back', logout: 'Sign out', eyebrow: 'HELP CENTER',
    title: 'How can we help?',
    subtitle: 'Browse the complete manual, help for your current screen, or what is new in OnTime.',
    manual: 'Manual', page: 'This page', about: 'About',
    version: 'Current version', released: 'Initial release',
    manualSections: [
      ['Getting started', 'Create your account to receive a free 7-day trial. Next, add an active client and at least one active project with its hourly rate. You can then record your first hours.'],
      ['Work log', 'Use Day, Week, Month, Year or Custom periods. The arrows move the current period. Client and Project filters only change the displayed list; they are not required to create an entry.'],
      ['Creating an entry', 'Select New entry, choose the client and project, then enter the date, hours and a description. A whole number such as 4 can be converted to 04:00 after confirmation. Hours use 15-minute increments.'],
      ['Billing and deletion', 'The Billed checkbox tracks entries already submitted to the client. Multiple selected entries can be toggled together. Entries are deleted individually and can be restored with Show deleted.'],
      ['Hour bank', 'Enable the bank in the project record and choose the opening balance and daily and weekly limits for that contract. Worked hours is the actual time and Billable hours is the time assigned to the project; their difference adds to or uses the bank.'],
      ['Confidential mode', 'Confidential mode is enabled by default on first use. It hides rates, amounts and all financial information on screen and in exports. Your choice is remembered by the browser.'],
      ['Excel export', 'The export follows the displayed period and filters. It produces the client-facing format without the Billed column. Description lines beginning with three hyphens are not exported.'],
      ['Backup and restore', 'Backup downloads all your OnTime data in a JSON file. Restore first analyzes the file and presents a summary, then replaces only your clients, projects and entries after explicit confirmation.'],
      ['Clients and projects', 'Only active clients and projects can receive new entries. A project must belong to a client and has its own hourly rate. Previous entries keep their historical rate.'],
      ['Profile and subscription', 'Your profile lets you change your details and password. Subscription shows the active period and its history. At expiry, your data remains available for backup and renewal.'],
      ['Administration', 'Administrators can create and manage accounts, suspend access and record subscription periods. Each user remains the owner of their own clients, projects and entries.'],
    ],
    pageHelp: {
      worklog: ['Work log', ['Choose a period to narrow the results.', 'Client and Project filters are optional.', 'New entry has its own client and project choices.', 'Select rows only to toggle their Billed status.', 'Use Show deleted to restore an entry.']],
      clients: ['My clients', ['Add an organization with a unique name.', 'Disabling a client also hides its projects and entries from the log.']],
      projects: ['Projects', ['First select the client you want to manage.', 'Each project has an hourly rate in Canadian dollars.', 'An inactive project cannot receive new entries.', 'A rate change does not alter historical billed entries.']],
      profile: ['Profile', ['Change your name, email and password here.', 'Review the dates and type of your subscription.', 'History shows trials, free periods, payments and adjustments.', 'Use Request renewal to contact OnTime.']],
      admin: ['Administration', ['Search for and edit user accounts.', 'Suspended and disabled statuses prevent sign-in.', 'Record renewals with their type, period and payment status.', 'Your own administrator permission is protected from accidental removal.']],
      subscription: ['Expired subscription', ['Your account and data are not deleted.', 'You can review your profile, change your password and back up your data.', 'Request a renewal to regain all work-log features.']],
    },
    improvements: [
      'Bilingual work log with periods, filters, sorting and pagination.',
      'Complete management of clients, projects, hourly rates and entries.',
      'Excel exports compatible with the historical client-facing format.',
      'Confidential mode protecting all financial information.',
      'Project-based hour bank with actual time, billable time and weekly balances.',
      'Controlled data backup, restore and import.',
      'Secure accounts, password recovery and personal profiles.',
      'Subscriptions, a free 7-day trial and renewal history.',
      'User and access administration.',
      'Accessibility improvements, helpful messages and guided validation.',
    ],
  },
} as const;

export function HelpCenterPage({
  language, user, context, systemInfo, systemInfoError,
  onLanguageChange, onLogout, onBack,
}: Props) {
  const text = HELP_CONTENT[language];
  const [tab, setTab] = useState<Tab>('page');
  const contextual = text.pageHelp[context];

  return <main className="app-page">
    <header className="app-header">
      <button className="help-back" onClick={onBack}>← {text.back}</button>
      <div className="app-brand help-brand"><span className="brand-mark">OT</span><span>OnTime</span></div>
      <div className="header-actions">
        <div className="language-switch compact">{(['fr', 'en'] as const).map((value) => <button key={value} className={language === value ? 'active' : ''} onClick={() => onLanguageChange(value)}>{value.toUpperCase()}</button>)}</div>
        <UserEnvironmentChip user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} logoutLabel={text.logout} onLogout={onLogout} />
      </div>
    </header>
    <section className="content-shell help-shell">
      <div className="page-heading"><div><p className="eyebrow">{text.eyebrow}</p><h1>{text.title}</h1><p>{text.subtitle}</p></div></div>
      <div className="help-tabs" role="tablist">
        {(['manual', 'page', 'about'] as Tab[]).map((value) => <button role="tab" aria-selected={tab === value} className={tab === value ? 'active' : ''} key={value} onClick={() => setTab(value)}>{text[value]}</button>)}
      </div>
      {tab === 'manual' ? <div className="manual-grid">{text.manualSections.map(([title, description]) => <article className="help-card" key={title}><h2>{title}</h2><p>{description}</p></article>)}</div> : null}
      {tab === 'page' ? <article className="help-card contextual-help"><p className="eyebrow">{text.page}</p><h2>{contextual[0]}</h2><ol>{contextual[1].map((item) => <li key={item}>{item}</li>)}</ol></article> : null}
      {tab === 'about' ? <div className="about-layout"><article className="help-card about-summary"><span className="brand-mark">OT</span><div><h2>OnTime</h2><p>{text.version} <strong>{CURRENT_VERSION}</strong></p></div></article><article className="help-card release-card"><div className="release-heading"><h2>OnTime {CURRENT_VERSION}</h2><span>{text.released}</span></div><ul>{text.improvements.map((item) => <li key={item}>{item}</li>)}</ul></article></div> : null}
    </section>
  </main>;
}
