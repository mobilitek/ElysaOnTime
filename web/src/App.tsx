import { type FormEvent, type ReactNode, useEffect, useState } from 'react';
import { ClientsPage } from './ClientsPage';
import { ProjectsPage } from './ProjectsPage';
import { WorkLogPage } from './WorkLogPage';
import { ProfilePage } from './ProfilePage';
import { AdminUsersPage } from './AdminUsersPage';
import { SubscriptionExpiredPage } from './SubscriptionExpiredPage';
import { HelpCenterPage, type HelpContext } from './HelpCenterPage';
import type { SystemInfo } from './UserEnvironmentChip';

type Language = 'fr' | 'en';
type User = { id: string; email: string; firstName: string; lastName: string; isAdmin: boolean; accountStatus: 'active' | 'suspended' | 'disabled'; subscriptionStartedOn: string; subscriptionEndsOn: string | null; accessLevel: 'full' | 'subscription_expired' };
type Page = 'worklog' | 'clients' | 'projects' | 'profile' | 'admin' | 'help';

const copy = {
  fr: {
    eyebrow: 'JOURNAL DE TRAVAIL', title: 'Bon retour',
    subtitle: 'Connectez-vous pour retrouver vos heures, vos projets et vos clients.',
    email: 'Adresse courriel', emailPlaceholder: 'vous@exemple.ca',
    password: 'Mot de passe', passwordPlaceholder: 'Votre mot de passe',
    remember: 'Rester connecté', forgot: 'Mot de passe oublié?',
    login: 'Se connecter', loading: 'Connexion…',
    invalid: 'Adresse courriel ou mot de passe invalide.',
    unavailable: 'Le service est momentanément indisponible. Réessayez dans un instant.',
    secure: 'Connexion sécurisée', welcome: 'Bonjour',
    signedIn: 'Votre session OnTime est active.', continue: 'Continuer vers le journal',
    logout: 'Se déconnecter', productTitle: 'Chaque heure compte.',
    productText: 'Consignez votre travail, suivez vos projets et préparez vos exports sans perdre le fil.',
    createAccount: 'Créer un compte', haveAccount: 'J’ai déjà un compte', registerTitle: 'Créer votre compte', registerSubtitle: 'Commencez votre journal de travail OnTime.', trialNotice: 'Votre compte comprend un essai gratuit de 7 jours, sans carte de crédit ni renouvellement automatique.', firstName: 'Prénom', lastName: 'Nom', confirmPassword: 'Confirmer le mot de passe', register: 'Créer le compte', registering: 'Création…', mismatch: 'Les mots de passe ne correspondent pas.', emailExists: 'Cette adresse courriel est déjà utilisée.', accountCreated: 'Compte créé. Votre essai gratuit de 7 jours est actif; consultez votre courriel pour connaître la période.',
    forgotTitle: 'Mot de passe oublié', forgotSubtitle: 'Entrez votre adresse courriel pour recevoir un lien sécurisé.', sendLink: 'Envoyer le lien', sendingLink: 'Envoi…', resetSent: 'Si un compte correspond à cette adresse, un courriel vient d’être envoyé.', backToLogin: 'Retour à la connexion',
    resetTitle: 'Nouveau mot de passe', resetSubtitle: 'Choisissez un nouveau mot de passe pour votre compte.', newPassword: 'Nouveau mot de passe', resetPassword: 'Modifier le mot de passe', resettingPassword: 'Modification…', resetComplete: 'Mot de passe modifié. Vous pouvez maintenant vous connecter.', invalidReset: 'Ce lien est invalide ou expiré. Demandez un nouveau lien.',
  },
  en: {
    eyebrow: 'WORK LOG', title: 'Welcome back',
    subtitle: 'Sign in to find your hours, projects and clients.',
    email: 'Email address', emailPlaceholder: 'you@example.ca',
    password: 'Password', passwordPlaceholder: 'Your password',
    remember: 'Keep me signed in', forgot: 'Forgot password?',
    login: 'Sign in', loading: 'Signing in…',
    invalid: 'Invalid email address or password.',
    unavailable: 'The service is temporarily unavailable. Please try again shortly.',
    secure: 'Secure connection', welcome: 'Hello', signedIn: 'Your OnTime session is active.',
    continue: 'Continue to work log', logout: 'Sign out', productTitle: 'Every hour matters.',
    productText: 'Log your work, follow your projects and prepare exports without losing track.',
    createAccount: 'Create an account', haveAccount: 'I already have an account', registerTitle: 'Create your account', registerSubtitle: 'Start your OnTime work log.', trialNotice: 'Your account includes a free 7-day trial, with no credit card and no automatic renewal.', firstName: 'First name', lastName: 'Last name', confirmPassword: 'Confirm password', register: 'Create account', registering: 'Creating…', mismatch: 'Passwords do not match.', emailExists: 'This email address is already in use.', accountCreated: 'Account created. Your free 7-day trial is active; check your email for the trial period.',
    forgotTitle: 'Forgot password', forgotSubtitle: 'Enter your email address to receive a secure link.', sendLink: 'Send link', sendingLink: 'Sending…', resetSent: 'If an account matches this address, an email has just been sent.', backToLogin: 'Back to sign in',
    resetTitle: 'New password', resetSubtitle: 'Choose a new password for your account.', newPassword: 'New password', resetPassword: 'Change password', resettingPassword: 'Changing…', resetComplete: 'Password changed. You can now sign in.', invalidReset: 'This link is invalid or expired. Request a new link.',
  },
} as const;

