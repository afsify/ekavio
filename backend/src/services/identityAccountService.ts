import { createHash, randomBytes } from 'node:crypto';
import bcrypt from 'bcryptjs';
import type { PoolClient } from 'pg';
import type { PostgresDatabase } from '../postgres/database.js';
import type { EmailService, ActionEmail } from './emailService.js';
import { normalizeEmail, requireNewPassword, requirePhone, phoneUserIds, lockNewPhone, classifyIdentifier } from './identityPolicy.js';
import type { AuthorizationContext } from './requestContextService.js';
import { AppError } from '../utils/AppError.js';
import { generateLegacyMongoUserId, generateLegacyMongoMembershipId } from '../persistence/identifiers.js';

type Purpose = ActionEmail['purpose'];
interface Challenge { id: string; purpose: Purpose; user_id: string | null; email_identity_id: string | null; invitation_id: string | null; expires_at: Date; consumed_at: Date | null; revoked_at: Date | null }
interface Invitation { id: string; organization_id: string; actor_user_id: string; name: string; phone: string; email: string | null; role: 'admin' | 'manager' | 'hr' | 'staff'; expires_at: Date; consumed_at: Date | null; revoked_at: Date | null; created_at: Date }
export interface InvitationInput { name: string; phone: string; email?: string; role: Invitation['role']; branchIds: string[] }
export interface Appearance { mode: 'light' | 'dark' | 'system'; primaryColor: string }
const durations: Record<Purpose, number> = { email_verification: 24 * 3600000, password_reset: 30 * 60000, staff_invitation: 48 * 3600000 };
const routes: Record<Purpose, string> = { email_verification: '/verify-email', password_reset: '/reset-password', staff_invitation: '/accept-invitation' };
export const hashActionSecret = (value: string): string => createHash('sha256').update(value).digest('hex');
const invalidLink = () => new AppError('This link is invalid, expired, already used or revoked', 400);
const acceptedRecovery = { message: 'If this account has a verified email, a password reset message may be sent. Check your inbox.' };

export class IdentityAccountService {
  private readonly deliveries = new Set<Promise<unknown>>();
  public constructor(private readonly database: PostgresDatabase, private readonly email: EmailService,
    private readonly disconnect: (userId: string) => void = () => undefined) {}

