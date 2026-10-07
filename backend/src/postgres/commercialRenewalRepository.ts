import type { PoolClient, QueryResultRow } from 'pg';
import type {
  CommercialRenewalQueueView,
  FinalizeCommercialRenewalInput,
  RecordRenewalPaymentInput,
} from '../schemas/commercialRenewalSchemas.js';
import type {
  CommercialRenewalBundle,
  CommercialRenewalPreview,
  CommercialRenewalRecord,
  CommercialRenewalRepository,
  OperatorRenewalQueueRecord,
  RenewalListPricingSnapshot,
  RenewalPackageSnapshot,
  RenewalPaymentRecord,
} from '../services/commercialRenewalService.js';
import { AppError } from '../utils/AppError.js';
import type { PostgresDatabase } from './database.js';

interface RenewalRow extends QueryResultRow {
  id: string;
  organization_id: string;
  subscription_id: string;
  renewal_kind: CommercialRenewalRecord['renewalKind'];
  currency: 'INR';
  billing_cycle: CommercialRenewalRecord['billingCycle'];
  selected_plan_key: string | null;
  selected_add_on_keys: string[];
  package_snapshot: RenewalPackageSnapshot;
  list_subtotal_minor: string | null;
  list_pricing_snapshot: RenewalListPricingSnapshot;
  agreed_total_minor: string;
  adjustment_reason: string | null;
  prior_period_starts_at: Date;
  prior_period_ends_at: Date;
  renewal_starts_at: Date;
  renewal_ends_at: Date;
  status: CommercialRenewalRecord['status'];
  created_by_user_id: string;
  finalized_by_user_id: string;
  applied_by_user_id: string | null;
  cancelled_by_user_id: string | null;
  finalized_at: Date;
  applied_at: Date | null;
  cancelled_at: Date | null;
  cancellation_reason: string | null;
  created_at: Date;
  updated_at: Date;
}

interface RenewalPaymentRow extends QueryResultRow {
  id: string;
  renewal_id: string;
  idempotency_key: string;
  amount_minor: string;
  currency: 'INR';
  method: RenewalPaymentRecord['method'];
  reference_text: string | null;
  paid_at: Date;
  status: RenewalPaymentRecord['status'];
  recorded_by_user_id: string;
  created_at: Date;
  voided_by_user_id: string | null;
  voided_at: Date | null;
  void_reason: string | null;
}

interface SubscriptionRow extends QueryResultRow {
  id: string;
  organization_id: string;
  organization_name: string;
  status: string;
  starts_at: Date;
  current_period_ends_at: Date | null;
  billing_cycle: 'monthly' | 'yearly' | null;
  plan_id: string | null;
  plan_key: string | null;
  plan_name: string | null;
  plan_status: string | null;
  plan_module_keys: string[];
  plan_monthly_price_minor: string | null;
  plan_yearly_price_minor: string | null;
  plan_pricing_published: boolean | null;
  plan_pricing_updated_at: Date | null;
}

interface SubscriptionAddOnRow extends QueryResultRow {
  id: string;
  key: string;
  name: string;
  status: string;
  module_keys: string[];
  monthly_price_minor: string | null;
  yearly_price_minor: string | null;
  pricing_published: boolean | null;
  pricing_updated_at: Date | null;
}

interface QueueRow extends QueryResultRow {
  add_on_names: string[];
  organization_id: string;
  organization_name: string;
  subscription_id: string;
  subscription_status: string;
  billing_cycle: 'monthly' | 'yearly' | null;
  plan_key: string | null;
  plan_name: string | null;
  add_on_keys: string[];
  current_period_starts_at: Date;
  current_period_ends_at: Date | null;
  renewal_id: string | null;
  renewal_status: CommercialRenewalRecord['status'] | null;
  renewal_kind: CommercialRenewalRecord['renewalKind'] | null;
  renewal_starts_at: Date | null;
  renewal_ends_at: Date | null;
  renewal_applied_at: Date | null;
  total_count: string;
}

const renewalSelect = `
  SELECT id, organization_id, subscription_id, renewal_kind, currency, billing_cycle,
    selected_plan_key, selected_add_on_keys, package_snapshot,
    list_subtotal_minor::text, list_pricing_snapshot, agreed_total_minor::text,
    adjustment_reason, prior_period_starts_at, prior_period_ends_at,
    renewal_starts_at, renewal_ends_at, status, created_by_user_id,
    finalized_by_user_id, applied_by_user_id, cancelled_by_user_id,
    finalized_at, applied_at, cancelled_at, cancellation_reason, created_at, updated_at
  FROM commercial_renewals
`;

