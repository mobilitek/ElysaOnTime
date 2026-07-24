import { type FormEvent, useEffect, useState } from 'react';
import { ClientsPage } from './ClientsPage';
import { ProjectsPage } from './ProjectsPage';
import { WorkLogPage } from './WorkLogPage';
import { ProfilePage } from './ProfilePage';

type Language = 'fr' | 'en';
type User = { id: string; email: string; firstName: string; lastName: string; isAdmin: boolean };

const copy = {
  fr: {
    eyebrow: 'JOURNAL DE TRAVAIL', title: 'Bon retour',
    subtitle: 'Connectez-vous pour retrouver vos heures, vos projets et vos clients.',
    email: 'Adresse courriel', emailPlaceholder: 'vous@exemple.ca',
    password: 'Mot de passe', passwordPlaceholder: 'Votre mot de passe',
    remember: 'Rester connecté', forgot: 'Mot de passe oublié?',
    phaseTwo: 'Disponible dans la phase 2', login: 'Se connecter', loading: 'Connexion…',
    invalid: 'Adresse courriel ou mot de passe invalide.',
    unavailable: 'Le service est momentanément indisponible. Réessayez dans un instant.',
    secure: 'Connexion sécurisée', welcome: 'Bonjour',
    signedIn: 'Votre session OnTime est active.', continue: 'Continuer vers le journal',
    logout: 'Se déconnecter', productTitle: 'Chaque heure compte.',
    productText: 'Consignez votre travail, suivez vos projets et préparez vos exports sans perdre le fil.',
    createAccount: 'Créer un compte', haveAccount: 'J’ai déjà un compte', registerTitle: 'Créer votre compte', registerSubtitle: 'Commencez votre journal de travail OnTime.', firstName: 'Prénom', lastName: 'Nom', confirmPassword: 'Confirmer le mot de passe', register: 'Créer le compte', registering: 'Création…', mismatch: 'Les mots de passe ne correspondent pas.', emailExists: 'Cette adresse courriel est déjà utilisée.', accountCreated: 'Compte créé. Vous pouvez maintenant vous connecter.',
  },
  en: {
    eyebrow: 'WORK LOG', title: 'Welcome back',
    subtitle: 'Sign in to find your hours, projects and clients.',
    email: 'Email address', emailPlaceholder: 'you@example.ca',
    password: 'Password', passwordPlaceholder: 'Your password',
    remember: 'Keep me signed in', forgot: 'Forgot password?',
    phaseTwo: 'Available in phase 2', login: 'Sign in', loading: 'Signing in…',
    invalid: 'Invalid email address or password.',
    unavailable: 'The service is temporarily unavailable. Please try again shortly.',
    secure: 'Secure connection', welcome: 'Hello', signedIn: 'Your OnTime session is active.',
    continue: 'Continue to work log', logout: 'Sign out', productTitle: 'Every hour matters.',
    productText: 'Log your work, follow your projects and prepare exports without losing track.',
    createAccount: 'Create an account', haveAccount: 'I already have an account', registerTitle: 'Create your account', registerSubtitle: 'Start your OnTime work log.', firstName: 'First name', lastName: 'Last name', confirmPassword: 'Confirm password', register: 'Create account', registering: 'Creating…', mismatch: 'Passwords do not match.', emailExists: 'This email address is already in use.', accountCreated: 'Account created. You can now sign in.',
  },
} as const;

const getInitialLanguage = (): Language => {
  const saved = document.cookie.split('; ').find((value) => value.startsWith('ontime_language='))?.split('=')[1];
  return saved === 'en' ? 'en' : 'fr';
};

