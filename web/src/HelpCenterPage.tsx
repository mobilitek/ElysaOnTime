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
  onNavigateWorkLog: () => void;
};

export const CURRENT_VERSION = '0.3.0';

export const HELP_CONTENT = {
  fr: {
    back: 'Retour', logout: 'Se déconnecter', eyebrow: 'CENTRE D’AIDE',
    title: 'Comment pouvons-nous vous aider?',
    subtitle: 'Consultez le manuel complet, l’aide de votre écran ou les nouveautés d’OnTime.',
    manual: 'Manuel', page: 'Cette page', about: 'À propos',
    version: 'Version actuelle', current: 'Actuelle',
    manualSections: [
      ['Bien démarrer', 'Créez votre compte pour profiter d’un essai gratuit de 7 jours. Ajoutez ensuite un client actif, puis au moins un projet actif avec son taux horaire. Vous pourrez alors consigner vos premières heures.'],
      ['Journal de travail', 'Utilisez les périodes Jour, Semaine, Mois, Année ou Personnalisé. Les flèches déplacent la période courante. Les filtres Client et Projet changent uniquement la liste affichée; ils ne sont pas obligatoires pour créer une entrée.'],
      ['Créer une entrée', 'Cliquez sur Nouvelle entrée, choisissez le client et le projet, puis saisissez la date et les heures. Organisez ensuite la description librement, ligne par ligne et avec autant de niveaux d’indentation que nécessaire. Vous pouvez coller un texte multiligne ou copier le contenu complet d’une ancienne journée. Chaque ligne peut être destinée au client ou demeurer interne. Une valeur entière comme 4 peut être convertie en 04:00 après votre confirmation. Les heures utilisent des blocs de 15 minutes.'],
      ['Facturation et suppression', 'La case Facturé permet de suivre les entrées déjà remises au client. Plusieurs entrées sélectionnées peuvent être inversées ensemble. La suppression se fait individuellement et demeure réversible grâce à Afficher les supprimées.'],
      ['Banque d’heures', 'Activez la banque dans la fiche du projet, choisissez un solde initial et les limites quotidiennes et hebdomadaires propres à ce contrat. Dans une entrée, Heures travaillées représente le temps réel et Heures facturables le temps porté au projet; la différence alimente ou utilise la banque.'],
      ['Mode confidentiel', 'Le mode confidentiel est activé par défaut lors d’une première utilisation. Il masque les taux, les montants et toutes les informations financières à l’écran et dans les exports. Dans une fiche projet, le taux peut être révélé temporairement avec le bouton prévu à cet effet. Votre choix est mémorisé dans le navigateur.'],
      ['Export Excel', 'L’export reprend la période et les filtres affichés. Il produit le format destiné au client, sans la colonne Facturé, et inclut seulement les lignes marquées Client. Pour les anciennes descriptions, les lignes commençant par trois traits d’union demeurent internes. Un aperçu permet de vérifier le résultat. Si un projet actif du client utilise une banque d’heures, un rappel vous demande de confirmer ou de réviser les semaines concernées avant de poursuivre.'],
      ['Sauvegarde et restauration', 'Les commandes se trouvent dans la page Profil. Sauvegarder télécharge toutes vos données OnTime dans un fichier JSON, y compris la structure, l’indentation et le statut Client ou Interne des lignes du journal. Restaurer analyse d’abord le fichier, présente un résumé, puis remplace uniquement vos clients, projets et entrées après une confirmation explicite. Les anciennes sauvegardes sans structure demeurent compatibles.'],
      ['Clients et projets', 'Seuls les clients et projets actifs peuvent recevoir de nouvelles entrées. Un projet appartient obligatoirement à un client et porte son propre taux horaire. Les anciennes entrées conservent leur taux historique.'],
      ['Profil et souscription', 'Votre profil permet de modifier vos coordonnées et votre mot de passe. La section Souscription présente la période active et son historique. À l’échéance, vos données demeurent accessibles pour sauvegarde et renouvellement.'],
      ['Administration', 'Les administrateurs peuvent créer et gérer les comptes, suspendre un accès et enregistrer les périodes de souscription. Chaque utilisateur demeure propriétaire de ses propres clients, projets et entrées.'],
    ],
    pageHelp: {
      worklog: ['Journal de travail', ['Choisissez une période pour limiter les résultats.', 'Les filtres Client et Projet sont facultatifs.', 'Nouvelle entrée possède ses propres choix de client et de projet.', 'Sélectionnez des lignes uniquement pour inverser leur état Facturé.', 'Utilisez Afficher les supprimées pour restaurer une entrée.']],
      clients: ['Mes clients', ['Ajoutez une organisation avec un nom unique.', 'Désactiver un client masque aussi ses projets et ses entrées du journal.']],
      projects: ['Projets', ['Sélectionnez d’abord le client à administrer.', 'Chaque projet possède son propre taux et sa propre configuration de banque d’heures.', 'En mode confidentiel, utilisez le contrôle du champ Taux pour le révéler temporairement.', 'Un projet inactif ne peut plus recevoir d’entrée.', 'Une modification de taux ne change pas les entrées historiques déjà facturées.']],
      profile: ['Profil', ['Modifiez ici votre nom, votre courriel et votre mot de passe.', 'Utilisez Sauvegarder pour télécharger toutes vos données ou Restaurer pour analyser puis rétablir une sauvegarde.', 'Consultez les dates et le type de votre souscription.', 'L’historique présente les essais, périodes gratuites, paiements et ajustements.', 'Utilisez Demander un renouvellement pour communiquer avec OnTime.']],
      admin: ['Administration', ['Recherchez et modifiez les comptes utilisateurs.', 'Les statuts suspendu et désactivé bloquent la connexion.', 'Enregistrez les renouvellements avec leur type, période et statut de paiement.', 'Votre propre droit administrateur est protégé contre une suppression accidentelle.']],
      subscription: ['Souscription expirée', ['Votre compte et vos données ne sont pas supprimés.', 'Vous pouvez consulter votre profil, changer votre mot de passe et sauvegarder vos données.', 'Demandez un renouvellement pour retrouver toutes les fonctions du journal.']],
    },
    releases: [
      {
        version: '0.3.0',
        date: '27 juillet 2026',
        changes: [
          'Éditeur de journal hiérarchique et libre avec indentation sans limite prédéfinie.',
          'Collage de texte multiligne et copie du contenu complet d’anciennes entrées.',
          'Choix Client ou Interne pour chaque ligne, avec aperçu du contenu exporté.',
          'Conversion progressive et compatibilité avec les anciennes descriptions.',
          'Sauvegarde et restauration de la nouvelle structure des entrées, tout en acceptant les anciennes sauvegardes.',
          'Commandes de sauvegarde et de restauration regroupées dans la page Profil.',
        ],
      },
      {
        version: '0.2.0',
        date: '27 juillet 2026',
        changes: [
          'Banque d’heures propre à chaque projet avec temps réel, temps facturable, soldes hebdomadaires et révision des périodes qui la chevauchent.',
          'Souscriptions, essai gratuit de 7 jours, historique des renouvellements et administration des accès.',
          'Sauvegarde JSON, restauration et import Excel contrôlé des données.',
          'Récupération sécurisée du mot de passe par courriel.',
          'Protection des taux et informations financières avec le mode confidentiel.',
          'Centre d’aide bilingue avec manuel et aide contextuelle.',
          'Journal optimisé pour iPhone avec cartes tactiles et navigation mobile.',
          'Confirmation avant de dupliquer une entrée vers une date déjà occupée.',
          'Déploiement de production renforcé avec HTTPS et services Docker isolés.',
        ],
      },
      {
        version: '0.1.0',
        date: '18 juillet 2026',
        changes: [
          'Première version du journal de travail bilingue.',
          'Création de compte et authentification par session.',
          'Gestion des clients, projets, taux horaires et entrées.',
          'Périodes Jour, Semaine, Mois, Année et Personnalisé avec filtres, tri et pagination.',
          'Suivi des entrées facturées et restauration des entrées supprimées.',
          'Export Excel compatible avec le format historique destiné aux clients.',
          'Gestion du profil utilisateur et mémorisation des préférences.',
        ],
      },
    ],
  },
  en: {
    back: 'Back', logout: 'Sign out', eyebrow: 'HELP CENTER',
    title: 'How can we help?',
    subtitle: 'Browse the complete manual, help for your current screen, or what is new in OnTime.',
    manual: 'Manual', page: 'This page', about: 'About',
    version: 'Current version', current: 'Current',
    manualSections: [
      ['Getting started', 'Create your account to receive a free 7-day trial. Next, add an active client and at least one active project with its hourly rate. You can then record your first hours.'],
      ['Work log', 'Use Day, Week, Month, Year or Custom periods. The arrows move the current period. Client and Project filters only change the displayed list; they are not required to create an entry.'],
      ['Creating an entry', 'Select New entry, choose the client and project, then enter the date and hours. Organize the description freely, one line at a time and with as many indentation levels as needed. You can paste multiline text or copy the complete contents of an older day. Each line can be client-facing or remain internal. A whole number such as 4 can be converted to 04:00 after confirmation. Hours use 15-minute increments.'],
      ['Billing and deletion', 'The Billed checkbox tracks entries already submitted to the client. Multiple selected entries can be toggled together. Entries are deleted individually and can be restored with Show deleted.'],
      ['Hour bank', 'Enable the bank in the project record and choose the opening balance and daily and weekly limits for that contract. Worked hours is the actual time and Billable hours is the time assigned to the project; their difference adds to or uses the bank.'],
      ['Confidential mode', 'Confidential mode is enabled by default on first use. It hides rates, amounts and all financial information on screen and in exports. In a project record, the rate can be revealed temporarily with its dedicated button. Your choice is remembered by the browser.'],
      ['Excel export', 'The export follows the displayed period and filters. It produces the client-facing format without the Billed column and includes only lines marked Client. In older descriptions, lines beginning with three hyphens remain internal. A preview lets you verify the result. If an active project for the client uses an hour bank, a reminder asks you to confirm or review the affected weeks before continuing.'],
      ['Backup and restore', 'The controls are located on the Profile page. Backup downloads all your OnTime data in a JSON file, including journal line structure, indentation and Client or Internal status. Restore first analyzes the file and presents a summary, then replaces only your clients, projects and entries after explicit confirmation. Older backups without structured lines remain compatible.'],
      ['Clients and projects', 'Only active clients and projects can receive new entries. A project must belong to a client and has its own hourly rate. Previous entries keep their historical rate.'],
      ['Profile and subscription', 'Your profile lets you change your details and password. Subscription shows the active period and its history. At expiry, your data remains available for backup and renewal.'],
      ['Administration', 'Administrators can create and manage accounts, suspend access and record subscription periods. Each user remains the owner of their own clients, projects and entries.'],
    ],
    pageHelp: {
      worklog: ['Work log', ['Choose a period to narrow the results.', 'Client and Project filters are optional.', 'New entry has its own client and project choices.', 'Select rows only to toggle their Billed status.', 'Use Show deleted to restore an entry.']],
      clients: ['My clients', ['Add an organization with a unique name.', 'Disabling a client also hides its projects and entries from the log.']],
      projects: ['Projects', ['First select the client you want to manage.', 'Each project has its own rate and hour-bank settings.', 'In confidential mode, use the control in the Rate field to reveal it temporarily.', 'An inactive project cannot receive new entries.', 'A rate change does not alter historical billed entries.']],
      profile: ['Profile', ['Change your name, email and password here.', 'Use Backup to download all your data or Restore to analyze and then recover a backup.', 'Review the dates and type of your subscription.', 'History shows trials, free periods, payments and adjustments.', 'Use Request renewal to contact OnTime.']],
      admin: ['Administration', ['Search for and edit user accounts.', 'Suspended and disabled statuses prevent sign-in.', 'Record renewals with their type, period and payment status.', 'Your own administrator permission is protected from accidental removal.']],
      subscription: ['Expired subscription', ['Your account and data are not deleted.', 'You can review your profile, change your password and back up your data.', 'Request a renewal to regain all work-log features.']],
    },
    releases: [
      {
        version: '0.3.0',
        date: 'July 27, 2026',
        changes: [
          'Free-form hierarchical work-log editor with no predefined indentation limit.',
          'Multiline text paste and copying of complete contents from older entries.',
          'Client or Internal status for every line, with an export preview.',
          'Progressive conversion and compatibility with older descriptions.',
          'Backup and restore of the new entry structure while continuing to accept older backups.',
          'Backup and restore controls grouped on the Profile page.',
        ],
      },
      {
        version: '0.2.0',
        date: 'July 27, 2026',
        changes: [
          'Project-based hour bank with actual time, billable time, weekly balances and review for overlapping periods.',
          'Subscriptions, a free 7-day trial, renewal history and access administration.',
          'Controlled JSON backup, restore and Excel data import.',
          'Secure password recovery by email.',
          'Rate and financial-data protection with confidential mode.',
          'Bilingual help center with a manual and contextual help.',
          'iPhone-optimized work log with touch-friendly cards and mobile navigation.',
          'Confirmation before duplicating an entry to an occupied date.',
          'Hardened production deployment with HTTPS and isolated Docker services.',
        ],
      },
      {
        version: '0.1.0',
        date: 'July 18, 2026',
        changes: [
          'First version of the bilingual work log.',
          'Account registration and session authentication.',
          'Management of clients, projects, hourly rates and entries.',
          'Day, Week, Month, Year and Custom periods with filters, sorting and pagination.',
          'Tracking of billed entries and restoration of deleted entries.',
          'Excel exports compatible with the historical client-facing format.',
          'User profile management and remembered preferences.',
        ],
      },
    ],
  },
} as const;

