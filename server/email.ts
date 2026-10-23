import nodemailer from 'nodemailer';

const ADMIN_EMAIL = process.env.ADMIN_EMAIL?.toLowerCase();
const APP_URL = process.env.APP_URL ?? 'http://localhost:5173';

function createTransport() {
  const host = process.env.SMTP_HOST;
  if (!host) return null;

  return nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT ?? 587),
    secure: process.env.SMTP_SECURE === 'true',
    auth:
      process.env.SMTP_USER && process.env.SMTP_PASS
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS }
        : undefined,
  });
}

export async function sendAdminApprovalEmail(params: {
  newUserEmail: string;
  newUserName: string | null;
  approvalToken: string;
}) {
  const approveUrl = `${APP_URL}/approve?token=${params.approvalToken}`;
  const subject = `CSC Distillery Tracker: approve new user ${params.newUserEmail}`;
  const text = [
    'A new user requested access to CSC Distillery Tracker.',
    '',
    `Email: ${params.newUserEmail}`,
    params.newUserName ? `Name: ${params.newUserName}` : '',
    '',
    'Approve this account:',
    approveUrl,
    '',
    'You can also sign in as admin and approve pending users from the Admin page.',
  ]
    .filter(Boolean)
    .join('\n');

  const transport = createTransport();
  if (!transport) {
    console.log('\n--- New user registration (SMTP not configured) ---');
    console.log(`To: ${ADMIN_EMAIL ?? '(set ADMIN_EMAIL)'}`);
    console.log(`Subject: ${subject}`);
    console.log(text);
    console.log('---\n');
    return { sent: false, approveUrl };
  }

  if (!ADMIN_EMAIL) {
    throw new Error('ADMIN_EMAIL environment variable is required to send approval emails.');
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? ADMIN_EMAIL,
    to: ADMIN_EMAIL,
    subject,
    text,
  });

  return { sent: true, approveUrl };
}

export async function sendPasswordResetEmail(params: { to: string; token: string }) {
  const resetUrl = `${APP_URL}/reset-password?token=${encodeURIComponent(params.token)}`;
  const subject = 'CSC Distillery Tracker: reset your password';
  const text = [
    'A password reset was requested for your CSC Distillery Tracker account.',
    '',
    'Choose a new password:',
    resetUrl,
    '',
    'This link expires in one hour. If you did not request it, you can ignore this email.',
  ].join('\n');

  const transport = createTransport();
  if (!transport) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('\n--- Password reset (SMTP not configured) ---');
      console.log(`To: ${params.to}`);
      console.log(text);
      console.log('---\n');
    } else {
      console.warn('Password reset email was not sent because SMTP is not configured.');
    }
    return { sent: false };
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? ADMIN_EMAIL ?? 'noreply@localhost',
    to: params.to,
    subject,
    text,
  });

  return { sent: true };
}