const renewalPaymentSelect = `
  SELECT id, renewal_id, idempotency_key, amount_minor::text, currency, method,
    reference_text, paid_at, status, recorded_by_user_id, created_at,
    voided_by_user_id, voided_at, void_reason
  FROM manual_renewal_payments
`;

const projectRenewal = (row: RenewalRow): CommercialRenewalRecord => ({
  id: row.id,
  organizationId: row.organization_id,
  subscriptionId: row.subscription_id,
  renewalKind: row.renewal_kind,
  currency: row.currency,
  billingCycle: row.billing_cycle,
  selectedPlanKey: row.selected_plan_key,
  selectedAddOnKeys: row.selected_add_on_keys,
  packageSnapshot: row.package_snapshot,
  listSubtotalMinor: row.list_subtotal_minor,
  listPricingSnapshot: row.list_pricing_snapshot,
  agreedTotalMinor: row.agreed_total_minor,
  adjustmentReason: row.adjustment_reason,
  priorPeriodStartsAt: row.prior_period_starts_at,
  priorPeriodEndsAt: row.prior_period_ends_at,
  renewalStartsAt: row.renewal_starts_at,
  renewalEndsAt: row.renewal_ends_at,
  status: row.status,
  createdByUserId: row.created_by_user_id,
  finalizedByUserId: row.finalized_by_user_id,
  appliedByUserId: row.applied_by_user_id,
  cancelledByUserId: row.cancelled_by_user_id,
  finalizedAt: row.finalized_at,
  appliedAt: row.applied_at,
  cancelledAt: row.cancelled_at,
  cancellationReason: row.cancellation_reason,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const projectPayment = (row: RenewalPaymentRow): RenewalPaymentRecord => ({
  id: row.id,
  renewalId: row.renewal_id,
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

const requireOperator = async (client: PoolClient, actorUserId: string): Promise<void> => {
  const result = await client.query<{ allowed: boolean }>(`
    SELECT EXISTS(
      SELECT 1 FROM users WHERE id = $1 AND platform_role = 'operator'
    ) AS allowed
  `, [actorUserId]);
  if (!result.rows[0]?.allowed) throw new AppError('Platform operator access required', 403);
};

const appendEvent = async (
  client: PoolClient,
  renewalId: string,
  actorUserId: string,
  action: string,
  details: Record<string, unknown>,
  occurredAt: Date,
): Promise<void> => {
  await client.query(`
    INSERT INTO commercial_renewal_events
      (renewal_id, actor_user_id, action, details, occurred_at)
    VALUES ($1, $2, $3, $4::jsonb, $5)
  `, [renewalId, actorUserId, action, JSON.stringify(details), occurredAt]);
};

const loadBundle = async (
  client: PoolClient,
  renewalId: string,
): Promise<CommercialRenewalBundle> => {
  const renewal = await client.query<RenewalRow>(`${renewalSelect} WHERE id = $1`, [renewalId]);
  const row = renewal.rows[0];
  if (!row) throw new AppError('Commercial renewal not found', 404);
  const payments = await client.query<RenewalPaymentRow>(
    `${renewalPaymentSelect} WHERE renewal_id = $1 ORDER BY created_at, id`,
    [renewalId],
  );
  const projectedPayments = payments.rows.map(projectPayment);
  const confirmedTotal = projectedPayments
    .filter(({ status }) => status === 'confirmed')
    .reduce((total, payment) => total + BigInt(payment.amountMinor), 0n);
  return {
    renewal: projectRenewal(row),
    payments: projectedPayments,
    confirmedTotalMinor: confirmedTotal.toString(),
    settlementSatisfied: confirmedTotal === BigInt(row.agreed_total_minor),
  };
};

const loadSubscription = async (
  client: PoolClient,
  subscriptionId: string,
  lock = false,
): Promise<SubscriptionRow> => {
  const result = await client.query<SubscriptionRow>(`
    SELECT s.id, s.organization_id, o.name AS organization_name, s.status,
      s.starts_at, s.current_period_ends_at, s.billing_cycle,
      p.id AS plan_id, p.key AS plan_key, p.name AS plan_name, p.status AS plan_status,
      COALESCE(ARRAY(
        SELECT m.key FROM plan_modules pm
        JOIN module_definitions m ON m.id = pm.module_definition_id
        WHERE pm.plan_id = p.id ORDER BY m.key
      ), ARRAY[]::text[]) AS plan_module_keys,
      pp.monthly_price_minor::text AS plan_monthly_price_minor,
      pp.yearly_price_minor::text AS plan_yearly_price_minor,
      pp.published AS plan_pricing_published,
      pp.updated_at AS plan_pricing_updated_at
    FROM subscriptions s
    JOIN organizations o ON o.id = s.organization_id
    LEFT JOIN plans p ON p.id = s.plan_id
    LEFT JOIN public_offer_pricing pp ON pp.plan_id = p.id
    WHERE s.id = $1
    ${lock ? 'FOR UPDATE OF s' : ''}
  `, [subscriptionId]);
  if (!result.rows[0]) throw new AppError('Subscription not found', 404);
  return result.rows[0];
};

const loadSubscriptionAddOns = async (
  client: PoolClient,
  subscriptionId: string,
): Promise<SubscriptionAddOnRow[]> => (await client.query<SubscriptionAddOnRow>(`
  SELECT a.id, a.key, a.name, a.status,
    ARRAY(
      SELECT m.key FROM add_on_modules am
      JOIN module_definitions m ON m.id = am.module_definition_id
      WHERE am.add_on_id = a.id ORDER BY m.key
    ) AS module_keys,
    pp.monthly_price_minor::text, pp.yearly_price_minor::text,
    pp.published AS pricing_published, pp.updated_at AS pricing_updated_at
  FROM subscription_add_ons sa
  JOIN add_ons a ON a.id = sa.add_on_id
  LEFT JOIN public_offer_pricing pp ON pp.add_on_id = a.id
  WHERE sa.subscription_id = $1
  ORDER BY a.key
`, [subscriptionId])).rows;

const loadPackageSnapshot = async (
  client: PoolClient,
  subscription: SubscriptionRow,
  calculatedAt: Date,
): Promise<{
  packageSnapshot: RenewalPackageSnapshot;
  pricingSnapshot: RenewalListPricingSnapshot;
  listSubtotalMinor: string | null;
}> => {
  if (!subscription.billing_cycle) {
    throw new AppError('Subscription has no reviewed billing cycle', 409);
  }
  if (subscription.plan_id && subscription.plan_status !== 'active') {
    throw new AppError('Current subscription plan is inactive; operator resolution is required', 409);
  }
  const addOns = await loadSubscriptionAddOns(client, subscription.id);
  if (addOns.some(({ status }) => status !== 'active')) {
    throw new AppError('A current subscription add-on is inactive; operator resolution is required', 409);
  }
  if (!subscription.plan_id && addOns.length === 0) {
    throw new AppError('Subscription has no renewable commercial package', 409);
  }

  const packageSnapshot: RenewalPackageSnapshot = {
    billingCycle: subscription.billing_cycle,
    plan: subscription.plan_id
      ? {
          key: subscription.plan_key!,
          name: subscription.plan_name!,
          moduleKeys: subscription.plan_module_keys,
        }
      : null,
    addOns: addOns.map((addOn) => ({
      key: addOn.key,
      name: addOn.name,
      moduleKeys: addOn.module_keys,
    })),
  };
  const cycle = subscription.billing_cycle;
  const items: RenewalListPricingSnapshot['items'] = [
    ...(subscription.plan_id
      ? [{
          offerType: 'plan' as const,
          key: subscription.plan_key!,
          name: subscription.plan_name!,
          priceMinor: subscription.plan_pricing_published
            ? (cycle === 'monthly'
                ? subscription.plan_monthly_price_minor
                : subscription.plan_yearly_price_minor)
            : null,
          pricingUpdatedAt: subscription.plan_pricing_updated_at?.toISOString() ?? null,
        }]
      : []),
    ...addOns.map((addOn) => ({
      offerType: 'add_on' as const,
      key: addOn.key,
      name: addOn.name,
      priceMinor: addOn.pricing_published
        ? (cycle === 'monthly' ? addOn.monthly_price_minor : addOn.yearly_price_minor)
        : null,
      pricingUpdatedAt: addOn.pricing_updated_at?.toISOString() ?? null,
    })),
  ];
  const complete = items.every(({ priceMinor }) => priceMinor !== null);
  const listSubtotalMinor = complete
    ? items.reduce((total, item) => total + BigInt(item.priceMinor!), 0n).toString()
    : null;
  return {
    packageSnapshot,
    pricingSnapshot: {
      billingCycle: cycle,
      currency: 'INR',
      complete,
      calculatedAt: calculatedAt.toISOString(),
      items,
    },
    listSubtotalMinor,
  };
};

const sameInstant = (left: Date, right: Date): boolean => left.getTime() === right.getTime();

export class PostgresCommercialRenewalRepository implements CommercialRenewalRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public previewRenewal(
    subscriptionId: string,
    actorUserId: string,
    now: Date,
  ): Promise<CommercialRenewalPreview> {
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await requireOperator(client, actorUserId);
      const subscription = await loadSubscription(client, subscriptionId);
      if (!['active', 'trialing'].includes(subscription.status)) {
        throw new AppError(
          `Subscription status ${subscription.status} requires explicit resolution before renewal`,
          409,
        );
      }
      if (
        !subscription.current_period_ends_at
        || subscription.current_period_ends_at <= subscription.starts_at
      ) {
        throw new AppError('Subscription has no valid renewable current-period boundary', 409);
      }
      const packageState = await loadPackageSnapshot(client, subscription, now);
      const renewalKind = subscription.current_period_ends_at > now
        ? 'continuous' as const
        : 'reactivation' as const;
      return {
        organizationId: subscription.organization_id,
        organizationName: subscription.organization_name,
        subscriptionId: subscription.id,
        subscriptionStatus: subscription.status,
        renewalKind,
        billingCycle: subscription.billing_cycle!,
        priorPeriodStartsAt: subscription.starts_at,
        priorPeriodEndsAt: subscription.current_period_ends_at,
        suggestedRenewalStartsAt: renewalKind === 'continuous'
          ? subscription.current_period_ends_at
          : null,
        packageSnapshot: packageState.packageSnapshot,
        listPricingSnapshot: packageState.pricingSnapshot,
        listSubtotalMinor: packageState.listSubtotalMinor,
      };
    });
  }

  public finalizeRenewal(
    subscriptionId: string,
    actorUserId: string,
    input: FinalizeCommercialRenewalInput,
    now: Date,
  ): Promise<CommercialRenewalBundle> {
    return this.database.transaction(async (client) => {
      await client.query('SET TRANSACTION ISOLATION LEVEL REPEATABLE READ');
      await requireOperator(client, actorUserId);
      const subscription = await loadSubscription(client, subscriptionId, true);
      if (subscription.organization_id !== input.organizationId) {
        throw new AppError('Subscription does not belong to the selected organization', 409);
      }
      if (!['active', 'trialing'].includes(subscription.status)) {
        throw new AppError(
          `Subscription status ${subscription.status} requires explicit resolution before renewal`,
          409,
        );
      }
      if (!subscription.current_period_ends_at) {
        throw new AppError('Subscription has no renewable current-period boundary', 409);
      }
      if (subscription.current_period_ends_at <= subscription.starts_at) {
        throw new AppError('Subscription current period is invalid', 409);
      }
      const renewalStartsAt = new Date(input.renewalStartsAt);
      const renewalEndsAt = new Date(input.renewalEndsAt);
      const renewalKind = subscription.current_period_ends_at > now
        ? 'continuous' as const
        : 'reactivation' as const;
      if (
        renewalKind === 'continuous'
        && !sameInstant(renewalStartsAt, subscription.current_period_ends_at)
      ) {
        throw new AppError('Continuous renewal must start at the authoritative current-period end', 409);
      }
      if (renewalKind === 'reactivation' && renewalStartsAt < now) {
        throw new AppError('Reactivation start cannot be backdated', 409);
      }
      if (renewalEndsAt <= renewalStartsAt) {
        throw new AppError('Renewal end must be after renewal start', 400);
      }
      const existing = await client.query<{ id: string }>(`
        SELECT id FROM commercial_renewals
        WHERE subscription_id = $1 AND prior_period_ends_at = $2
          AND status IN ('awaiting_payment', 'paid')
        FOR UPDATE
      `, [subscriptionId, subscription.current_period_ends_at]);
      if (existing.rows[0]) {
        throw new AppError('An actionable renewal already exists for this subscription period', 409);
      }

      const packageState = await loadPackageSnapshot(client, subscription, now);
      if (
        packageState.listSubtotalMinor === null
        && !input.adjustmentReason
      ) {
        throw new AppError('Renewal without complete public list pricing requires an explicit reason', 400);
      }
      if (
        packageState.listSubtotalMinor !== null
        && input.agreedTotalMinor !== packageState.listSubtotalMinor
        && !input.adjustmentReason
      ) {
        throw new AppError('A negotiated renewal price adjustment requires a reason', 400);
      }
      if (input.agreedTotalMinor === '0' && !input.adjustmentReason) {
        throw new AppError('A complimentary renewal requires a reason', 400);
      }
      const status = input.agreedTotalMinor === '0' ? 'paid' : 'awaiting_payment';
      const inserted = await client.query<{ id: string }>(`
        INSERT INTO commercial_renewals
          (organization_id, subscription_id, renewal_kind, currency, billing_cycle,
           selected_plan_key, selected_add_on_keys, package_snapshot,
           list_subtotal_minor, list_pricing_snapshot, agreed_total_minor,
           adjustment_reason, prior_period_starts_at, prior_period_ends_at,
           renewal_starts_at, renewal_ends_at, status, created_by_user_id,
           finalized_by_user_id, finalized_at, created_at, updated_at)
        VALUES
          ($1, $2, $3, 'INR', $4, $5, $6, $7::jsonb, $8, $9::jsonb, $10,
           $11, $12, $13, $14, $15, $16, $17, $17, $18, $18, $18)
        RETURNING id
      `, [
        subscription.organization_id,
        subscription.id,
        renewalKind,
        subscription.billing_cycle,
        subscription.plan_key,
        packageState.packageSnapshot.addOns.map(({ key }) => key),
        JSON.stringify(packageState.packageSnapshot),
        packageState.listSubtotalMinor,
        JSON.stringify(packageState.pricingSnapshot),
        input.agreedTotalMinor,
        input.adjustmentReason ?? null,
        subscription.starts_at,
        subscription.current_period_ends_at,
        renewalStartsAt,
        renewalEndsAt,
        status,
        actorUserId,
        now,
      ]);
      const renewalId = inserted.rows[0]!.id;
      await appendEvent(client, renewalId, actorUserId, 'renewal_created', {
        organizationId: subscription.organization_id,
        subscriptionId: subscription.id,
        renewalKind,
      }, now);
      await appendEvent(client, renewalId, actorUserId, 'renewal_finalized', {
        listSubtotalMinor: packageState.listSubtotalMinor,
        agreedTotalMinor: input.agreedTotalMinor,
        listPricingComplete: packageState.pricingSnapshot.complete,
      }, now);
      if (status === 'paid') {
        await appendEvent(client, renewalId, actorUserId, 'renewal_paid', {
          confirmedTotalMinor: '0',
          complimentary: true,
        }, now);
      }
      return loadBundle(client, renewalId);
    });
  }

  public getRenewal(
    renewalId: string,
    actorUserId: string,
  ): Promise<CommercialRenewalBundle> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      return loadBundle(client, renewalId);
    });
  }

  public listOperatorQueue(input: {
    actorUserId: string;
    view: CommercialRenewalQueueView;
    limit: number;
    offset: number;
    now: Date;
  }): Promise<{ items: OperatorRenewalQueueRecord[]; total: number }> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, input.actorUserId);
      const filter = {
        due: `s.status IN ('active', 'trialing')
          AND s.current_period_ends_at > $1
          AND s.current_period_ends_at <= $1 + INTERVAL '30 days'`,
        expired: `s.status IN ('active', 'trialing') AND s.current_period_ends_at <= $1`,
        in_progress: `r.status IN ('awaiting_payment', 'paid')`,
        paid: `r.status = 'paid'`,
        recent: `r.status = 'applied' AND r.applied_at >= $1 - INTERVAL '30 days'`,
        all: 'TRUE',
      }[input.view];
      const result = await client.query<QueueRow>(`
        SELECT s.organization_id, o.name AS organization_name, s.id AS subscription_id,
          s.status AS subscription_status, s.billing_cycle, p.key AS plan_key,
          p.name AS plan_name,
          ARRAY(
            SELECT a.key FROM subscription_add_ons sa
            JOIN add_ons a ON a.id = sa.add_on_id
            WHERE sa.subscription_id = s.id ORDER BY a.key
          ) AS add_on_keys,
          ARRAY(SELECT a.name FROM subscription_add_ons sa JOIN add_ons a ON a.id=sa.add_on_id WHERE sa.subscription_id=s.id ORDER BY a.key) AS add_on_names,
          s.starts_at AS current_period_starts_at,
          s.current_period_ends_at,
          r.id AS renewal_id, r.status AS renewal_status, r.renewal_kind,
          r.renewal_starts_at, r.renewal_ends_at, r.applied_at AS renewal_applied_at,
          COUNT(*) OVER()::text AS total_count
        FROM subscriptions s
        JOIN organizations o ON o.id = s.organization_id
        LEFT JOIN plans p ON p.id = s.plan_id
        LEFT JOIN LATERAL (
          SELECT cr.id, cr.status, cr.renewal_kind, cr.renewal_starts_at,
            cr.renewal_ends_at, cr.applied_at
          FROM commercial_renewals cr
          WHERE cr.subscription_id = s.id
          ORDER BY
            CASE WHEN cr.status IN ('awaiting_payment', 'paid') THEN 0 ELSE 1 END,
            cr.created_at DESC, cr.id DESC
          LIMIT 1
        ) r ON TRUE
        WHERE s.current_period_ends_at IS NOT NULL AND (${filter})
        ORDER BY
          CASE WHEN r.status = 'paid' THEN 0 WHEN s.current_period_ends_at <= $1 THEN 1 ELSE 2 END,
          s.current_period_ends_at, o.name, s.id
        LIMIT $2 OFFSET $3
      `, [input.now, input.limit, input.offset]);
      return {
        items: result.rows.map((row) => ({
          organizationId: row.organization_id,
          organizationName: row.organization_name,
          subscriptionId: row.subscription_id,
          subscriptionStatus: row.subscription_status,
          billingCycle: row.billing_cycle,
          planKey: row.plan_key,
          planName: row.plan_name,
          addOnKeys: row.add_on_keys,
          addOnNames: row.add_on_names,
          currentPeriodStartsAt: row.current_period_starts_at,
          currentPeriodEndsAt: row.current_period_ends_at,
          renewalId: row.renewal_id,
          renewalStatus: row.renewal_status,
          renewalKind: row.renewal_kind,
          renewalStartsAt: row.renewal_starts_at,
          renewalEndsAt: row.renewal_ends_at,
          renewalAppliedAt: row.renewal_applied_at,
        })),
        total: Number(result.rows[0]?.total_count ?? 0),
      };
    });
  }

  public recordPayment(
    renewalId: string,
    actorUserId: string,
    input: RecordRenewalPaymentInput,
    now: Date,
  ): Promise<CommercialRenewalBundle> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const result = await client.query<RenewalRow>(
        `${renewalSelect} WHERE id = $1 FOR UPDATE`,
        [renewalId],
      );
      const renewal = result.rows[0];
      if (!renewal) throw new AppError('Commercial renewal not found', 404);
      const retry = await client.query<RenewalPaymentRow>(`
        ${renewalPaymentSelect} WHERE renewal_id = $1 AND idempotency_key = $2
      `, [renewalId, input.idempotencyKey]);
      if (retry.rows[0]) {
        const existing = retry.rows[0];
        if (
          existing.amount_minor !== input.amountMinor
          || existing.method !== input.method
          || existing.reference_text !== (input.reference ?? null)
          || existing.paid_at.toISOString() !== new Date(input.paidAt).toISOString()
        ) {
          throw new AppError('Payment idempotency key was already used with different values', 409);
        }
        return loadBundle(client, renewalId);
      }
      if (!['awaiting_payment', 'paid'].includes(renewal.status)) {
        throw new AppError('Renewal is not accepting payments', 409);
      }
      if (BigInt(renewal.agreed_total_minor) === 0n) {
        throw new AppError('Complimentary renewals do not accept payment records', 409);
      }
      const total = await client.query<{ total: string }>(`
        SELECT COALESCE(SUM(amount_minor) FILTER (WHERE status = 'confirmed'), 0)::text AS total
        FROM manual_renewal_payments WHERE renewal_id = $1
      `, [renewalId]);
      const nextTotal = BigInt(total.rows[0]?.total ?? '0') + BigInt(input.amountMinor);
      const agreed = BigInt(renewal.agreed_total_minor);
      if (nextTotal > agreed) throw new AppError('Payment would exceed the exact agreed renewal total', 409);
      const payment = await client.query<{ id: string }>(`
        INSERT INTO manual_renewal_payments
          (renewal_id, idempotency_key, amount_minor, currency, method,
           reference_text, paid_at, status, recorded_by_user_id, created_at)
        VALUES ($1, $2, $3, 'INR', $4, $5, $6, 'confirmed', $7, $8)
        RETURNING id
      `, [renewalId, input.idempotencyKey, input.amountMinor, input.method,
        input.reference ?? null, new Date(input.paidAt), actorUserId, now]);
      const nextStatus = nextTotal === agreed ? 'paid' : 'awaiting_payment';
      await client.query(`
        UPDATE commercial_renewals SET status = $2, updated_at = $3 WHERE id = $1
      `, [renewalId, nextStatus, now]);
      await appendEvent(client, renewalId, actorUserId, 'payment_recorded', {
        paymentId: payment.rows[0]!.id,
        amountMinor: input.amountMinor,
        method: input.method,
        confirmedTotalMinor: nextTotal.toString(),
      }, now);
      if (nextStatus === 'paid' && renewal.status !== 'paid') {
        await appendEvent(client, renewalId, actorUserId, 'renewal_paid', {
          confirmedTotalMinor: nextTotal.toString(),
        }, now);
      }
      return loadBundle(client, renewalId);
    });
  }

  public voidPayment(
    renewalId: string,
    paymentId: string,
    actorUserId: string,
    reason: string,
    now: Date,
  ): Promise<CommercialRenewalBundle> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const result = await client.query<RenewalRow>(
        `${renewalSelect} WHERE id = $1 FOR UPDATE`,
        [renewalId],
      );
      const renewal = result.rows[0];
      if (!renewal) throw new AppError('Commercial renewal not found', 404);
      if (!['awaiting_payment', 'paid'].includes(renewal.status)) {
        throw new AppError('Payment cannot be voided after renewal application or cancellation', 409);
      }
      const payment = await client.query<RenewalPaymentRow>(`
        ${renewalPaymentSelect} WHERE id = $1 AND renewal_id = $2 FOR UPDATE
      `, [paymentId, renewalId]);
      if (!payment.rows[0]) throw new AppError('Manual renewal payment not found', 404);
      if (payment.rows[0].status !== 'confirmed') {
        throw new AppError('Manual renewal payment is already void', 409);
      }
      await client.query(`
        UPDATE manual_renewal_payments
        SET status = 'void', voided_by_user_id = $3, voided_at = $4, void_reason = $5
        WHERE id = $1 AND renewal_id = $2
      `, [paymentId, renewalId, actorUserId, now, reason]);
      const total = await client.query<{ total: string }>(`
        SELECT COALESCE(SUM(amount_minor) FILTER (WHERE status = 'confirmed'), 0)::text AS total
        FROM manual_renewal_payments WHERE renewal_id = $1
      `, [renewalId]);
      const confirmedTotal = total.rows[0]?.total ?? '0';
      const nextStatus = BigInt(confirmedTotal) === BigInt(renewal.agreed_total_minor)
        ? 'paid'
        : 'awaiting_payment';
      await client.query(`
        UPDATE commercial_renewals SET status = $2, updated_at = $3 WHERE id = $1
      `, [renewalId, nextStatus, now]);
      await appendEvent(client, renewalId, actorUserId, 'payment_voided', {
        paymentId,
        confirmedTotalMinor: confirmedTotal,
      }, now);
      return loadBundle(client, renewalId);
    });
  }

  public applyRenewal(
    renewalId: string,
    actorUserId: string,
    now: Date,
  ): Promise<CommercialRenewalBundle> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const preliminary = await client.query<RenewalRow>(
        `${renewalSelect} WHERE id = $1`,
        [renewalId],
      );
      if (!preliminary.rows[0]) throw new AppError('Commercial renewal not found', 404);
      // Finalization locks subscription -> renewal. Keep the same lock order here
      // so a concurrent finalize/apply pair cannot deadlock.
      const subscription = await loadSubscription(
        client,
        preliminary.rows[0].subscription_id,
        true,
      );
      const result = await client.query<RenewalRow>(
        `${renewalSelect} WHERE id = $1 FOR UPDATE`,
        [renewalId],
      );
      const renewal = result.rows[0];
      if (!renewal) throw new AppError('Commercial renewal not found', 404);
      if (renewal.status === 'applied') return loadBundle(client, renewalId);
      if (renewal.status === 'cancelled') throw new AppError('Cancelled renewal cannot be applied', 409);
      if (renewal.status !== 'paid') throw new AppError('Renewal must be exactly settled before application', 409);
      const total = await client.query<{ total: string }>(`
        SELECT COALESCE(SUM(amount_minor) FILTER (WHERE status = 'confirmed'), 0)::text AS total
        FROM manual_renewal_payments WHERE renewal_id = $1
      `, [renewalId]);
      if (BigInt(total.rows[0]?.total ?? '0') !== BigInt(renewal.agreed_total_minor)) {
        throw new AppError('Confirmed payments must exactly equal the agreed renewal total', 409);
      }
      if (renewal.renewal_ends_at <= now) {
        throw new AppError('Renewal period has already ended; operator resolution is required', 409);
      }
      if (subscription.organization_id !== renewal.organization_id) {
        throw new AppError('Renewal organization/subscription linkage is invalid', 409);
      }
      if (!['active', 'trialing'].includes(subscription.status)) {
        throw new AppError(
          `Subscription status ${subscription.status} blocks renewal application`,
          409,
        );
      }
      if (
        !subscription.current_period_ends_at
        || !sameInstant(subscription.starts_at, renewal.prior_period_starts_at)
        || !sameInstant(subscription.current_period_ends_at, renewal.prior_period_ends_at)
      ) {
        throw new AppError('Subscription period changed after renewal finalization', 409);
      }
      if (subscription.billing_cycle !== renewal.billing_cycle) {
        throw new AppError('Subscription billing cycle changed after renewal finalization', 409);
      }
      const currentPackage = await loadPackageSnapshot(client, subscription, now);
      const currentAddOnKeys = currentPackage.packageSnapshot.addOns.map(({ key }) => key);
      if (
        subscription.plan_key !== renewal.selected_plan_key
        || JSON.stringify(currentAddOnKeys) !== JSON.stringify(renewal.selected_add_on_keys)
      ) {
        throw new AppError('Subscription package changed after renewal finalization', 409);
      }

      await client.query(`
        UPDATE subscriptions
        SET status = 'active', source = 'manual', starts_at = $2,
          current_period_ends_at = $3, billing_cycle = $4,
          suspended_at = NULL, cancelled_at = NULL,
          updated_by_user_id = $5, updated_at = $6
        WHERE id = $1 AND organization_id = $7
      `, [renewal.subscription_id, renewal.renewal_starts_at, renewal.renewal_ends_at,
        renewal.billing_cycle, actorUserId, now, renewal.organization_id]);
      await client.query(`
        UPDATE subscription_add_ons
        SET starts_at = $2, ends_at = $3
        WHERE subscription_id = $1
      `, [renewal.subscription_id, renewal.renewal_starts_at, renewal.renewal_ends_at]);
      await client.query(`
        UPDATE commercial_renewals
        SET status = 'applied', applied_by_user_id = $2, applied_at = $3, updated_at = $3
        WHERE id = $1
      `, [renewalId, actorUserId, now]);
      await appendEvent(client, renewalId, actorUserId, 'renewal_applied', {
        renewalKind: renewal.renewal_kind,
        renewalStartsAt: renewal.renewal_starts_at.toISOString(),
        renewalEndsAt: renewal.renewal_ends_at.toISOString(),
      }, now);
      if (renewal.renewal_kind === 'reactivation') {
        await appendEvent(client, renewalId, actorUserId, 'subscription_reactivated', {
          priorPeriodEndedAt: renewal.prior_period_ends_at.toISOString(),
        }, now);
      }
      return loadBundle(client, renewalId);
    });
  }

  public cancelRenewal(
    renewalId: string,
    actorUserId: string,
    reason: string,
    now: Date,
  ): Promise<CommercialRenewalBundle> {
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const result = await client.query<RenewalRow>(
        `${renewalSelect} WHERE id = $1 FOR UPDATE`,
        [renewalId],
      );
      const renewal = result.rows[0];
      if (!renewal) throw new AppError('Commercial renewal not found', 404);
      if (renewal.status === 'cancelled') return loadBundle(client, renewalId);
      if (renewal.status === 'applied') throw new AppError('Applied renewal is terminal', 409);
      await client.query(`
        UPDATE commercial_renewals
        SET status = 'cancelled', cancelled_by_user_id = $2, cancelled_at = $3,
          cancellation_reason = $4, updated_at = $3
        WHERE id = $1
      `, [renewalId, actorUserId, now, reason]);
      await appendEvent(client, renewalId, actorUserId, 'renewal_cancelled', { reason }, now);
      return loadBundle(client, renewalId);
    });
  }

  public listCustomerRenewals(organizationId: string): Promise<CommercialRenewalBundle[]> {
    return this.database.transaction(async (client) => {
      const result = await client.query<{ id: string }>(`
        SELECT id FROM commercial_renewals
        WHERE organization_id = $1
        ORDER BY created_at DESC, id DESC
      `, [organizationId]);
      const bundles: CommercialRenewalBundle[] = [];
      for (const row of result.rows) bundles.push(await loadBundle(client, row.id));
      return bundles;
    });
  }
}
