import type { PoolClient, QueryResultRow } from 'pg';
import { lockNewPhone, requirePhone } from '../services/identityPolicy.js';
import type {
  FinalizeAgreementInput,
  RecordManualPaymentInput,
} from '../schemas/manualCommercialSchemas.js';
import type { PublicCommercialQuote } from '../services/publicCommercialService.js';
import type {
  AgreementBundle,
  CommercialAgreementRecord,
  CustomerCommercialSummary,
  ManualCommercialRepository,
  ManualPaymentRecord,
  OnboardingInspection,
  OnboardingInvitationRecord,
  OnboardingProvisioningInput,
} from '../services/manualCommercialService.js';
import { AppError } from '../utils/AppError.js';
import type { PostgresDatabase } from './database.js';

interface AgreementRow extends QueryResultRow {
  id: string;
  access_request_id: string;
  organization_id: string | null;
  currency: 'INR';
  billing_cycle: 'monthly' | 'yearly';
  selected_plan_key: string | null;
  selected_add_on_keys: string[];
  list_subtotal_minor: string;
  list_pricing_snapshot: PublicCommercialQuote;
  agreed_total_minor: string;
  adjustment_reason: string | null;
  starts_at: Date;
  current_period_ends_at: Date;
  status: CommercialAgreementRecord['status'];
  billing_legal_name: string;
  billing_contact_name: string;
  billing_phone: string;
  billing_email: string | null;
  billing_address_line_1: string | null;
  billing_address_line_2: string | null;
  billing_city: string | null;
  billing_state: string | null;
  billing_postal_code: string | null;
  billing_gstin: string | null;
  finalized_by_user_id: string;
  finalized_at: Date;
  activated_at: Date | null;
  created_at: Date;
  updated_at: Date;
}

interface PaymentRow extends QueryResultRow {
  id: string;
  agreement_id: string;
  idempotency_key: string;
  amount_minor: string;
  currency: 'INR';
  method: ManualPaymentRecord['method'];
  reference_text: string | null;
  paid_at: Date;
  status: ManualPaymentRecord['status'];
  recorded_by_user_id: string;
  created_at: Date;
  voided_by_user_id: string | null;
  voided_at: Date | null;
  void_reason: string | null;
}

interface InvitationRow extends QueryResultRow {
  id: string;
  agreement_id: string;
  expires_at: Date;
  created_at: Date;
  revoked_at: Date | null;
  revocation_reason: string | null;
  consumed_at: Date | null;
}

interface FinalOfferRow extends QueryResultRow {
  offer_type: 'plan' | 'add_on';
  key: string;
  name: string;
  module_keys: string[];
  monthly_price_minor: string | null;
  yearly_price_minor: string | null;
  pricing_updated_at: Date;
}

interface ActiveOfferRow extends QueryResultRow {
  id: string;
  key: string;
  module_keys: string[];
}

const agreementSelect = `
  SELECT id, access_request_id, organization_id, currency, billing_cycle,
    selected_plan_key, selected_add_on_keys, list_subtotal_minor::text,
    list_pricing_snapshot, agreed_total_minor::text, adjustment_reason,
    starts_at, current_period_ends_at, status, billing_legal_name,
    billing_contact_name, billing_phone, billing_email, billing_address_line_1,
    billing_address_line_2, billing_city, billing_state, billing_postal_code,
    billing_gstin, finalized_by_user_id, finalized_at, activated_at, created_at, updated_at
  FROM commercial_agreements
`;

const paymentSelect = `
  SELECT id, agreement_id, idempotency_key, amount_minor::text, currency, method,
    reference_text, paid_at, status, recorded_by_user_id, created_at,
    voided_by_user_id, voided_at, void_reason
  FROM manual_commercial_payments
`;

const invitationSelect = `
  SELECT id, agreement_id, expires_at, created_at, revoked_at, revocation_reason, consumed_at
  FROM commercial_onboarding_invitations
`;