const getInitialLanguage = (): Language => {
  // La préférence est locale au navigateur et survit aux nouvelles sessions.
  const saved = document.cookie.split('; ').find((value) => value.startsWith('ontime_language='))?.split('=')[1];
  return saved === 'en' ? 'en' : 'fr';
};

export function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [isForgotPassword, setIsForgotPassword] = useState(false);
  const [resetToken, setResetToken] = useState(() => new URLSearchParams(window.location.search).get('resetToken') ?? '');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [systemInfoError, setSystemInfoError] = useState(false);
  const [page, setPage] = useState<Page>('worklog');
  const [helpContext, setHelpContext] = useState<HelpContext>('worklog');
  const [helpReturnPage, setHelpReturnPage] = useState<Exclude<Page, 'help'>>('worklog');
  const text = copy[language];

  useEffect(() => {
    // Synchroniser le titre et l'attribut lang améliore l'accessibilité et rend
    // chaque état d'authentification identifiable dans l'onglet du navigateur.
    const titles = language === 'fr'
      ? { login: 'Connexion', register: 'Créer un compte', forgot: 'Mot de passe oublié', reset: 'Nouveau mot de passe', worklog: 'Journal', clients: 'Clients', projects: 'Projets', profile: 'Profil', admin: 'Administration', help: 'Aide' }
      : { login: 'Sign in', register: 'Create account', forgot: 'Forgot password', reset: 'New password', worklog: 'Work log', clients: 'Clients', projects: 'Projects', profile: 'Profile', admin: 'Administration', help: 'Help' };
    const section = user ? titles[page] : resetToken ? titles.reset : isForgotPassword ? titles.forgot : isRegistering ? titles.register : titles.login;
    document.title = `OnTime — ${section}`;
    document.documentElement.lang = language;
  }, [isForgotPassword, isRegistering, language, page, resetToken, user]);

  useEffect(() => {
    // Vérifier la session au chargement permet de contourner l'écran de connexion
    // lorsque le témoin HTTP-only est encore valide.
    const loadSession = async () => {
      try {
        const response = await fetch('/api/auth/session', { credentials: 'include' });
        if (response.ok) setUser(((await response.json()) as { user: User }).user);
      } finally {
        setIsCheckingSession(false);
      }
    };
    void loadSession();
  }, []);

  useEffect(() => {
    if (!user) {
      setSystemInfo(null);
      setSystemInfoError(false);
      return;
    }

    // La route interroge PostgreSQL lui-même; le badge représente donc la base
    // réellement utilisée par l'API pour cette session.
    const loadSystemInfo = async (clearCurrent = false) => {
      if (clearCurrent) setSystemInfo(null);
      try {
        const response = await fetch('/api/system-info', {
          credentials: 'include',
          cache: 'no-store',
        });
        if (!response.ok) throw new Error('Unable to load system information');
        setSystemInfo(await response.json() as SystemInfo);
        setSystemInfoError(false);
      } catch {
        setSystemInfo(null);
        setSystemInfoError(true);
      }
    };

    void loadSystemInfo(true);

    // Une modification du .env redémarre l'API sans nécessairement recréer
    // l'état React. Une vérification périodique et au retour dans l'onglet remet
    // donc automatiquement le badge à jour après ce court intervalle.
    const refresh = () => void loadSystemInfo();
    const interval = window.setInterval(refresh, 10_000);
    window.addEventListener('focus', refresh);

    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', refresh);
    };
  }, [user?.id]);

  const selectLanguage = (next: Language) => {
    // Le témoin est partagé avec toutes les pages sans stockage serveur.
    setLanguage(next);
    document.documentElement.lang = next;
    document.cookie = `ontime_language=${next}; Max-Age=31536000; Path=/; SameSite=Lax`;
  };

  const login = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/auth/login', {
        method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email, password, rememberMe }),
      });
      if (!response.ok) {
        setError(response.status === 401 ? text.invalid : text.unavailable);
        return;
      }
      setUser(((await response.json()) as { user: User }).user);
      setPassword('');
    } catch {
      setError(text.unavailable);
    } finally {
      setIsLoading(false);
    }
  };

  const register = async (event: FormEvent<HTMLFormElement>) => {
    // La confirmation est validée localement; le serveur valide encore la force
    // minimale et l'unicité du courriel.
    event.preventDefault(); setError(null); setNotice(null);
    if (password !== passwordConfirmation) { setError(text.mismatch); return; }
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), email, password, language }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) { setError(payload.error === 'EMAIL_EXISTS' ? text.emailExists : text.unavailable); return; }
      setIsRegistering(false); setFirstName(''); setLastName(''); setPassword(''); setPasswordConfirmation(''); setNotice(text.accountCreated);
    } catch { setError(text.unavailable); }
    finally { setIsLoading(false); }
  };

  const requestPasswordReset = async (event: FormEvent<HTMLFormElement>) => {
    // Le message de succès est identique, que le compte existe ou non.
    event.preventDefault(); setError(null); setNotice(null); setIsLoading(true);
    try {
      const response = await fetch('/api/auth/forgot-password', {
        method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }),
      });
      if (!response.ok) { setError(text.unavailable); return; }
      setNotice(text.resetSent);
    } catch { setError(text.unavailable); }
    finally { setIsLoading(false); }
  };

  const submitNewPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault(); setError(null); setNotice(null);
    if (password !== passwordConfirmation) { setError(text.mismatch); return; }
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/reset-password', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ token: resetToken, password }),
      });
      if (!response.ok) { setError(response.status === 422 ? text.invalidReset : text.unavailable); return; }
      // Retirer immédiatement le jeton de l'adresse évite qu'il reste visible
      // dans l'historique après son utilisation.
      window.history.replaceState({}, '', window.location.pathname);
      setResetToken(''); setPassword(''); setPasswordConfirmation(''); setNotice(text.resetComplete);
    } catch { setError(text.unavailable); }
    finally { setIsLoading(false); }
  };

  const toggleRegistration = () => { setIsRegistering((value) => !value); setError(null); setNotice(null); setPassword(''); setPasswordConfirmation(''); };
  const showForgotPassword = () => { setIsForgotPassword(true); setIsRegistering(false); setError(null); setNotice(null); setPassword(''); };
  const showLogin = () => {
    if (resetToken) window.history.replaceState({}, '', window.location.pathname);
    setResetToken(''); setIsForgotPassword(false); setIsRegistering(false); setError(null); setNotice(null); setPassword(''); setPasswordConfirmation('');
  };

  const logout = async () => {
    setIsLoading(true);
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  };

  if (!isCheckingSession && user) {
    const openHelp = (context: HelpContext, returnPage: Exclude<Page, 'help'>) => {
      setHelpContext(context);
      setHelpReturnPage(returnPage);
      setPage('help');
    };
    const withHelp = (content: ReactNode, context: HelpContext, returnPage: Exclude<Page, 'help'>) => <>
      {content}
      <button className="floating-help-button" title={language === 'fr' ? 'Aide pour cette page' : 'Help for this page'} aria-label={language === 'fr' ? 'Aide pour cette page' : 'Help for this page'} onClick={() => openHelp(context, returnPage)}>?</button>
    </>;
    if (page === 'help') {
      return <HelpCenterPage language={language} user={user} context={helpContext} systemInfo={systemInfo} systemInfoError={systemInfoError} onLanguageChange={selectLanguage} onLogout={logout} onBack={() => setPage(helpReturnPage)} onNavigateWorkLog={() => setPage('worklog')} />;
    }
    // La navigation de phase 1 demeure un état React simple; chaque page partage
    // l'utilisateur, la langue et les callbacks de la barre de navigation.
    if (user.accessLevel === 'subscription_expired' && page !== 'profile') {
      return withHelp(<SubscriptionExpiredPage language={language} user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} onLanguageChange={selectLanguage} onLogout={logout} onNavigateProfile={() => setPage('profile')} />, 'subscription', 'worklog');
    }
    if (page === 'admin' && user.isAdmin) return withHelp(<AdminUsersPage language={language} user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} onLanguageChange={selectLanguage} onLogout={logout} onNavigateWorkLog={() => setPage('worklog')} onNavigateClients={() => setPage('clients')} onNavigateProjects={() => setPage('projects')} onNavigateProfile={() => setPage('profile')} />, 'admin', 'admin');
    if (page === 'clients') return withHelp(<ClientsPage language={language} user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} onLanguageChange={selectLanguage} onLogout={logout} onNavigateWorkLog={() => setPage('worklog')} onNavigateProjects={() => setPage('projects')} onNavigateProfile={() => setPage('profile')} onNavigateAdmin={() => setPage('admin')} />, 'clients', 'clients');
    if (page === 'projects') return withHelp(<ProjectsPage language={language} user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} onLanguageChange={selectLanguage} onLogout={logout} onNavigateWorkLog={() => setPage('worklog')} onNavigateClients={() => setPage('clients')} onNavigateProfile={() => setPage('profile')} onNavigateAdmin={() => setPage('admin')} />, 'projects', 'projects');
    if (page === 'profile') return withHelp(<ProfilePage language={language} user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} onUserChange={setUser} onLanguageChange={selectLanguage} onLogout={logout} onNavigateWorkLog={() => setPage('worklog')} onNavigateClients={() => setPage('clients')} onNavigateProjects={() => setPage('projects')} />, 'profile', 'profile');
    return withHelp(<WorkLogPage language={language} user={user} systemInfo={systemInfo} systemInfoError={systemInfoError} onLanguageChange={selectLanguage} onLogout={logout} onNavigateClients={() => setPage('clients')} onNavigateProjects={() => setPage('projects')} onNavigateProfile={() => setPage('profile')} onNavigateAdmin={() => setPage('admin')} />, 'worklog', 'worklog');
  }

  return (
    <main className="login-page">
      <section className="login-shell" aria-label={language === 'fr' ? 'Connexion OnTime' : 'OnTime login'}>
        <aside className="brand-panel">
          <div className="brand-lockup" aria-label="OnTime"><span className="brand-mark">OT</span><span>OnTime</span></div>
          <div className="time-illustration" aria-hidden="true">
            <div className="orbit orbit-one" /><div className="orbit orbit-two" />
            <div className="clock-face"><span className="clock-hand clock-hour" /><span className="clock-hand clock-minute" /><span className="clock-pin" /></div>
            <div className="log-card"><span className="log-line line-long" /><span className="log-line line-medium" /><span className="log-line line-short" /><span className="log-total">08:00</span></div>
            <span className="floating-dot dot-one" /><span className="floating-dot dot-two" /><span className="floating-dot dot-three" />
          </div>
          <div className="brand-message"><h2>{text.productTitle}</h2><p>{text.productText}</p></div>
        </aside>

        <div className="form-panel">
          <div className="language-switch" aria-label={language === 'fr' ? 'Choisir la langue' : 'Choose language'}>
            {(['fr', 'en'] as const).map((option) => (
              <button key={option} type="button" className={language === option ? 'active' : ''} onClick={() => selectLanguage(option)} aria-pressed={language === option}>{option.toUpperCase()}</button>
            ))}
          </div>

          <div className="form-content">
            {isCheckingSession ? <div className="session-loading" aria-live="polite"><span className="loading-ring" /></div>
              : (
                <><p className="eyebrow">{text.eyebrow}</p><h1>{resetToken ? text.resetTitle : isForgotPassword ? text.forgotTitle : isRegistering ? text.registerTitle : text.title}</h1><p className="form-subtitle">{resetToken ? text.resetSubtitle : isForgotPassword ? text.forgotSubtitle : isRegistering ? text.registerSubtitle : text.subtitle}</p>
                  {isRegistering ? <p className="trial-registration-note">{text.trialNotice}</p> : null}
                  <form onSubmit={resetToken ? submitNewPassword : isForgotPassword ? requestPasswordReset : isRegistering ? register : login} noValidate>
                    {isRegistering ? <div className="registration-names"><label>{text.firstName}<input value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={100} required disabled={isLoading} /></label><label>{text.lastName}<input value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={100} required disabled={isLoading} /></label></div> : null}
                    {!resetToken ? <><label htmlFor="email">{text.email}</label><input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={text.emailPlaceholder} autoComplete="email" required disabled={isLoading} /></> : null}
                    {!isForgotPassword ? <><label htmlFor="password">{resetToken ? text.newPassword : text.password}</label>
                    <input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={text.passwordPlaceholder} autoComplete={isRegistering || resetToken ? 'new-password' : 'current-password'} minLength={isRegistering || resetToken ? 12 : 1} required disabled={isLoading} /></> : null}
                    {isRegistering || resetToken ? <><label htmlFor="password-confirmation">{text.confirmPassword}</label><input id="password-confirmation" type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" minLength={12} required disabled={isLoading} /></> : !isForgotPassword ? <div className="form-options">
                      <label className="checkbox-label"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} disabled={isLoading} /><span className="custom-checkbox" aria-hidden="true" />{text.remember}</label>
                      <button className="text-button" type="button" onClick={showForgotPassword}>{text.forgot}</button>
                    </div> : null}
                    {error ? <p className="error-message" role="alert">{error}</p> : null}
                    {notice ? <p className="success-message" role="status">{notice}</p> : null}
                    <button className="primary-button" type="submit" disabled={isLoading || (!resetToken && !email) || (!isForgotPassword && password.length < (isRegistering || resetToken ? 12 : 1)) || ((isRegistering || Boolean(resetToken)) && passwordConfirmation.length < 12) || (isRegistering && (!firstName.trim() || !lastName.trim()))}>{isLoading ? (resetToken ? text.resettingPassword : isForgotPassword ? text.sendingLink : isRegistering ? text.registering : text.loading) : (resetToken ? text.resetPassword : isForgotPassword ? text.sendLink : isRegistering ? text.register : text.login)}</button>
                  </form>
                  <button className="account-switch" type="button" onClick={isForgotPassword || Boolean(resetToken) ? showLogin : toggleRegistration}>{isForgotPassword || resetToken ? text.backToLogin : isRegistering ? text.haveAccount : text.createAccount}</button>
                  <p className="security-note"><span aria-hidden="true">●</span> {text.secure}</p>
                </>
              )}
          </div>
        </div>
      </section>
    </main>
  );
}
