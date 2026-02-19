import nodemailer from 'nodemailer';
import { config } from '../../config';
import logger from '../../config/logger';

// ---------------------------------------------------------------------------
// Transporter (lazy-initialised)
// ---------------------------------------------------------------------------

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.email.host,
      port: config.email.port,
      secure: config.email.secure,
      ...(config.email.user
        ? { auth: { user: config.email.user, pass: config.email.pass } }
        : {}),
    });
  }
  return transporter;
}

// ---------------------------------------------------------------------------
// Send generic email
// ---------------------------------------------------------------------------

async function sendMail(to: string, subject: string, html: string): Promise<boolean> {
  if (!config.email.enabled) {
    logger.info(`[Email] SMTP disabled — would send "${subject}" to ${to}`);
    return true; // Pretend success when SMTP is off (dev environment)
  }

  try {
    await getTransporter().sendMail({
      from: `"CG HR Platform" <${config.email.from}>`,
      to,
      subject,
      html,
    });
    logger.info(`[Email] Sent "${subject}" to ${to}`);
    return true;
  } catch (error) {
    logger.error(`[Email] Failed to send "${subject}" to ${to}`, { error });
    return false;
  }
}

// ---------------------------------------------------------------------------
// Welcome / Onboarding Email
// ---------------------------------------------------------------------------

interface WelcomeEmailData {
  firstName: string;
  lastName: string;
  email: string;
  tempPassword: string;
  jobTitle: string;
  employeeNumber: string;
  loginUrl?: string;
  requiresTwoFactor?: boolean;
}

export async function sendWelcomeEmail(data: WelcomeEmailData): Promise<boolean> {
  const loginUrl = data.loginUrl || `${config.corsOrigin}/login`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #0a0a0a; color: #e5e7eb; margin: 0; padding: 0; }
    .container { max-width: 560px; margin: 0 auto; padding: 40px 20px; }
    .card { background: #111827; border: 1px solid #1f2937; border-radius: 12px; padding: 32px; }
    .logo { text-align: center; margin-bottom: 24px; }
    .logo span { font-size: 24px; font-weight: 700; color: #fbbf24; }
    h1 { color: #ffffff; font-size: 20px; margin: 0 0 8px; }
    p { color: #9ca3af; font-size: 14px; line-height: 1.6; margin: 8px 0; }
    .creds { background: #1f2937; border: 1px solid #374151; border-radius: 8px; padding: 16px; margin: 20px 0; }
    .creds table { width: 100%; border-collapse: collapse; }
    .creds td { padding: 6px 0; font-size: 14px; }
    .creds td:first-child { color: #6b7280; width: 120px; }
    .creds td:last-child { color: #ffffff; font-weight: 600; font-family: monospace; }
    .btn { display: inline-block; background: #fbbf24; color: #000000; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 600; font-size: 14px; margin: 16px 0; }
    .warning { background: #7c2d12; border: 1px solid #9a3412; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
    .warning p { color: #fed7aa; margin: 0; font-size: 13px; }
    .tfa-note { background: #1e3a5f; border: 1px solid #2563eb; border-radius: 8px; padding: 12px 16px; margin: 16px 0; }
    .tfa-note p { color: #93c5fd; margin: 0; font-size: 13px; }
    .footer { text-align: center; margin-top: 24px; }
    .footer p { color: #6b7280; font-size: 12px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="card">
      <div class="logo"><span>CG HR</span></div>

      <h1>Welcome to Cinegrand, ${data.firstName}!</h1>
      <p>Your employee account has been created. Below are your login credentials.</p>

      <div class="creds">
        <table>
          <tr><td>Employee #</td><td>${data.employeeNumber}</td></tr>
          <tr><td>Position</td><td>${data.jobTitle}</td></tr>
          <tr><td>Email</td><td>${data.email}</td></tr>
          <tr><td>Password</td><td>${data.tempPassword}</td></tr>
        </table>
      </div>

      <div class="warning">
        <p><strong>Important:</strong> You will be required to change your password on first login. Choose a strong password with at least 12 characters including uppercase, lowercase, numbers, and special characters.</p>
      </div>

      ${data.requiresTwoFactor ? `
      <div class="tfa-note">
        <p><strong>Two-Factor Authentication:</strong> As a member of the leadership team, you are encouraged to enable 2FA for additional account security. You can set this up from your profile after logging in.</p>
      </div>
      ` : ''}

      <div style="text-align: center;">
        <a href="${loginUrl}" class="btn">Sign In to CG HR</a>
      </div>

      <p style="margin-top: 20px;">If you have any questions, please contact your manager or the HR department.</p>
    </div>

    <div class="footer">
      <p>This is an automated message from CG HR Platform. Do not reply to this email.</p>
    </div>
  </div>
</body>
</html>
  `.trim();

  return sendMail(
    data.email,
    `Welcome to Cinegrand – Your Login Credentials (${data.employeeNumber})`,
    html
  );
}

export default { sendWelcomeEmail };