export function App() {
  const [language, setLanguage] = useState<Language>(getInitialLanguage);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(false);
  const [isRegistering, setIsRegistering] = useState(false);
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [passwordConfirmation, setPasswordConfirmation] = useState('');
  const [notice, setNotice] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCheckingSession, setIsCheckingSession] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [page, setPage] = useState<'worklog' | 'clients' | 'projects' | 'profile'>('worklog');
  const text = copy[language];

  useEffect(() => {
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

  const selectLanguage = (next: Language) => {
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
    event.preventDefault(); setError(null); setNotice(null);
    if (password !== passwordConfirmation) { setError(text.mismatch); return; }
    setIsLoading(true);
    try {
      const response = await fetch('/api/auth/register', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ firstName: firstName.trim(), lastName: lastName.trim(), email, password }) });
      const payload = await response.json() as { error?: string };
      if (!response.ok) { setError(payload.error === 'EMAIL_EXISTS' ? text.emailExists : text.unavailable); return; }
      setIsRegistering(false); setFirstName(''); setLastName(''); setPassword(''); setPasswordConfirmation(''); setNotice(text.accountCreated);
    } catch { setError(text.unavailable); }
    finally { setIsLoading(false); }
  };

  const toggleRegistration = () => { setIsRegistering((value) => !value); setError(null); setNotice(null); setPassword(''); setPasswordConfirmation(''); };

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
    if (page === 'clients') return <ClientsPage language={language} user={user} onLanguageChange={selectLanguage} onLogout={logout} onNavigateWorkLog={() => setPage('worklog')} onNavigateProjects={() => setPage('projects')} onNavigateProfile={() => setPage('profile')} />;
    if (page === 'projects') return <ProjectsPage language={language} user={user} onLanguageChange={selectLanguage} onLogout={logout} onNavigateWorkLog={() => setPage('worklog')} onNavigateClients={() => setPage('clients')} onNavigateProfile={() => setPage('profile')} />;
    if (page === 'profile') return <ProfilePage language={language} user={user} onUserChange={setUser} onLanguageChange={selectLanguage} onLogout={logout} onNavigateWorkLog={() => setPage('worklog')} onNavigateClients={() => setPage('clients')} onNavigateProjects={() => setPage('projects')} />;
    return <WorkLogPage language={language} user={user} onLanguageChange={selectLanguage} onLogout={logout} onNavigateClients={() => setPage('clients')} onNavigateProjects={() => setPage('projects')} onNavigateProfile={() => setPage('profile')} />;
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
                <><p className="eyebrow">{text.eyebrow}</p><h1>{isRegistering ? text.registerTitle : text.title}</h1><p className="form-subtitle">{isRegistering ? text.registerSubtitle : text.subtitle}</p>
                  <form onSubmit={isRegistering ? register : login} noValidate>
                    {isRegistering ? <div className="registration-names"><label>{text.firstName}<input value={firstName} onChange={(event) => setFirstName(event.target.value)} maxLength={100} required disabled={isLoading} /></label><label>{text.lastName}<input value={lastName} onChange={(event) => setLastName(event.target.value)} maxLength={100} required disabled={isLoading} /></label></div> : null}
                    <label htmlFor="email">{text.email}</label>
                    <input id="email" name="email" type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder={text.emailPlaceholder} autoComplete="email" required disabled={isLoading} />
                    <label htmlFor="password">{text.password}</label>
                    <input id="password" name="password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} placeholder={text.passwordPlaceholder} autoComplete={isRegistering ? 'new-password' : 'current-password'} minLength={8} required disabled={isLoading} />
                    {isRegistering ? <><label htmlFor="password-confirmation">{text.confirmPassword}</label><input id="password-confirmation" type="password" value={passwordConfirmation} onChange={(event) => setPasswordConfirmation(event.target.value)} autoComplete="new-password" minLength={8} required disabled={isLoading} /></> : <div className="form-options">
                      <label className="checkbox-label"><input type="checkbox" checked={rememberMe} onChange={(event) => setRememberMe(event.target.checked)} disabled={isLoading} /><span className="custom-checkbox" aria-hidden="true" />{text.remember}</label>
                      <button className="text-button" type="button" title={text.phaseTwo} disabled>{text.forgot}</button>
                    </div>}
                    {error ? <p className="error-message" role="alert">{error}</p> : null}
                    {notice ? <p className="success-message" role="status">{notice}</p> : null}
                    <button className="primary-button" type="submit" disabled={isLoading || !email || password.length < 8 || (isRegistering && (!firstName.trim() || !lastName.trim() || passwordConfirmation.length < 8))}>{isLoading ? (isRegistering ? text.registering : text.loading) : (isRegistering ? text.register : text.login)}</button>
                  </form>
                  <button className="account-switch" type="button" onClick={toggleRegistration}>{isRegistering ? text.haveAccount : text.createAccount}</button>
                  <p className="security-note"><span aria-hidden="true">●</span> {text.secure}</p>
                </>
              )}
          </div>
        </div>
      </section>
    </main>
  );
}