const projectAgreement = (row: AgreementRow): CommercialAgreementRecord => ({
  id: row.id,
  accessRequestId: row.access_request_id,
  organizationId: row.organization_id,
  currency: row.currency,
  billingCycle: row.billing_cycle,
  selectedPlanKey: row.selected_plan_key,
  selectedAddOnKeys: row.selected_add_on_keys,
  listSubtotalMinor: row.list_subtotal_minor,
  listPricingSnapshot: row.list_pricing_snapshot,
  agreedTotalMinor: row.agreed_total_minor,
  adjustmentReason: row.adjustment_reason,
  startsAt: row.starts_at,
  currentPeriodEndsAt: row.current_period_ends_at,
  status: row.status,
  billingProfile: {
    legalName: row.billing_legal_name,
    contactName: row.billing_contact_name,
    phone: row.billing_phone,
    email: row.billing_email,
    addressLine1: row.billing_address_line_1,
    addressLine2: row.billing_address_line_2,
    city: row.billing_city,
    state: row.billing_state,
    postalCode: row.billing_postal_code,
    gstin: row.billing_gstin,
  },
  finalizedByUserId: row.finalized_by_user_id,
  finalizedAt: row.finalized_at,
  activatedAt: row.activated_at,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const projectPayment = (row: PaymentRow): ManualPaymentRecord => ({
  id: row.id,
  agreementId: row.agreement_id,
  amountMinor: row.amount_minor,
  currency: row.currency,
  method: row.method,
  reference: row.reference_text,
  paidAt: row.paid_at,
  status: row.status,
  recordedByUserId: row.recorded_by_user_id,
  createdAt: row.created_at,
  voidedByUserId: row.voided_by_user_id,
  voidedAt: row.voided_at,
  voidReason: row.void_reason,
});

const projectInvitation = (row: InvitationRow): OnboardingInvitationRecord => ({
  id: row.id,
  agreementId: row.agreement_id,
  expiresAt: row.expires_at,
  createdAt: row.created_at,
  revokedAt: row.revoked_at,
  revocationReason: row.revocation_reason,
  consumedAt: row.consumed_at,
});

const requireOperator = async (client: PoolClient, actorUserId: string): Promise<void> => {
  const actor = await client.query<{ allowed: boolean }>(`
    SELECT EXISTS(
      SELECT 1 FROM users WHERE id = $1 AND platform_role = 'operator'
    ) AS allowed
  `, [actorUserId]);
  if (!actor.rows[0]?.allowed) throw new AppError('Platform operator access required', 403);
};

const loadBundle = async (client: PoolClient, agreementId: string): Promise<AgreementBundle> => {
  const agreement = await client.query<AgreementRow>(
    `${agreementSelect} WHERE id = $1`,
    [agreementId],
  );
  const payments = await client.query<PaymentRow>(
    `${paymentSelect} WHERE agreement_id = $1 ORDER BY created_at, id`,
    [agreementId],
  );
  const invitations = await client.query<InvitationRow>(
    `${invitationSelect} WHERE agreement_id = $1 ORDER BY created_at DESC, id DESC`,
    [agreementId],
  );
  const row = agreement.rows[0];
  if (!row) throw new AppError('Commercial agreement not found', 404);
  const projectedPayments = payments.rows.map(projectPayment);
  const confirmedTotal = projectedPayments
    .filter(({ status }) => status === 'confirmed')
    .reduce((total, payment) => total + BigInt(payment.amountMinor), 0n);
  return {
    agreement: projectAgreement(row),
    payments: projectedPayments,
    invitations: invitations.rows.map(projectInvitation),
    confirmedTotalMinor: confirmedTotal.toString(),
    settlementSatisfied: confirmedTotal === BigInt(row.agreed_total_minor),
  };
};

const loadFinalQuote = async (
  client: PoolClient,
  input: Pick<FinalizeAgreementInput, 'billingCycle' | 'planKey' | 'addOnKeys'>,
  calculatedAt: Date,
): Promise<PublicCommercialQuote> => {
  if (new Set(input.addOnKeys).size !== input.addOnKeys.length) {
    throw new AppError('Duplicate add-ons are not allowed', 400);
  }
  const selected: FinalOfferRow[] = [];
  if (input.planKey) {
    const plan = await client.query<FinalOfferRow>(`
      SELECT 'plan'::text AS offer_type, p.key, p.name,
        ARRAY(
          SELECT m.key FROM plan_modules pm
          JOIN module_definitions m ON m.id = pm.module_definition_id
          WHERE pm.plan_id = p.id ORDER BY m.key
        ) AS module_keys,
        pr.monthly_price_minor::text, pr.yearly_price_minor::text,
        pr.updated_at AS pricing_updated_at
      FROM plans p
      JOIN public_offer_pricing pr ON pr.plan_id = p.id
      WHERE p.key = $1 AND p.status = 'active' AND p.available = TRUE AND pr.published = TRUE
      FOR SHARE OF p, pr
    `, [input.planKey]);
    if (!plan.rows[0]) throw new AppError('Selected plan is missing, unavailable, or unpublished', 400);
    selected.push(plan.rows[0]);
  }
  if (input.addOnKeys.length > 0) {
    const addOns = await client.query<FinalOfferRow>(`
      SELECT 'add_on'::text AS offer_type, a.key, a.name,
        ARRAY(
          SELECT m.key FROM add_on_modules am
          JOIN module_definitions m ON m.id = am.module_definition_id
          WHERE am.add_on_id = a.id ORDER BY m.key
        ) AS module_keys,
        pr.monthly_price_minor::text, pr.yearly_price_minor::text,
        pr.updated_at AS pricing_updated_at
      FROM add_ons a
      JOIN public_offer_pricing pr ON pr.add_on_id = a.id
      WHERE a.key = ANY($1::text[]) AND a.status = 'active'
        AND a.available = TRUE AND pr.published = TRUE
      ORDER BY a.key
      FOR SHARE OF a, pr
    `, [input.addOnKeys]);
    if (addOns.rows.length !== input.addOnKeys.length) {
      throw new AppError('One or more add-ons are missing, unavailable, or unpublished', 400);
    }
    selected.push(...addOns.rows);
  }
  if (selected.length === 0) throw new AppError('Select at least one offer', 400);

  const claimedModules = new Set<string>();
  const items = selected.map((offer) => {
    for (const moduleKey of offer.module_keys) {
      if (claimedModules.has(moduleKey)) {
        throw new AppError('Selected offers contain overlapping modules', 400);
      }
      claimedModules.add(moduleKey);
    }
    const amount = input.billingCycle === 'monthly'
      ? offer.monthly_price_minor
      : offer.yearly_price_minor;
    if (amount === null) throw new AppError('Selected billing cycle is unavailable', 400);
    return {
      offerType: offer.offer_type,
      key: offer.key,
      name: offer.name,
      priceMinor: amount,
      pricingUpdatedAt: offer.pricing_updated_at.toISOString(),
    };
  }).sort((left, right) =>
    left.offerType.localeCompare(right.offerType) || left.key.localeCompare(right.key));

  return {
    billingCycle: input.billingCycle,
    currency: 'INR',
    subtotalMinor: items.reduce((total, item) => total + BigInt(item.priceMinor), 0n).toString(),
    calculatedAt: calculatedAt.toISOString(),
    items,
  };
};

const loadActiveSelections = async (
  client: PoolClient,
  planKey: string | null,
  addOnKeys: string[],
): Promise<{ planId: string | null; addOns: ActiveOfferRow[] }> => {
  const plan = planKey
    ? await client.query<ActiveOfferRow>(`
        SELECT p.id, p.key,
          ARRAY(
            SELECT m.key FROM plan_modules pm
            JOIN module_definitions m ON m.id = pm.module_definition_id
            WHERE pm.plan_id = p.id ORDER BY m.key
          ) AS module_keys
        FROM plans p
        WHERE p.key = $1 AND p.status = 'active' AND p.available = TRUE
      `, [planKey])
    : { rows: [] as ActiveOfferRow[] };
  if (planKey && !plan.rows[0]) {
    throw new AppError('Finalized plan is no longer available; operator resolution is required', 409);
  }
  const addOns = addOnKeys.length > 0
    ? await client.query<ActiveOfferRow>(`
        SELECT a.id, a.key,
          ARRAY(
            SELECT m.key FROM add_on_modules am
            JOIN module_definitions m ON m.id = am.module_definition_id
            WHERE am.add_on_id = a.id ORDER BY m.key
          ) AS module_keys
        FROM add_ons a
        WHERE a.key = ANY($1::text[]) AND a.status = 'active' AND a.available = TRUE
        ORDER BY a.key
      `, [addOnKeys])
    : { rows: [] as ActiveOfferRow[] };
  if (addOns.rows.length !== addOnKeys.length) {
    throw new AppError('A finalized add-on is no longer available; operator resolution is required', 409);
  }
  const claimedModules = new Set<string>();
  for (const offer of [...plan.rows, ...addOns.rows]) {
    for (const moduleKey of offer.module_keys) {
      if (claimedModules.has(moduleKey)) {
        throw new AppError('Finalized offers are no longer compatible; operator resolution is required', 409);
      }
      claimedModules.add(moduleKey);
    }
  }
  return { planId: plan.rows[0]?.id ?? null, addOns: addOns.rows };
};

export class PostgresManualCommercialRepository implements ManualCommercialRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public createAgreement(
    accessRequestId: string,
    actorUserId: string,
    input: FinalizeAgreementInput,
    normalizedBillingPhone: string,
  ): Promise<AgreementBundle> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const request = await client.query<{ status: string }>(`
        SELECT status FROM commercial_access_requests WHERE id = $1 FOR UPDATE
      `, [accessRequestId]);
      if (!request.rows[0]) throw new AppError('Access request not found', 404);
      if (request.rows[0].status !== 'approved') {
        throw new AppError('Only an approved access request can be finalized', 409);
      }
      const existing = await client.query<{ id: string }>(`
        SELECT id FROM commercial_agreements WHERE access_request_id = $1
      `, [accessRequestId]);
      if (existing.rows[0]) throw new AppError('An agreement already exists for this request', 409);

      const now = new Date();
      const quote = await loadFinalQuote(client, input, now);
      if (input.agreedTotalMinor !== quote.subtotalMinor && !input.adjustmentReason) {
        throw new AppError('A negotiated price adjustment requires a reason', 400);
      }
      if (input.agreedTotalMinor === '0' && !input.adjustmentReason) {
        throw new AppError('A complimentary agreement requires a reason', 400);
      }
      const profile = input.billingProfile;
      const inserted = await client.query<{ id: string }>(`
        INSERT INTO commercial_agreements
          (access_request_id, currency, billing_cycle, selected_plan_key,
           selected_add_on_keys, list_subtotal_minor, list_pricing_snapshot,
           agreed_total_minor, adjustment_reason, starts_at, current_period_ends_at,
           status, billing_legal_name, billing_contact_name, billing_phone,
           billing_email, billing_address_line_1, billing_address_line_2,
           billing_city, billing_state, billing_postal_code, billing_gstin,
           finalized_by_user_id, finalized_at, created_at, updated_at)
        VALUES
          ($1, 'INR', $2, $3, $4, $5, $6::jsonb, $7, $8, $9, $10,
           $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21, $22, $23, $23, $23)
        RETURNING id
      `, [
        accessRequestId,
        input.billingCycle,
        input.planKey ?? null,
        [...input.addOnKeys].sort(),
        quote.subtotalMinor,
        JSON.stringify(quote),
        input.agreedTotalMinor,
        input.adjustmentReason ?? null,
        new Date(input.startsAt),
        new Date(input.currentPeriodEndsAt),
        input.agreedTotalMinor === '0' ? 'paid' : 'awaiting_payment',
        profile.legalName,
        profile.contactName,
        normalizedBillingPhone,
        profile.email?.toLocaleLowerCase('en-US') ?? null,
        profile.addressLine1 ?? null,
        profile.addressLine2 ?? null,
        profile.city ?? null,
        profile.state ?? null,
        profile.postalCode ?? null,
        profile.gstin ?? null,
        actorUserId,
        now,
      ]);
      const agreementId = inserted.rows[0]!.id;
      await client.query(`
        INSERT INTO commercial_activation_events
          (agreement_id, actor_user_id, action, details, occurred_at)
        VALUES ($1, $2, 'agreement_finalized', $3::jsonb, $4)
      `, [agreementId, actorUserId, JSON.stringify({
        billingCycle: input.billingCycle,
        listSubtotalMinor: quote.subtotalMinor,
        agreedTotalMinor: input.agreedTotalMinor,
        adjusted: input.agreedTotalMinor !== quote.subtotalMinor,
      }), now]);
      return loadBundle(client, agreementId);
    });
  }

  public getAgreementForRequest(
    accessRequestId: string,
    actorUserId: string,
  ): Promise<AgreementBundle | null> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const agreement = await client.query<{ id: string }>(`
        SELECT id FROM commercial_agreements WHERE access_request_id = $1
      `, [accessRequestId]);
      return agreement.rows[0] ? loadBundle(client, agreement.rows[0].id) : null;
    });
  }

  public recordPayment(
    agreementId: string,
    actorUserId: string,
    input: RecordManualPaymentInput,
  ): Promise<AgreementBundle> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const agreement = await client.query<AgreementRow>(
        `${agreementSelect} WHERE id = $1 FOR UPDATE`,
        [agreementId],
      );
      const row = agreement.rows[0];
      if (!row) throw new AppError('Commercial agreement not found', 404);

      const retry = await client.query<PaymentRow>(`
        ${paymentSelect} WHERE agreement_id = $1 AND idempotency_key = $2
      `, [agreementId, input.idempotencyKey]);
      if (retry.rows[0]) {
        const existing = retry.rows[0];
        if (
          existing.amount_minor !== input.amountMinor
          || existing.method !== input.method
          || existing.reference_text !== (input.reference ?? null)
          || existing.paid_at.toISOString() !== new Date(input.paidAt).toISOString()
        ) throw new AppError('Payment idempotency key was already used with different values', 409);
        return loadBundle(client, agreementId);
      }
      if (!['awaiting_payment', 'paid'].includes(row.status)) {
        throw new AppError('Agreement is not accepting payments', 409);
      }
      if (BigInt(row.agreed_total_minor) === 0n) {
        throw new AppError('Complimentary agreements do not accept payment records', 409);
      }
      const total = await client.query<{ total: string }>(`
        SELECT COALESCE(SUM(amount_minor) FILTER (WHERE status = 'confirmed'), 0)::text AS total
        FROM manual_commercial_payments WHERE agreement_id = $1
      `, [agreementId]);
      const nextTotal = BigInt(total.rows[0]?.total ?? '0') + BigInt(input.amountMinor);
      const agreed = BigInt(row.agreed_total_minor);
      if (nextTotal > agreed) throw new AppError('Payment would exceed the exact agreed total', 409);

      const now = new Date();
      const payment = await client.query<{ id: string }>(`
        INSERT INTO manual_commercial_payments
          (agreement_id, idempotency_key, amount_minor, currency, method,
           reference_text, paid_at, status, recorded_by_user_id, created_at)
        VALUES ($1, $2, $3, 'INR', $4, $5, $6, 'confirmed', $7, $8)
        RETURNING id
      `, [agreementId, input.idempotencyKey, input.amountMinor, input.method,
        input.reference ?? null, new Date(input.paidAt), actorUserId, now]);
      await client.query(`
        UPDATE commercial_agreements SET status = $2, updated_at = $3 WHERE id = $1
      `, [agreementId, nextTotal === agreed ? 'paid' : 'awaiting_payment', now]);
      await client.query(`
        INSERT INTO commercial_activation_events
          (agreement_id, actor_user_id, action, details, occurred_at)
        VALUES ($1, $2, 'payment_recorded', $3::jsonb, $4)
      `, [agreementId, actorUserId, JSON.stringify({
        paymentId: payment.rows[0]!.id,
        amountMinor: input.amountMinor,
        method: input.method,
        confirmedTotalMinor: nextTotal.toString(),
      }), now]);
      return loadBundle(client, agreementId);
    });
  }

  public voidPayment(
    agreementId: string,
    paymentId: string,
    actorUserId: string,
    reason: string,
  ): Promise<AgreementBundle> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const agreement = await client.query<AgreementRow>(
        `${agreementSelect} WHERE id = $1 FOR UPDATE`,
        [agreementId],
      );
      const row = agreement.rows[0];
      if (!row) throw new AppError('Commercial agreement not found', 404);
      if (!['awaiting_payment', 'paid'].includes(row.status)) {
        throw new AppError('Payment cannot be voided after onboarding begins', 409);
      }
      const payment = await client.query<PaymentRow>(`
        ${paymentSelect} WHERE id = $1 AND agreement_id = $2 FOR UPDATE
      `, [paymentId, agreementId]);
      if (!payment.rows[0]) throw new AppError('Manual payment not found', 404);
      if (payment.rows[0].status !== 'confirmed') throw new AppError('Manual payment is already void', 409);

      const now = new Date();
      await client.query(`
        UPDATE manual_commercial_payments
        SET status = 'void', voided_by_user_id = $3, voided_at = $4, void_reason = $5
        WHERE id = $1 AND agreement_id = $2
      `, [paymentId, agreementId, actorUserId, now, reason]);
      const total = await client.query<{ total: string }>(`
        SELECT COALESCE(SUM(amount_minor) FILTER (WHERE status = 'confirmed'), 0)::text AS total
        FROM manual_commercial_payments WHERE agreement_id = $1
      `, [agreementId]);
      const confirmedTotal = total.rows[0]?.total ?? '0';
      await client.query(`
        UPDATE commercial_agreements
        SET status = $2, updated_at = $3 WHERE id = $1
      `, [agreementId,
        BigInt(confirmedTotal) === BigInt(row.agreed_total_minor) ? 'paid' : 'awaiting_payment',
        now]);
      await client.query(`
        INSERT INTO commercial_activation_events
          (agreement_id, actor_user_id, action, details, occurred_at)
        VALUES ($1, $2, 'payment_voided', $3::jsonb, $4)
      `, [agreementId, actorUserId, JSON.stringify({ paymentId, confirmedTotalMinor: confirmedTotal }), now]);
      return loadBundle(client, agreementId);
    });
  }

  public createInvitation(
    agreementId: string,
    actorUserId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<OnboardingInvitationRecord> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const agreement = await client.query<AgreementRow>(
        `${agreementSelect} WHERE id = $1 FOR UPDATE`,
        [agreementId],
      );
      const row = agreement.rows[0];
      if (!row) throw new AppError('Commercial agreement not found', 404);
      if (!['paid', 'onboarding_pending'].includes(row.status)) {
        throw new AppError('Agreement must be exactly settled before onboarding', 409);
      }
      const request = await client.query<{ status: string }>(`
        SELECT status FROM commercial_access_requests WHERE id = $1 FOR UPDATE
      `, [row.access_request_id]);
      if (request.rows[0]?.status !== 'approved') {
        throw new AppError('Access request must remain approved before onboarding', 409);
      }
      const total = await client.query<{ total: string }>(`
        SELECT COALESCE(SUM(amount_minor) FILTER (WHERE status = 'confirmed'), 0)::text AS total
        FROM manual_commercial_payments WHERE agreement_id = $1
      `, [agreementId]);
      if (BigInt(total.rows[0]?.total ?? '0') !== BigInt(row.agreed_total_minor)) {
        throw new AppError('Confirmed payments must exactly equal the agreed total', 409);
      }
      await loadActiveSelections(client, row.selected_plan_key, row.selected_add_on_keys);

      const now = new Date();
      const previous = await client.query<{ id: string }>(`
        SELECT id FROM commercial_onboarding_invitations
        WHERE agreement_id = $1 AND revoked_at IS NULL AND consumed_at IS NULL
        FOR UPDATE
      `, [agreementId]);
      if (previous.rows[0]) {
        await client.query(`
          UPDATE commercial_onboarding_invitations
          SET revoked_by_user_id = $2, revoked_at = $3,
              revocation_reason = 'Replaced by a new onboarding invitation'
          WHERE id = $1
        `, [previous.rows[0].id, actorUserId, now]);
        await client.query(`
          INSERT INTO commercial_activation_events
            (agreement_id, actor_user_id, action, details, occurred_at)
          VALUES ($1, $2, 'invitation_replaced', $3::jsonb, $4)
        `, [agreementId, actorUserId, JSON.stringify({ invitationId: previous.rows[0].id }), now]);
      }
      const inserted = await client.query<InvitationRow>(`
        INSERT INTO commercial_onboarding_invitations
          (agreement_id, token_hash, expires_at, created_by_user_id, created_at)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING id, agreement_id, expires_at, created_at,
          revoked_at, revocation_reason, consumed_at
      `, [agreementId, tokenHash, expiresAt, actorUserId, now]);
      await client.query(`
        UPDATE commercial_agreements SET status = 'onboarding_pending', updated_at = $2
        WHERE id = $1
      `, [agreementId, now]);
      await client.query(`
        INSERT INTO commercial_activation_events
          (agreement_id, actor_user_id, action, details, occurred_at)
        VALUES ($1, $2, 'invitation_created', $3::jsonb, $4)
      `, [agreementId, actorUserId, JSON.stringify({
        invitationId: inserted.rows[0]!.id,
        expiresAt: expiresAt.toISOString(),
      }), now]);
      return projectInvitation(inserted.rows[0]!);
    });
  }

  public revokeInvitation(
    agreementId: string,
    invitationId: string,
    actorUserId: string,
    reason: string,
  ): Promise<AgreementBundle> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const agreement = await client.query<AgreementRow>(
        `${agreementSelect} WHERE id = $1 FOR UPDATE`,
        [agreementId],
      );
      if (!agreement.rows[0]) throw new AppError('Commercial agreement not found', 404);
      if (agreement.rows[0].status !== 'onboarding_pending') {
        throw new AppError('Agreement has no revocable onboarding invitation', 409);
      }
      const now = new Date();
      const revoked = await client.query(`
        UPDATE commercial_onboarding_invitations
        SET revoked_by_user_id = $3, revoked_at = $4, revocation_reason = $5
        WHERE id = $1 AND agreement_id = $2 AND revoked_at IS NULL AND consumed_at IS NULL
      `, [invitationId, agreementId, actorUserId, now, reason]);
      if (revoked.rowCount !== 1) throw new AppError('Active onboarding invitation not found', 404);
      await client.query(`
        UPDATE commercial_agreements SET status = 'paid', updated_at = $2 WHERE id = $1
      `, [agreementId, now]);
      await client.query(`
        INSERT INTO commercial_activation_events
          (agreement_id, actor_user_id, action, details, occurred_at)
        VALUES ($1, $2, 'invitation_revoked', $3::jsonb, $4)
      `, [agreementId, actorUserId, JSON.stringify({ invitationId }), now]);
      return loadBundle(client, agreementId);
    });
  }

  public async inspectInvitation(tokenHash: string, now: Date): Promise<OnboardingInspection> {
    const result = await this.database.query<{
      business_name: string;
      contact_name: string;
      billing_cycle: 'monthly' | 'yearly';
      plan_name: string | null;
      add_on_names: string[];
      starts_at: Date;
      current_period_ends_at: Date;
      expires_at: Date;
      agreement_status: string;
      revoked_at: Date | null;
      consumed_at: Date | null;
    }>(`
      SELECT r.business_name, r.contact_name, a.billing_cycle, p.name AS plan_name,
        ARRAY(
          SELECT ao.name FROM add_ons ao
          WHERE ao.key = ANY(a.selected_add_on_keys) ORDER BY ao.key
        ) AS add_on_names,
        a.starts_at, a.current_period_ends_at, i.expires_at,
        a.status AS agreement_status, i.revoked_at, i.consumed_at
      FROM commercial_onboarding_invitations i
      JOIN commercial_agreements a ON a.id = i.agreement_id
      JOIN commercial_access_requests r ON r.id = a.access_request_id
      LEFT JOIN plans p ON p.key = a.selected_plan_key
      WHERE i.token_hash = $1
    `, [tokenHash]);
    const row = result.rows[0];
    if (
      !row
      || row.revoked_at
      || row.consumed_at
      || row.expires_at <= now
      || row.agreement_status !== 'onboarding_pending'
    ) throw new AppError('Onboarding invitation is invalid, expired, used, or revoked', 410);
    return {
      businessName: row.business_name,
      adminDisplayName: row.contact_name,
      billingCycle: row.billing_cycle,
      planName: row.plan_name,
      addOnNames: row.add_on_names,
      periodStartsAt: row.starts_at,
      periodEndsAt: row.current_period_ends_at,
      expiresAt: row.expires_at,
    };
  }

  public completeOnboarding(
    input: OnboardingProvisioningInput,
  ): Promise<{ businessName: string }> {
    return this.database.transaction(async (client) => {
      const locked = await client.query<AgreementRow & {
        invitation_id: string;
        expires_at: Date;
        revoked_at: Date | null;
        consumed_at: Date | null;
        request_status: string;
        business_name: string;
        business_type: string;
        contact_name: string;
        normalized_phone: string;
        contact_email: string | null;
      }>(`
        SELECT a.*, a.list_subtotal_minor::text, a.agreed_total_minor::text,
          i.id AS invitation_id, i.expires_at, i.revoked_at, i.consumed_at,
          r.status AS request_status, r.business_name, r.business_type,
          r.contact_name, r.normalized_phone, r.email AS contact_email
        FROM commercial_onboarding_invitations i
        JOIN commercial_agreements a ON a.id = i.agreement_id
        JOIN commercial_access_requests r ON r.id = a.access_request_id
        WHERE i.token_hash = $1
        FOR UPDATE OF i, a, r
      `, [input.tokenHash]);
      const row = locked.rows[0];
      if (
        !row
        || row.revoked_at
        || row.consumed_at
        || row.expires_at <= input.now
        || row.status !== 'onboarding_pending'
      ) throw new AppError('Onboarding invitation is invalid, expired, used, or revoked', 410);
      if (row.request_status !== 'approved') throw new AppError('Access request is not approved', 409);
      if (row.organization_id) throw new AppError('Agreement is already activated', 409);

      const total = await client.query<{ total: string }>(`
        SELECT COALESCE(SUM(amount_minor) FILTER (WHERE status = 'confirmed'), 0)::text AS total
        FROM manual_commercial_payments WHERE agreement_id = $1
      `, [row.id]);
      if (BigInt(total.rows[0]?.total ?? '0') !== BigInt(row.agreed_total_minor)) {
        throw new AppError('Agreement is not exactly settled', 409);
      }

      row.normalized_phone = requirePhone(row.normalized_phone);
      await lockNewPhone(client, row.normalized_phone, 'This phone already belongs to an EkaVio user; operator resolution is required');
      const timezone = await client.query<{ valid: boolean }>(`
        SELECT ekavio_is_valid_iana_timezone($1) AS valid
      `, [input.timezone]);
      if (!timezone.rows[0]?.valid) throw new AppError('Timezone must be a valid IANA timezone', 400);

      const activeSelections = await loadActiveSelections(
        client,
        row.selected_plan_key,
        row.selected_add_on_keys,
      );

      const organization = await client.query<{ id: string }>(`
        INSERT INTO organizations
          (legacy_mongo_id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
        VALUES ($1, $2, $3, 'light', '#4F46E5', $4, $4)
        RETURNING id
      `, [input.legacyIds.organization, row.business_name, row.business_type, input.now]);
      const organizationId = organization.rows[0]!.id;
      const user = await client.query<{ id: string }>(`
        INSERT INTO users
          (legacy_mongo_id, name, phone, password_hash, platform_role, created_at, updated_at)
        VALUES ($1, $2, $3, $4, NULL, $5, $5)
        RETURNING id
      `, [input.legacyIds.user, row.contact_name, row.normalized_phone, input.passwordHash, input.now]);
      const userId = user.rows[0]!.id;
      // Operator-entered/contact email is not proof of mailbox control. Preserve
      // it only as pending; the owner must explicitly verify through Settings.
      const ownerEmail = input.ownerEmail ?? row.contact_email;
      if (ownerEmail) {
        const email = ownerEmail.trim().toLowerCase();
        if ((await client.query("SELECT 1 FROM user_email_identities WHERE normalized_email=$1 AND state <> 'replaced'", [email])).rowCount) {
          throw new AppError('Email identity already exists; operator resolution is required', 409);
        }
        await client.query("INSERT INTO user_email_identities(user_id,display_email,normalized_email,state) VALUES ($1,$2,$3,'pending')", [userId, ownerEmail.trim(), email]);
      }
      const branch = await client.query<{ id: string }>(`
        INSERT INTO branches
          (legacy_mongo_id, organization_id, name, code, status, timezone, created_at, updated_at)
        VALUES ($1, $2, 'Main', 'main', 'active', $3, $4, $4)
        RETURNING id
      `, [input.legacyIds.branch, organizationId, input.timezone, input.now]);
      const membership = await client.query<{ id: string }>(`
        INSERT INTO memberships
          (legacy_mongo_id, user_id, organization_id, role, status, created_at, updated_at)
        VALUES ($1, $2, $3, 'owner', 'active', $4, $4)
        RETURNING id
      `, [input.legacyIds.membership, userId, organizationId, input.now]);
      await client.query(`
        INSERT INTO membership_branch_assignments (membership_id, branch_id, organization_id)
        VALUES ($1, $2, $3)
      `, [membership.rows[0]!.id, branch.rows[0]!.id, organizationId]);

      await client.query(`
        INSERT INTO organization_billing_profiles
          (organization_id, agreement_id, legal_name, contact_name, phone, email,
           address_line_1, address_line_2, city, state, postal_code, gstin, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $13)
      `, [organizationId, row.id, row.billing_legal_name, row.billing_contact_name,
        row.billing_phone, row.billing_email, row.billing_address_line_1,
        row.billing_address_line_2, row.billing_city, row.billing_state,
        row.billing_postal_code, row.billing_gstin, input.now]);

      const subscription = await client.query<{ id: string }>(`
        INSERT INTO subscriptions
          (organization_id, plan_id, status, source, starts_at, current_period_ends_at,
           billing_cycle, created_by_user_id, updated_by_user_id, created_at, updated_at)
        VALUES ($1, $2, 'active', 'manual', $3, $4, $5, $6, $6, $7, $7)
        RETURNING id
      `, [organizationId, activeSelections.planId, row.starts_at,
        row.current_period_ends_at, row.billing_cycle, row.finalized_by_user_id, input.now]);
      const addOnIdByKey = new Map(
        activeSelections.addOns.map((addOn) => [addOn.key, addOn.id]),
      );
      for (const key of row.selected_add_on_keys) {
        await client.query(`
          INSERT INTO subscription_add_ons
            (subscription_id, add_on_id, starts_at, ends_at)
          VALUES ($1, $2, $3, $4)
        `, [subscription.rows[0]!.id, addOnIdByKey.get(key), row.starts_at, row.current_period_ends_at]);
      }

      await client.query(`
        UPDATE commercial_onboarding_invitations
        SET consumed_at = $2, consumed_user_id = $3, consumed_organization_id = $4
        WHERE id = $1
      `, [row.invitation_id, input.now, userId, organizationId]);
      await client.query(`
        UPDATE commercial_agreements
        SET organization_id = $2, status = 'activated', activated_at = $3, updated_at = $3
        WHERE id = $1
      `, [row.id, organizationId, input.now]);
      await client.query(`
        UPDATE commercial_access_requests SET status = 'activated', updated_at = $2 WHERE id = $1
      `, [row.access_request_id, input.now]);
      await client.query(`
        INSERT INTO commercial_access_request_events
          (access_request_id, actor_user_id, action, from_status, to_status, details, occurred_at)
        VALUES ($1, $2, 'status_changed', 'approved', 'activated', $3::jsonb, $4)
      `, [row.access_request_id, row.finalized_by_user_id,
        JSON.stringify({ source: 'commercial_onboarding' }), input.now]);
      for (const [action, actorUserId] of [
        ['onboarding_completed', userId],
        ['organization_provisioned', row.finalized_by_user_id],
        ['subscription_activated', row.finalized_by_user_id],
      ] as const) {
        await client.query(`
          INSERT INTO commercial_activation_events
            (agreement_id, actor_user_id, action, details, occurred_at)
          VALUES ($1, $2, $3, '{}'::jsonb, $4)
        `, [row.id, actorUserId, action, input.now]);
      }
      return { businessName: row.business_name };
    });
  }

  public async getCustomerCommercialSummary(
    organizationId: string,
  ): Promise<CustomerCommercialSummary | null> {
    const agreement = await this.database.query<AgreementRow>(`
      ${agreementSelect} WHERE organization_id = $1 AND status = 'activated'
    `, [organizationId]);
    const row = agreement.rows[0];
    if (!row) return null;
    const payments = await this.database.query<PaymentRow>(`
      ${paymentSelect} WHERE agreement_id = $1 ORDER BY paid_at, id
    `, [row.id]);
    return {
      agreement: {
        currency: row.currency,
        billingCycle: row.billing_cycle,
        selectedPlanKey: row.selected_plan_key,
        selectedAddOnKeys: row.selected_add_on_keys,
        agreedTotalMinor: row.agreed_total_minor,
        startsAt: row.starts_at,
        currentPeriodEndsAt: row.current_period_ends_at,
        status: row.status,
      },
      payments: payments.rows.map(projectPayment).map((payment) => ({
        amountMinor: payment.amountMinor,
        currency: payment.currency,
        method: payment.method,
        reference: payment.reference,
        paidAt: payment.paidAt,
        status: payment.status,
      })),
      billingProfile: projectAgreement(row).billingProfile,
    };
  }
}
