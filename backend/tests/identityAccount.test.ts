import assert from 'node:assert/strict';
import test from 'node:test';
import { canonicalPhone, classifyIdentifier, passwordSchema, requirePhone } from '../src/services/identityPolicy.js';
import { createEmailService, loadEmailConfig, renderActionEmail } from '../src/services/emailService.js';
import { loginSchema } from '../src/schemas/authSchemas.js';
import { createAuthService, type IdentityRepository } from '../src/services/authService.js';
import { readFile } from 'node:fs/promises';

test('identity classification and phone normalization do not reinterpret international numbers', () => {
  assert.deepEqual(classifyIdentifier(' Mixed@Example.Invalid '), { kind: 'email', value: 'mixed@example.invalid' });
  assert.equal(canonicalPhone('9876543210'), '+919876543210');
  for (const phone of ['09876543210', '+91 09876543210', '00919876543210']) assert.equal(canonicalPhone(phone), '+919876543210');
  assert.equal(canonicalPhone('+44 20 7946 0018'), '+442079460018');
  assert.equal(canonicalPhone('call +44 20 7946 0018'), null);
  assert.throws(() => requirePhone('1001'));
});
test('new password policy rejects short and bcrypt-truncated values but no composition rule', () => {
  assert.equal(passwordSchema.safeParse('x'.repeat(12)).success, true);
  assert.equal(passwordSchema.safeParse('x'.repeat(11)).success, false);
  assert.equal(passwordSchema.safeParse('x'.repeat(73)).success, false);
  assert.equal(passwordSchema.safeParse('é'.repeat(37)).success, false);
});
test('login accepts exactly one preferred identifier or legacy phone field', () => {
  assert.equal(loginSchema.safeParse({ identifier: 'a@example.invalid', password: 'old' }).success, true);
  assert.equal(loginSchema.safeParse({ phone: '1001', password: 'old' }).success, true);
  assert.equal(loginSchema.safeParse({ phone: '1001', identifier: 'x', password: 'old' }).success, false);
  assert.equal(loginSchema.safeParse({ password: 'old' }).success, false);
});
test('unknown phone, unknown email and unverified email have identical login failures', async () => {
  const identities: IdentityRepository = { findByPhone: async () => [], findByEmail: async () => [], findById: async () => null, buildContext: async () => { throw new Error('not reached'); } };
  const auth = createAuthService({ identities, sessions: { create: async () => { throw new Error('not reached'); }, validate: async () => { throw new Error('not reached'); }, rotate: async () => { throw new Error('not reached'); }, revoke: async () => undefined, revokeAllForUser: async () => undefined }, verifyPassword: async () => false, signAccessToken: () => '' });
  for (const identifier of ['unknown', 'unknown@example.invalid', 'unverified@example.invalid']) await assert.rejects(auth.login({ identifier, password: 'old' }), { message: 'Invalid credentials' });
});
test('email configuration fails closed, disabled boot is safe and capture is never environment enabled', async () => {
  assert.equal(loadEmailConfig({}).transport, 'disabled');
  assert.throws(() => loadEmailConfig({ NODE_ENV: 'production', EMAIL_TRANSPORT: 'capture' }));
  assert.throws(() => loadEmailConfig({ NODE_ENV: 'production', EMAIL_TRANSPORT: 'disabled', APP_PUBLIC_URL: 'http://unsafe.invalid' }));
  assert.throws(() => loadEmailConfig({ EMAIL_TRANSPORT: 'smtp', APP_PUBLIC_URL: 'https://app.example.invalid' }));
  await assert.rejects(createEmailService(loadEmailConfig({})).send({ to: 'test@example.invalid', purpose: 'password_reset', url: 'https://app.example.invalid/reset-password' }));
});
const resendEnvironment = { NODE_ENV: 'production', EMAIL_TRANSPORT: 'resend', APP_PUBLIC_URL: 'https://app.example.invalid', EMAIL_FROM: 'noreply@example.invalid', RESEND_API_KEY: 're_test_not_a_real_key_0000' };
test('Resend configuration requires a sender, key and safe HTTPS origin', () => {
  const config = loadEmailConfig(resendEnvironment);
  assert.equal(config.transport, 'resend'); assert.equal(createEmailService(config, async () => new Response(null)).enabled, true);
  assert.throws(() => loadEmailConfig({ ...resendEnvironment, RESEND_API_KEY: undefined }), /RESEND_API_KEY/);
  assert.throws(() => loadEmailConfig({ ...resendEnvironment, RESEND_API_KEY: 'smtp-password' }), /RESEND_API_KEY/);
  assert.throws(() => loadEmailConfig({ ...resendEnvironment, EMAIL_FROM: 'EkaVio' }), /sender/);
  assert.throws(() => loadEmailConfig({ ...resendEnvironment, APP_PUBLIC_URL: undefined }), /APP_PUBLIC_URL/);
  assert.throws(() => loadEmailConfig({ ...resendEnvironment, APP_PUBLIC_URL: 'http://app.example.invalid' }), /HTTPS/);
});
test('Resend delivery posts one idempotent HTTPS request and never surfaces provider bodies', async () => {
  const calls: { url: string; init: RequestInit }[] = [];
  let reply = new Response('{"id":"provider-id"}', { status: 200 });
  const service = createEmailService(loadEmailConfig(resendEnvironment), async (url, init) => { calls.push({ url: String(url), init: init! }); return reply; });
  await service.send({ to: 'test@example.invalid', purpose: 'password_reset', url: 'https://app.example.invalid/reset-password#token=x', idempotencyKey: 'challenge-1' });
  const [call] = calls;
  assert.equal(call!.url, 'https://api.resend.com/emails'); assert.equal(call!.init.method, 'POST'); assert.equal(call!.init.redirect, 'error');
  assert.ok(call!.init.signal);
  assert.deepEqual(call!.init.headers, { Authorization: `Bearer ${resendEnvironment.RESEND_API_KEY}`, 'Content-Type': 'application/json', 'User-Agent': 'ekavio-backend/1.0', 'Idempotency-Key': 'challenge-1' });
  const body = JSON.parse(String(call!.init.body));
  assert.deepEqual(Object.keys(body).sort(), ['from', 'html', 'subject', 'text', 'to']);
  assert.equal(body.from, 'noreply@example.invalid'); assert.deepEqual(body.to, ['test@example.invalid']); assert.match(body.text, /reset-password#token=x/);
  reply = new Response('{"message":"test@example.invalid is not allowed","name":"validation_error"}', { status: 403 });
  const rejected = await service.send({ to: 'test@example.invalid', purpose: 'password_reset', url: 'https://app.example.invalid/reset-password' }).then(() => null, (error: Error) => error);
  assert.equal(rejected?.message, 'Email provider rejected delivery (403)');
  assert.doesNotMatch(rejected!.message, /example\.invalid|re_test/);
  const offline = createEmailService(loadEmailConfig(resendEnvironment), async () => { throw new TypeError('fetch failed'); });
  await assert.rejects(offline.send({ to: 'test@example.invalid', purpose: 'email_verification', url: 'https://app.example.invalid/verify-email' }));
});
test('action email templates are HTML/text, bounded, escaped and contain no password or remote image', () => {
  for (const purpose of ['password_reset','email_verification','staff_invitation'] as const) {
    const value = renderActionEmail({ to: 'test@example.invalid', purpose, url: 'https://app.example.invalid/action#token=test&x="unsafe"' });
    assert.match(value.subject, /EkaVio/); assert.match(value.text, /single-use/);
    assert.match(value.html, /&amp;/); assert.doesNotMatch(value.html, /<img|test@example.invalid/);
  }
});
test('runtime staff route cannot create administrator-selected passwords and SMTP cannot log payloads', async () => {
  const route = await readFile('src/routes/staffRoutes.ts', 'utf8');
  assert.match(route, /status\(410\)/); assert.doesNotMatch(route, /, addStaff\)/);
  const email = await readFile('src/services/emailService.ts', 'utf8');
  assert.match(email, /requireTLS: true/); assert.match(email, /rejectUnauthorized: true/);
  assert.match(email, /logger: false, debug: false/); assert.match(email, /disableFileAccess: true, disableUrlAccess: true/);
});
