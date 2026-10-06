import nodemailer from 'nodemailer';
import { z } from 'zod';
import { AppError } from '../utils/AppError.js';

export interface EmailConfig {
  transport: 'disabled' | 'smtp';
  publicUrl: string;
  from: string;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  pass: string;
}
export const loadEmailConfig = (environment: NodeJS.ProcessEnv): EmailConfig => {
  const transport = environment.EMAIL_TRANSPORT ?? 'disabled';
  if (!['disabled', 'smtp'].includes(transport)) throw new Error('EMAIL_TRANSPORT must be disabled or smtp; capture is test-injected only');
  const publicUrl = environment.APP_PUBLIC_URL ?? '';
  if (publicUrl || transport === 'smtp') try {
    const url = new URL(publicUrl);
    if (url.origin !== publicUrl || url.username || url.password ||
      (environment.NODE_ENV === 'production' ? url.protocol !== 'https:' : !['https:', 'http:'].includes(url.protocol))) throw new Error();
  } catch { throw new Error('APP_PUBLIC_URL must be an exact safe public origin (HTTPS in production)'); }
  if (transport === 'disabled') return { transport, publicUrl, from: '', host: '', port: 587, secure: false, user: '', pass: '' };
  if (!z.email().safeParse(environment.EMAIL_FROM).success || !environment.SMTP_HOST ||
    /[\s/]/.test(environment.SMTP_HOST) || !environment.SMTP_USER || !environment.SMTP_PASS ||
    !['true', 'false'].includes(environment.SMTP_SECURE ?? '')) throw new Error('SMTP requires a valid sender, host, credentials and explicit SMTP_SECURE');
  const port = Number(environment.SMTP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('SMTP_PORT must be valid');
  return { transport: 'smtp', publicUrl, from: environment.EMAIL_FROM!, host: environment.SMTP_HOST,
    port, secure: environment.SMTP_SECURE === 'true', user: environment.SMTP_USER, pass: environment.SMTP_PASS };
};
export interface ActionEmail { to: string; purpose: 'email_verification' | 'password_reset' | 'staff_invitation'; url: string }
export interface EmailService { enabled: boolean; publicUrl: string; send(message: ActionEmail): Promise<void> }
const labels = { email_verification: ['Verify your email', 'Verify email', '24 hours'], password_reset: ['Reset your password', 'Reset password', '30 minutes'], staff_invitation: ['Your workspace invitation', 'Accept invitation', '48 hours'] } as const;
const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
export const renderActionEmail = ({ purpose, url }: ActionEmail) => {
  const [subject, action, expiry] = labels[purpose];
  return { subject: `EkaVio — ${subject}`, text: `${subject}\n\n${action}: ${url}\n\nThis single-use link expires in ${expiry}. If you did not expect this message, ignore it. Never share your password.\nEkaVio`,
    html: `<!doctype html><html><body style="margin:0;background:#f4f6fa;font-family:Arial,sans-serif;color:#182230"><main style="max-width:560px;margin:32px auto;padding:28px;background:white;border-radius:16px"><p style="color:#4F46E5;font-weight:bold">EkaVio</p><h1 style="font-size:24px">${subject}</h1><p>Use this secure, single-use link to continue.</p><p style="margin:28px 0"><a style="background:#4F46E5;color:white;padding:14px 20px;border-radius:8px;text-decoration:none" href="${escapeHtml(url)}">${action}</a></p><p>This link expires in ${expiry}. If you did not expect this message, ignore it. Never share your password.</p><p style="font-size:12px;color:#667085">Business operations, securely connected.</p></main></body></html>` };
};
export const createEmailService = (config: EmailConfig): EmailService => {
  const smtp = config.transport === 'smtp' ? nodemailer.createTransport({ host: config.host, port: config.port,
    secure: config.secure, requireTLS: true, tls: { rejectUnauthorized: true, minVersion: 'TLSv1.2' },
    auth: { user: config.user, pass: config.pass }, logger: false, debug: false,
    disableFileAccess: true, disableUrlAccess: true, connectionTimeout: 10000, greetingTimeout: 10000, socketTimeout: 15000 }) : undefined;
  return { enabled: Boolean(smtp), publicUrl: config.publicUrl, async send(message) {
    if (!smtp) throw new AppError('Email actions are currently unavailable', 503);
    await smtp.sendMail({ from: config.from, to: message.to, ...renderActionEmail(message) });
  } };
};