export function HelpCenterPage({
  language, user, context, systemInfo, systemInfoError,
  onLanguageChange, onLogout, onBack, onNavigateWorkLog,
}: Props) {
  const text = HELP_CONTENT[language];
  const [tab, setTab] = useState<Tab>('page');
  const contextual = text.pageHelp[context];

  return <main className="app-page">
    <header className="app-header">
      <button className="help-back" onClick={onBack}>← {text.back}</button>
      <button className="app-brand help-brand help-brand-button" type="button" onClick={onNavigateWorkLog} aria-label={language === 'fr' ? 'Retourner au journal' : 'Return to work log'}><span className="brand-mark">OT</span><span>OnTime</span></button>
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
      {tab === 'about' ? <div className="about-layout"><article className="help-card about-summary"><span className="brand-mark">OT</span><div><h2>OnTime</h2><p>{text.version} <strong>{CURRENT_VERSION}</strong></p></div></article>{text.releases.map((release, index) => <article className="help-card release-card" key={release.version}><div className="release-heading"><h2>OnTime {release.version}</h2><div className="release-meta">{index === 0 ? <strong>{text.current}</strong> : null}<span>{release.date}</span></div></div><ul>{release.changes.map((item) => <li key={item}>{item}</li>)}</ul></article>)}</div> : null}
    </section>
  </main>;
}
