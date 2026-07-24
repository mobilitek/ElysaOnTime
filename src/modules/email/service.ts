import nodemailer from 'nodemailer';
import { config } from '../../config';

type PasswordResetRecipient = {
  email: string;
  firstName: string;
};

let transporter: ReturnType<typeof nodemailer.createTransport> | undefined;

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
  resetUrl.searchParams.set('resetToken', token);
  const safeName = escapeHtml(recipient.firstName);
  const safeUrl = escapeHtml(resetUrl.toString());

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
