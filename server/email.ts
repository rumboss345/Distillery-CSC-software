import nodemailer from 'nodemailer';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL ?? 'nelson@rum.ky').toLowerCase();
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
  const subject = `Distillery Traker3: approve new user ${params.newUserEmail}`;
  const text = [
    'A new user requested access to Distillery Traker3.',
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
    console.log(`To: ${ADMIN_EMAIL}`);
    console.log(`Subject: ${subject}`);
    console.log(text);
    console.log('---\n');
    return { sent: false, approveUrl };
  }

  await transport.sendMail({
    from: process.env.SMTP_FROM ?? ADMIN_EMAIL,
    to: ADMIN_EMAIL,
    subject,
    text,
  });

  return { sent: true, approveUrl };
}
