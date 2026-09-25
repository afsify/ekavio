import type { PoolClient, QueryResultRow } from 'pg';
import { asPostgresUserId } from '../persistence/identifiers.js';
import type {
  AccessRequestStatus,
  OfferType,
  OperatorAccessRequestUpdateInput,
  PublicPricingUpdateInput,
} from '../schemas/publicCommercialSchemas.js';
import type {
  AccessRequestRecord,
  CommercialOfferRecord,
  PublicCommercialQuote,
  PublicCommercialRepository,
  StoredAccessRequestInput,
} from '../services/publicCommercialService.js';
import { AppError } from '../utils/AppError.js';
import type { PostgresDatabase } from './database.js';

interface OfferRow extends QueryResultRow {
  offer_type: OfferType;
  key: string;
  name: string;
  description: string;
  status: 'active' | 'inactive';
  available: boolean;
  module_keys: string[];
  capabilities: string[];
  category: string;
  pricing_id: string | null;
  currency: 'INR' | null;
  monthly_price_minor: string | null;
  yearly_price_minor: string | null;
  published: boolean | null;
  display_order: number | null;
  marketing_label: string | null;
  pricing_updated_at: Date | null;
}

interface AccessRequestRow extends QueryResultRow {
  id: string;
  business_name: string;
  business_type: string;
  contact_name: string;
  contact_phone: string;
  normalized_phone: string;
  email: string | null;
  billing_cycle: 'monthly' | 'yearly';
  selected_plan_key: string | null;
  selected_add_on_keys: string[];
  currency: 'INR';
  subtotal_minor: string;
  pricing_snapshot: PublicCommercialQuote;
  status: AccessRequestStatus;
  public_note: string | null;
  internal_note: string | null;
  created_at: Date;
  updated_at: Date;
}

const offerSelect = `
  WITH offers AS (
    SELECT 'plan'::text AS offer_type, p.id AS offer_id, p.key, p.name, p.description,
      p.status, p.available, 'package'::text AS category,
      ARRAY(
        SELECT m.key FROM plan_modules pm
        JOIN module_definitions m ON m.id = pm.module_definition_id
        WHERE pm.plan_id = p.id ORDER BY m.key
      ) AS module_keys,
      ARRAY(
        SELECT m.display_name FROM plan_modules pm
        JOIN module_definitions m ON m.id = pm.module_definition_id
        WHERE pm.plan_id = p.id ORDER BY m.key
      ) AS capabilities
    FROM plans p
    UNION ALL
    SELECT 'add_on'::text AS offer_type, a.id AS offer_id, a.key, a.name, a.description,
      a.status, a.available,
      COALESCE((
        SELECT MIN(m.category) FROM add_on_modules am
        JOIN module_definitions m ON m.id = am.module_definition_id
        WHERE am.add_on_id = a.id
      ), 'capacity') AS category,
      ARRAY(
        SELECT m.key FROM add_on_modules am
        JOIN module_definitions m ON m.id = am.module_definition_id
        WHERE am.add_on_id = a.id ORDER BY m.key
      ) AS module_keys,
      ARRAY(
        SELECT m.display_name FROM add_on_modules am
        JOIN module_definitions m ON m.id = am.module_definition_id
        WHERE am.add_on_id = a.id ORDER BY m.key
      ) AS capabilities
    FROM add_ons a
  )
  SELECT o.offer_type, o.key, o.name, o.description, o.status, o.available,
    o.module_keys, o.capabilities, o.category,
    pr.id AS pricing_id, pr.currency, pr.monthly_price_minor::text,
    pr.yearly_price_minor::text, pr.published, pr.display_order,
    pr.marketing_label, pr.updated_at AS pricing_updated_at
  FROM offers o
  LEFT JOIN public_offer_pricing pr ON
    (o.offer_type = 'plan' AND pr.plan_id = o.offer_id)
    OR (o.offer_type = 'add_on' AND pr.add_on_id = o.offer_id)
`;

const accessRequestSelect = `
  SELECT id, business_name, business_type, contact_name, contact_phone,
    normalized_phone, email, billing_cycle, selected_plan_key, selected_add_on_keys,
    currency, subtotal_minor::text, pricing_snapshot, status, public_note,
    internal_note, created_at, updated_at
  FROM commercial_access_requests
`;

const projectOffer = (row: OfferRow): CommercialOfferRecord => ({
  offerType: row.offer_type,
  key: row.key,
  name: row.name,
  description: row.description,
  status: row.status,
  available: row.available,
  moduleKeys: row.module_keys,
  capabilities: row.capabilities,
  category: row.category,
  pricing: row.pricing_id && row.currency && row.pricing_updated_at
    ? {
        id: row.pricing_id,
        currency: row.currency,
        monthlyPriceMinor: row.monthly_price_minor,
        yearlyPriceMinor: row.yearly_price_minor,
        published: row.published ?? false,
        displayOrder: row.display_order ?? 0,
        marketingLabel: row.marketing_label,
        updatedAt: row.pricing_updated_at,
      }
    : null,
});