  private requireEmail(): void { if (!this.email.enabled) throw new AppError('Email actions are currently unavailable. Contact your workspace administrator.', 503); }
  private audit(client: Pick<PoolClient, 'query'>, action: string, actor?: string | null, invitation?: string | null, outcome = 'accepted') {
    return client.query('INSERT INTO account_security_events(action, actor_user_id, invitation_id, outcome) VALUES ($1,$2,$3,$4)', [action, actor ?? null, invitation ?? null, outcome]);
  }
  private async issue(client: PoolClient, purpose: Purpose, userId: string | null, emailId: string | null, invitationId: string | null) {
    if (userId) {
      const recent = await client.query(`SELECT 1 FROM identity_challenges WHERE user_id=$1 AND purpose=$2 AND created_at > now()-interval '60 seconds' LIMIT 1`, [userId, purpose]);
      if (recent.rowCount) throw new AppError('Wait a minute before requesting another link', 429);
      await client.query('UPDATE identity_challenges SET revoked_at=now() WHERE user_id=$1 AND purpose=$2 AND consumed_at IS NULL AND revoked_at IS NULL', [userId, purpose]);
    }
    const raw = randomBytes(32).toString('base64url');
    const result = await client.query<{ id: string }>(`INSERT INTO identity_challenges(purpose,user_id,email_identity_id,invitation_id,secret_hash,expires_at)
      VALUES ($1,$2,$3,$4,$5,now()+$6*interval '1 millisecond') RETURNING id`, [purpose, userId, emailId, invitationId, hashActionSecret(raw), durations[purpose]]);
    return { id: result.rows[0]!.id, raw, url: `${this.email.publicUrl}${routes[purpose]}#token=${raw}` };
  }
  private async deliver(to: string, purpose: Purpose, issued: { id: string; url: string }, actor?: string, invitation?: string): Promise<boolean> {
    try { await this.email.send({ to, purpose, url: issued.url }); return true; }
    catch {
      await this.database.transaction(async (client) => {
        await client.query('UPDATE identity_challenges SET revoked_at=now() WHERE id=$1 AND consumed_at IS NULL', [issued.id]);
        await this.audit(client, 'email.delivery_failed', actor, invitation, 'unavailable');
      });
      console.error('Account email delivery unavailable'); // No provider error/message/body/recipient.
      return false;
    }
  }
  private async challenge(client: PoolClient, raw: string, purpose: Purpose): Promise<Challenge> {
    if (!/^[A-Za-z0-9_-]{43}$/.test(raw)) throw invalidLink();
    const found = await client.query<Challenge>('SELECT * FROM identity_challenges WHERE secret_hash=$1 AND purpose=$2', [hashActionSecret(raw), purpose]);
    const initial = found.rows[0];
    if (!initial) throw invalidLink();
    if (initial.user_id) await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [initial.user_id]);
    const result = await client.query<Challenge>('SELECT * FROM identity_challenges WHERE id=$1 FOR UPDATE', [initial.id]);
    const row = result.rows[0];
    if (!row || row.revoked_at || row.consumed_at || row.expires_at <= new Date()) throw invalidLink();
    return row;
  }
  public async emailState(userId: string) {
    const result = await this.database.query<{ id: string; display_email: string; state: string; verified_at: Date | null }>(
      "SELECT id,display_email,state,verified_at FROM user_email_identities WHERE user_id=$1 AND state <> 'replaced' ORDER BY state", [userId]);
    return { verified: result.rows.find((row) => row.state === 'verified')?.display_email ?? null,
      pending: result.rows.find((row) => row.state === 'pending')?.display_email ?? null, available: this.email.enabled };
  }
  public async proposeEmail(userId: string, displayEmail: string, resend = false): Promise<void> {
    this.requireEmail();
    const normalized = normalizeEmail(displayEmail);
    const issued = await this.database.transaction(async (client) => {
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
      const all = await client.query<{ id: string; user_id: string; state: string; normalized_email: string }>("SELECT id,user_id,state,normalized_email FROM user_email_identities WHERE normalized_email=$1 AND state <> 'replaced'", [normalized]);
      const existing = all.rows[0];
      if (existing && (existing.user_id !== userId || existing.state === 'verified')) throw new AppError('This email cannot be used', 409);
      let emailId = existing?.id;
      if (resend && !emailId) throw new AppError('No pending verification', 400);
      if (!emailId) {
        await client.query("UPDATE user_email_identities SET state='replaced' WHERE user_id=$1 AND state='pending'", [userId]);
        try {
          const added = await client.query<{ id: string }>("INSERT INTO user_email_identities(user_id,display_email,normalized_email,state) VALUES ($1,$2,$3,'pending') RETURNING id", [userId, displayEmail.trim(), normalized]);
          emailId = added.rows[0]!.id;
        } catch (error) { if ((error as { code?: string }).code === '23505') throw new AppError('This email cannot be used', 409); throw error; }
      }
      const result = await this.issue(client, 'email_verification', userId, emailId, null);
      await this.audit(client, resend ? 'email.resent' : 'email.proposed', userId);
      return result;
    });
    if (!(await this.deliver(normalized, 'email_verification', issued, userId))) throw new AppError('Email delivery unavailable; try again later', 503);
  }
  public async resendEmail(userId: string): Promise<void> {
    const state = await this.emailState(userId);
    if (!state.pending) throw new AppError('No pending verification', 400);
    await this.proposeEmail(userId, state.pending, true);
  }
  public async verifyEmail(raw: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const challenge = await this.challenge(client, raw, 'email_verification');
      const identity = await client.query("SELECT id FROM user_email_identities WHERE id=$1 AND user_id=$2 AND state='pending' FOR UPDATE", [challenge.email_identity_id, challenge.user_id]);
      if (!identity.rowCount) throw invalidLink();
      await client.query("UPDATE user_email_identities SET state='replaced' WHERE user_id=$1 AND state='verified'", [challenge.user_id]);
      await client.query("UPDATE user_email_identities SET state='verified',verified_at=now() WHERE id=$1", [challenge.email_identity_id]);
      await client.query('UPDATE identity_challenges SET consumed_at=now() WHERE id=$1', [challenge.id]);
      // A change of recovery destination invalidates outstanding reset links.
      await client.query("UPDATE identity_challenges SET revoked_at=now() WHERE user_id=$1 AND purpose='password_reset' AND consumed_at IS NULL AND revoked_at IS NULL", [challenge.user_id]);
      await this.audit(client, 'email.verified', challenge.user_id);
    });
  }
  public async forgotPassword(identifier: string) {
    this.requireEmail();
    const issued = await this.database.transaction(async (client) => {
      // No actor/target is recorded on a public recovery request, including unknowns.
      await this.audit(client, 'recovery.requested');
      const lookup = classifyIdentifier(identifier);
      let ids: string[];
      if (lookup.kind === 'email') {
        const result = await client.query<{ user_id: string }>("SELECT user_id FROM user_email_identities WHERE normalized_email=$1 AND state='verified'", [lookup.value]);
        ids = result.rows.map((row) => row.user_id);
      } else ids = await phoneUserIds(client, lookup.value);
      if (ids.length !== 1) return null;
      const userId = ids[0]!;
      await client.query('SELECT id FROM users WHERE id=$1 FOR UPDATE', [userId]);
      const email = await client.query<{ normalized_email: string }>("SELECT normalized_email FROM user_email_identities WHERE user_id=$1 AND state='verified'", [userId]);
      const recipient = email.rows[0]?.normalized_email;
      if (!recipient) return null;
      // A cooldown has the identical public response, not a target-dependent 429.
      const recent = await client.query("SELECT 1 FROM identity_challenges WHERE user_id=$1 AND purpose='password_reset' AND created_at>now()-interval '60 seconds' LIMIT 1", [userId]);
      if (recent.rowCount) return null;
      return { ...(await this.issue(client, 'password_reset', userId, null, null)), recipient };
    });
    // Public response is independent of recipient-specific SMTP latency/failure.
    // Bounded best-effort in-process delivery is not a durable mail queue. A
    // restart may lose delivery, never grant access; the user can safely retry.
    if (issued) {
      const delivery = this.deliver(issued.recipient, 'password_reset', issued)
        .catch(() => console.error('Account email completion unavailable'));
      this.deliveries.add(delivery);
      void delivery.finally(() => this.deliveries.delete(delivery));
    }
    return acceptedRecovery;
  }
  public async awaitPendingDeliveries(): Promise<void> { await Promise.all(this.deliveries); }
  public async resetPassword(raw: string, newPassword: string): Promise<void> {
    const password = requireNewPassword(newPassword);
    // Validate before expensive bcrypt, then revalidate atomically on commit.
    await this.inspectAction(raw, 'password_reset');
    const hash = await bcrypt.hash(password, 12);
    const userId = await this.database.transaction(async (client) => {
      const challenge = await this.challenge(client, raw, 'password_reset');
      await client.query('UPDATE users SET password_hash=$2,updated_at=now() WHERE id=$1', [challenge.user_id, hash]);
      await client.query('UPDATE identity_challenges SET consumed_at=now() WHERE id=$1', [challenge.id]);
      await client.query('UPDATE auth_sessions SET revoked_at=now(),updated_at=now() WHERE user_id=$1 AND revoked_at IS NULL', [challenge.user_id]);
      await this.audit(client, 'reset.completed', challenge.user_id);
      await this.audit(client, 'sessions.revoked', challenge.user_id);
      return challenge.user_id!;
    });
    this.disconnect(userId);
  }
  public async inspectAction(raw: string, purpose: Purpose) {
    return this.database.transaction(async (client) => {
      const row = await this.challenge(client, raw, purpose);
      if (purpose !== 'staff_invitation') return { valid: true };
      const invitation = await client.query<Invitation & { organization_name: string }>(`SELECT i.*,o.name AS organization_name FROM staff_invitations i JOIN organizations o ON o.id=i.organization_id WHERE i.id=$1`, [row.invitation_id]);
      const value = invitation.rows[0];
      if (!value || value.revoked_at || value.consumed_at || value.expires_at <= new Date()) throw invalidLink();
      return { valid: true, organizationName: value.organization_name, name: value.name, role: value.role };
    });
  }
  public async preferences(userId: string): Promise<Appearance> {
    const result = await this.database.query<{ theme_mode: Appearance['mode']; accent: string }>('SELECT theme_mode,accent FROM user_preferences WHERE user_id=$1', [userId]);
    return { mode: result.rows[0]?.theme_mode ?? 'light', primaryColor: result.rows[0]?.accent ?? '#4F46E5' };
  }
  public async savePreferences(userId: string, value: Appearance) {
    await this.database.query(`INSERT INTO user_preferences(user_id,theme_mode,accent) VALUES ($1,$2,$3)
      ON CONFLICT(user_id) DO UPDATE SET theme_mode=excluded.theme_mode,accent=excluded.accent,updated_at=now()`, [userId, value.mode, value.primaryColor]);
    return value;
  }
  public async listInvitations(context: AuthorizationContext) {
    const result = await this.database.query(`SELECT id,name,phone,email,role,expires_at,revoked_at,consumed_at,created_at FROM staff_invitations WHERE organization_id=$1 ORDER BY created_at DESC LIMIT 100`, [context.organizationId]);
    return result.rows;
  }
  public async createInvitation(context: AuthorizationContext, input: InvitationInput) {
    const phone = requirePhone(input.phone);
    const email = input.email ? normalizeEmail(input.email) : null;
    if (email) this.requireEmail();
    // Manual handoff must still use an operator-configured application origin.
    const publicUrl = this.email.publicUrl;
    if (!publicUrl) throw new AppError('APP_PUBLIC_URL is required for invitations', 503);
    const result = await this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [`invitation-sender:${context.organizationId}`]);
      const volume = await client.query("SELECT count(*)::int AS count FROM staff_invitations WHERE organization_id=$1 AND created_at>now()-interval '15 minutes'", [context.organizationId]);
      if (Number(volume.rows[0]?.count) >= 20) throw new AppError('Too many invitations for this organization; try again later', 429);
      await lockNewPhone(client, phone);
      if (email && (await client.query("SELECT 1 FROM user_email_identities WHERE normalized_email=$1 AND state <> 'replaced'", [email])).rowCount) throw new AppError('Identity already exists; authenticated account linking is not supported', 409);
      const branches = await client.query<{ id: string }>("SELECT id FROM branches WHERE organization_id=$1 AND status='active' AND id=ANY($2::uuid[]) FOR SHARE", [context.organizationId, input.branchIds]);
      if (!input.branchIds.length || branches.rowCount !== input.branchIds.length) throw new AppError('Select active branches from this organization', 400);
      const previous = await client.query<Invitation>('SELECT * FROM staff_invitations WHERE organization_id=$1 AND phone=$2 AND revoked_at IS NULL AND consumed_at IS NULL FOR UPDATE', [context.organizationId, phone]);
      if (previous.rows.some((row) => row.created_at > new Date(Date.now() - 60000))) throw new AppError('Wait a minute before replacing an invitation', 429);
      for (const row of previous.rows) {
        await client.query('UPDATE staff_invitations SET revoked_at=now() WHERE id=$1', [row.id]);
        await client.query('UPDATE identity_challenges SET revoked_at=now() WHERE invitation_id=$1 AND consumed_at IS NULL', [row.id]);
        await this.audit(client, 'invitation.replaced', context.userId, row.id);
      }
      const invitation = await client.query<{ id: string }>(`INSERT INTO staff_invitations(organization_id,actor_user_id,name,phone,email,role,expires_at) VALUES ($1,$2,$3,$4,$5,$6,now()+interval '48 hours') RETURNING id`, [context.organizationId, context.userId, input.name, phone, email, input.role]);
      const id = invitation.rows[0]!.id;
      for (const branchId of input.branchIds) await client.query('INSERT INTO staff_invitation_branches(invitation_id,organization_id,branch_id) VALUES ($1,$2,$3)', [id, context.organizationId, branchId]);
      const issued = await this.issue(client, 'staff_invitation', null, null, id);
      await this.audit(client, 'invitation.created', context.userId, id);
      return { ...issued, invitationId: id, url: `${publicUrl}/accept-invitation#token=${issued.raw}` };
    });
    if (email) {
      if (!(await this.deliver(email, 'staff_invitation', result, context.userId, result.invitationId))) throw new AppError('Email delivery unavailable; replace invitation after the cooldown', 503);
      return { id: result.invitationId, delivery: 'email' as const };
    }
    return { id: result.invitationId, delivery: 'manual' as const, handoffUrl: result.url };
  }
  public async revokeInvitation(context: AuthorizationContext, id: string): Promise<void> {
    await this.database.transaction(async (client) => {
      const result = await client.query('UPDATE staff_invitations SET revoked_at=now() WHERE id=$1 AND organization_id=$2 AND consumed_at IS NULL AND revoked_at IS NULL RETURNING id', [id, context.organizationId]);
      if (!result.rowCount) throw new AppError('Active invitation not found', 404);
      await client.query('UPDATE identity_challenges SET revoked_at=now() WHERE invitation_id=$1 AND consumed_at IS NULL', [id]);
      await this.audit(client, 'invitation.revoked', context.userId, id);
    });
  }
  public async acceptInvitation(raw: string, newPassword: string): Promise<void> {
    const password = requireNewPassword(newPassword);
    await this.inspectAction(raw, 'staff_invitation');
    const hash = await bcrypt.hash(password, 12);
    await this.database.transaction(async (client) => {
      // Phone advisory lock precedes invitation lock, matching replacement order.
      const preliminary = await client.query<Invitation>(`SELECT i.* FROM staff_invitations i JOIN identity_challenges c ON c.invitation_id=i.id WHERE c.secret_hash=$1 AND c.purpose='staff_invitation'`, [hashActionSecret(raw)]);
      if (!preliminary.rows[0]) throw invalidLink();
      await lockNewPhone(client, preliminary.rows[0].phone);
      const challenge = await this.challenge(client, raw, 'staff_invitation');
      const selected = await client.query<Invitation>('SELECT * FROM staff_invitations WHERE id=$1 FOR UPDATE', [challenge.invitation_id]);
      const invite = selected.rows[0];
      if (!invite || invite.revoked_at || invite.consumed_at || invite.expires_at <= new Date()) throw invalidLink();
      // Re-check issuer authority and assigned branches at acceptance, not only issuance.
      const actor = await client.query("SELECT 1 FROM memberships WHERE user_id=$1 AND organization_id=$2 AND status='active' AND role IN ('owner','admin') FOR SHARE", [invite.actor_user_id, invite.organization_id]);
      if (!actor.rowCount) throw invalidLink();
      const branches = await client.query<{ branch_id: string; status: string }>('SELECT a.branch_id,b.status FROM staff_invitation_branches a JOIN branches b ON b.id=a.branch_id WHERE a.invitation_id=$1 FOR SHARE OF b', [invite.id]);
      if (!branches.rowCount || branches.rows.some((row) => row.status !== 'active')) throw invalidLink();
      if (invite.email && (await client.query("SELECT 1 FROM user_email_identities WHERE normalized_email=$1 AND state <> 'replaced'", [invite.email])).rowCount) throw new AppError('Identity already exists; authenticated account linking is not supported', 409);
      const user = await client.query<{ id: string }>('INSERT INTO users(legacy_mongo_id,name,phone,password_hash,platform_role,created_at,updated_at) VALUES ($1,$2,$3,$4,NULL,now(),now()) RETURNING id', [generateLegacyMongoUserId(), invite.name, invite.phone, hash]);
      const userId = user.rows[0]!.id;
      // Possession of the email-delivered invitation proves mailbox control. Manual
      // invitations have no email and therefore cannot grant verified email identity.
      if (invite.email) await client.query("INSERT INTO user_email_identities(user_id,display_email,normalized_email,state,verified_at) VALUES ($1,$2,$2,'verified',now())", [userId, invite.email]);
      const membership = await client.query<{ id: string }>("INSERT INTO memberships(legacy_mongo_id,user_id,organization_id,role,status,created_at,updated_at) VALUES ($1,$2,$3,$4,'active',now(),now()) RETURNING id", [generateLegacyMongoMembershipId(), userId, invite.organization_id, invite.role]);
      for (const branch of branches.rows) await client.query('INSERT INTO membership_branch_assignments(membership_id,branch_id,organization_id) VALUES ($1,$2,$3)', [membership.rows[0]!.id, branch.branch_id, invite.organization_id]);
      await client.query('UPDATE staff_invitations SET consumed_at=now() WHERE id=$1', [invite.id]);
      await client.query('UPDATE identity_challenges SET consumed_at=now() WHERE id=$1', [challenge.id]);
      await this.audit(client, 'invitation.accepted', userId, invite.id);
    });
  }
}
