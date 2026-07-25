import nodemailer from 'nodemailer';
import { config } from '../../config';

type PasswordResetRecipient = {
  email: string;
  firstName: string;
};

let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;

// Le transport SMTP est créé au premier courriel puis réutilisé afin d'éviter
// de reconstruire inutilement la configuration pour chaque demande.
const getTransporter = () => {
  if (!transporter) {
    const smtp = config.smtp;
    transporter = nodemailer.createTransport({
      host: smtp.host,
      port: smtp.port,
      secure: smtp.secure,
      auth: {
        user: smtp.user,
        pass: smtp.password,
      },
    });
  }

  return transporter;
};

const escapeHtml = (value: string): string =>
  value.replace(/[&<>"']/g, (character) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#039;',
  })[character]!);

export const sendPasswordResetEmail = async (
  recipient: PasswordResetRecipient,
  token: string,
): Promise<void> => {
  const resetUrl = new URL(config.appUrl);
  // Le jeton est placé dans l'URL de l'application; React détectera ce paramètre
  // et affichera directement le formulaire de réinitialisation.
  resetUrl.searchParams.set('resetToken', token);
  const safeName = escapeHtml(recipient.firstName);
  const safeUrl = escapeHtml(resetUrl.toString());

  // Fournir les versions texte et HTML assure une lecture correcte dans les
  // clients de messagerie modernes comme dans les clients plus restrictifs.
  await getTransporter().sendMail({
    from: config.smtp.from,
    to: recipient.email,
    subject: 'OnTime — Réinitialisation de votre mot de passe',
    text: `Bonjour ${recipient.firstName},

Une réinitialisation du mot de passe de votre compte OnTime a été demandée.

Utilisez ce lien dans les 30 prochaines minutes :
${resetUrl}

Si vous n’avez pas fait cette demande, vous pouvez ignorer ce message.`,
    html: `<p>Bonjour ${safeName},</p>
<p>Une réinitialisation du mot de passe de votre compte OnTime a été demandée.</p>
<p><a href="${safeUrl}">Réinitialiser mon mot de passe</a></p>
<p>Ce lien est valide pendant 30 minutes et ne peut être utilisé qu’une seule fois.</p>
<p>Si vous n’avez pas fait cette demande, vous pouvez ignorer ce message.</p>`,
  });
};

export const sendWelcomeEmail = async (
  recipient: PasswordResetRecipient,
  language: 'fr' | 'en',
  periodStartedOn: string,
  periodEndsOn: string,
): Promise<void> => {
  const appUrl = new URL(config.appUrl).toString();
  const locale = language === 'fr' ? 'fr-CA' : 'en-CA';
  const format = (value: string) =>
    new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(new Date(`${value}T12:00:00`));
  const start = format(periodStartedOn);
  const end = format(periodEndsOn);
  const safeName = escapeHtml(recipient.firstName);
  const safeUrl = escapeHtml(appUrl);

  const french = language === 'fr';
  await getTransporter().sendMail({
    from: config.smtp.from,
    to: recipient.email,
    subject: french ? 'Bienvenue sur OnTime — Votre essai gratuit' : 'Welcome to OnTime — Your free trial',
    text: french
      ? `Bonjour ${recipient.firstName},

Votre compte OnTime est maintenant créé.

Votre essai gratuit de 7 jours est valide du ${start} au ${end}, inclusivement.
Aucune carte de crédit n’a été demandée et aucun prélèvement automatique ne sera effectué.

Accéder à OnTime : ${appUrl}`
      : `Hello ${recipient.firstName},

Your OnTime account has been created.

Your seven-day free trial is valid from ${start} through ${end}, inclusive.
No credit card was requested and no automatic charge will be made.

Open OnTime: ${appUrl}`,
    html: french
      ? `<p>Bonjour ${safeName},</p><p>Votre compte OnTime est maintenant créé.</p><p>Votre essai gratuit de <strong>7 jours</strong> est valide du <strong>${start}</strong> au <strong>${end}</strong>, inclusivement.</p><p>Aucune carte de crédit n’a été demandée et aucun prélèvement automatique ne sera effectué.</p><p><a href="${safeUrl}">Accéder à OnTime</a></p>`
      : `<p>Hello ${safeName},</p><p>Your OnTime account has been created.</p><p>Your <strong>seven-day free trial</strong> is valid from <strong>${start}</strong> through <strong>${end}</strong>, inclusive.</p><p>No credit card was requested and no automatic charge will be made.</p><p><a href="${safeUrl}">Open OnTime</a></p>`,
  });
};