const projectAccessRequest = (row: AccessRequestRow): AccessRequestRecord => ({
  id: row.id,
  businessName: row.business_name,
  businessType: row.business_type,
  contactName: row.contact_name,
  contactPhone: row.contact_phone,
  normalizedPhone: row.normalized_phone,
  email: row.email,
  billingCycle: row.billing_cycle,
  selectedPlanKey: row.selected_plan_key,
  selectedAddOnKeys: row.selected_add_on_keys,
  currency: row.currency,
  subtotalMinor: row.subtotal_minor,
  pricingSnapshot: row.pricing_snapshot,
  status: row.status,
  publicNote: row.public_note,
  internalNote: row.internal_note,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const requireOperator = async (client: PoolClient, actorUserId: string): Promise<void> => {
  const result = await client.query<{ allowed: boolean }>(
    `SELECT EXISTS(
      SELECT 1 FROM users WHERE id = $1 AND platform_role = 'operator'
    ) AS allowed`,
    [actorUserId],
  );
  if (!result.rows[0]?.allowed) throw new AppError('Platform operator access required', 403);
};

const allowedTransitions: Readonly<Record<AccessRequestStatus, readonly AccessRequestStatus[]>> = {
  pending: ['contacted', 'approved', 'rejected'],
  contacted: ['approved', 'rejected'],
  approved: [],
  rejected: [],
  activated: [],
};

export class PostgresPublicCommercialRepository implements PublicCommercialRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async loadOffers(): Promise<CommercialOfferRecord[]> {
    const result = await this.database.query<OfferRow>(
      `${offerSelect} ORDER BY o.offer_type, o.key`,
    );
    return result.rows.map(projectOffer);
  }

  public createAccessRequest(
    input: StoredAccessRequestInput,
  ): Promise<{ id: string; createdAt: Date }> {
    return this.database.transaction(async (client) => {
      await client.query('SELECT pg_advisory_xact_lock(hashtextextended($1, 0))', [input.normalizedPhone]);
      const recent = await client.query<{ exists: boolean }>(`
        SELECT EXISTS(
          SELECT 1 FROM commercial_access_requests
          WHERE normalized_phone = $1 AND created_at >= $2
        ) AS exists
      `, [input.normalizedPhone, input.phoneCooldownSince]);
      if (recent.rows[0]?.exists) {
        throw new AppError('A recent request already exists for this phone number', 429);
      }

      const created = await client.query<{ id: string; created_at: Date }>(`
        INSERT INTO commercial_access_requests
          (business_name, business_type, contact_name, contact_phone, normalized_phone,
           email, billing_cycle, selected_plan_key, selected_add_on_keys, currency,
           subtotal_minor, pricing_snapshot, status, public_note, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, 'pending', $13, NOW(), NOW())
        RETURNING id, created_at
      `, [
        input.businessName,
        input.businessType,
        input.contactName,
        input.contactPhone,
        input.normalizedPhone,
        input.email,
        input.billingCycle,
        input.selectedPlanKey,
        input.selectedAddOnKeys,
        input.currency,
        input.subtotalMinor,
        JSON.stringify(input.pricingSnapshot),
        input.publicNote,
      ]);
      const row = created.rows[0]!;
      await client.query(`
        INSERT INTO commercial_access_request_events
          (access_request_id, actor_user_id, action, from_status, to_status, details)
        VALUES ($1, NULL, 'submitted', NULL, 'pending', '{}'::jsonb)
      `, [row.id]);
      return { id: row.id, createdAt: row.created_at };
    });
  }

  public async listAccessRequests(input: {
    status?: AccessRequestStatus;
    limit: number;
    offset: number;
  }): Promise<{ items: AccessRequestRecord[]; total: number }> {
    const values: unknown[] = [];
    const filter = input.status ? 'WHERE status = $1' : '';
    if (input.status) values.push(input.status);
    const limitParameter = values.push(input.limit);
    const offsetParameter = values.push(input.offset);
    return this.database.withClient(async (client) => {
      await client.query('BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY');
      try {
        const rows = await client.query<AccessRequestRow>(`
          ${accessRequestSelect} ${filter}
          ORDER BY created_at DESC, id DESC
          LIMIT $${limitParameter} OFFSET $${offsetParameter}
        `, values);
        const countValues = input.status ? [input.status] : [];
        const count = await client.query<{ total: string }>(`
          SELECT COUNT(*)::text AS total FROM commercial_access_requests ${filter}
        `, countValues);
        await client.query('COMMIT');
        return {
          items: rows.rows.map(projectAccessRequest),
          total: Number(count.rows[0]?.total ?? 0),
        };
      } catch (error) {
        await client.query('ROLLBACK');
        throw error;
      }
    });
  }

  public async getAccessRequest(id: string): Promise<AccessRequestRecord | null> {
    const result = await this.database.query<AccessRequestRow>(
      `${accessRequestSelect} WHERE id = $1`,
      [id],
    );
    return result.rows[0] ? projectAccessRequest(result.rows[0]) : null;
  }

  public updateAccessRequest(
    id: string,
    actorUserIdValue: string,
    input: OperatorAccessRequestUpdateInput,
  ): Promise<AccessRequestRecord> {
    const actorUserId = asPostgresUserId(actorUserIdValue);
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const current = await client.query<AccessRequestRow>(
        `${accessRequestSelect} WHERE id = $1 FOR UPDATE`,
        [id],
      );
      const row = current.rows[0];
      if (!row) throw new AppError('Access request not found', 404);
      const previous = projectAccessRequest(row);
      const nextStatus = input.status ?? previous.status;
      if (input.status && !allowedTransitions[previous.status].includes(input.status)) {
        throw new AppError(`Invalid access request transition from ${previous.status}`, 409);
      }
      const noteWasProvided = input.internalNote !== undefined;
      const nextNote = noteWasProvided ? (input.internalNote || null) : previous.internalNote;
      const statusChanged = nextStatus !== previous.status;
      const noteChanged = noteWasProvided && nextNote !== previous.internalNote;
      if (!statusChanged && !noteChanged) throw new AppError('Access request update made no changes', 400);

      const updated = await client.query<AccessRequestRow>(`
        UPDATE commercial_access_requests
        SET status = $2, internal_note = $3, updated_at = NOW()
        WHERE id = $1
        RETURNING id, business_name, business_type, contact_name, contact_phone,
          normalized_phone, email, billing_cycle, selected_plan_key, selected_add_on_keys,
          currency, subtotal_minor::text, pricing_snapshot, status, public_note,
          internal_note, created_at, updated_at
      `, [id, nextStatus, nextNote]);
      if (statusChanged) {
        await client.query(`
          INSERT INTO commercial_access_request_events
            (access_request_id, actor_user_id, action, from_status, to_status, details)
          VALUES ($1, $2, 'status_changed', $3, $4, $5::jsonb)
        `, [id, actorUserId, previous.status, nextStatus, JSON.stringify({ internalNoteChanged: noteChanged })]);
      } else if (noteChanged) {
        await client.query(`
          INSERT INTO commercial_access_request_events
            (access_request_id, actor_user_id, action, from_status, to_status, details)
          VALUES ($1, $2, 'internal_note_updated', $3, $3, $4::jsonb)
        `, [id, actorUserId, previous.status, JSON.stringify({ internalNoteChanged: true })]);
      }
      return projectAccessRequest(updated.rows[0]!);
    });
  }

  public upsertPricing(
    offerType: OfferType,
    offerKey: string,
    actorUserIdValue: string,
    input: PublicPricingUpdateInput,
  ): Promise<CommercialOfferRecord> {
    const actorUserId = asPostgresUserId(actorUserIdValue);
    return this.database.transaction(async (client) => {
      await requireOperator(client, actorUserId);
      const targetTable = offerType === 'plan' ? 'plans' : 'add_ons';
      const target = await client.query<{ id: string }>(`
        SELECT id FROM ${targetTable}
        WHERE key = $1 AND status = 'active' AND available = TRUE
      `, [offerKey]);
      if (!target.rows[0]) throw new AppError('Offer not found or unavailable', 404);
      const targetId = target.rows[0].id;
      const targetColumn = offerType === 'plan' ? 'plan_id' : 'add_on_id';
      const existing = await client.query<{ id: string; published: boolean }>(`
        SELECT id, published FROM public_offer_pricing WHERE ${targetColumn} = $1 FOR UPDATE
      `, [targetId]);
      const previous = existing.rows[0];
      const pricing = previous
        ? await client.query<{ id: string }>(`
            UPDATE public_offer_pricing SET
              currency = $2, monthly_price_minor = $3, yearly_price_minor = $4,
              published = $5, display_order = $6, marketing_label = $7,
              updated_by_user_id = $8, updated_at = NOW()
            WHERE id = $1 RETURNING id
          `, [previous.id, input.currency, input.monthlyPriceMinor, input.yearlyPriceMinor,
            input.published, input.displayOrder, input.marketingLabel, actorUserId])
        : await client.query<{ id: string }>(`
            INSERT INTO public_offer_pricing
              (offer_type, ${targetColumn}, currency, monthly_price_minor, yearly_price_minor,
               published, display_order, marketing_label, updated_by_user_id, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW(), NOW())
            RETURNING id
          `, [offerType, targetId, input.currency, input.monthlyPriceMinor,
            input.yearlyPriceMinor, input.published, input.displayOrder,
            input.marketingLabel, actorUserId]);
      const pricingId = pricing.rows[0]!.id;
      const action = !previous
        ? 'created'
        : previous.published !== input.published
          ? (input.published ? 'published' : 'unpublished')
          : 'updated';
      await client.query(`
        INSERT INTO public_offer_pricing_events
          (offer_pricing_id, actor_user_id, action, currency, monthly_price_minor,
           yearly_price_minor, published, display_order, marketing_label, occurred_at)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
      `, [pricingId, actorUserId, action, input.currency, input.monthlyPriceMinor,
        input.yearlyPriceMinor, input.published, input.displayOrder, input.marketingLabel]);

      const result = await client.query<OfferRow>(`
        ${offerSelect}
        WHERE o.offer_type = $1 AND o.key = $2
      `, [offerType, offerKey]);
      return projectOffer(result.rows[0]!);
    });
  }
}
