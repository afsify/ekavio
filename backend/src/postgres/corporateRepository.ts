import type { MembershipRole } from '../models/Membership.js';
import { assertCorporateLinkAuthority } from '../services/corporateAuthorizationService.js';
import { AppError } from '../utils/AppError.js';
import type { PostgresDatabase } from './database.js';

export interface ParentOrganizationRecord {
  id: string;
  owner_user_id: string;
  name: string;
  consolidated_billing: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CorporateChildRecord {
  id: string;
  name: string;
  type: string;
}

const parentColumns = `
  id, owner_user_id, name, consolidated_billing, created_at, updated_at
`;

export class PostgresCorporateRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async createParent(input: {
    ownerUserId: string;
    name: string;
    consolidatedBilling: boolean;
  }): Promise<ParentOrganizationRecord> {
    const result = await this.database.query<ParentOrganizationRecord>(`
      INSERT INTO parent_organizations (
        owner_user_id, name, consolidated_billing, created_at, updated_at
      ) VALUES ($1, $2, $3, NOW(), NOW())
      RETURNING ${parentColumns}
    `, [input.ownerUserId, input.name, input.consolidatedBilling]);
    return result.rows[0]!;
  }

  public async listParents(ownerUserId: string): Promise<ParentOrganizationRecord[]> {
    const result = await this.database.query<ParentOrganizationRecord>(`
      SELECT ${parentColumns}
      FROM parent_organizations
      WHERE owner_user_id = $1
      ORDER BY name, id
    `, [ownerUserId]);
    return result.rows;
  }

  public async findParentForOwner(
    ownerUserId: string,
    parentId: string,
  ): Promise<ParentOrganizationRecord | null> {
    const result = await this.database.query<ParentOrganizationRecord>(`
      SELECT ${parentColumns}
      FROM parent_organizations
      WHERE id = $1 AND owner_user_id = $2
    `, [parentId, ownerUserId]);
    return result.rows[0] ?? null;
  }

  public async linkChild(input: {
    actorUserId: string;
    parentId: string;
    childOrganizationId: string;
  }): Promise<CorporateChildRecord> {
    return this.database.transaction(async (client) => {
      const parent = await client.query<{ owner_user_id: string }>(`
        SELECT owner_user_id
        FROM parent_organizations
        WHERE id = $1
        FOR UPDATE
      `, [input.parentId]);
      if (!parent.rows[0]) throw new AppError('Corporate relationship not found', 404);

      const child = await client.query<CorporateChildRecord & {
        parent_organization_id: string | null;
      }>(`
        SELECT id, name, type, parent_organization_id
        FROM organizations
        WHERE id = $1
        FOR UPDATE
      `, [input.childOrganizationId]);
      if (!child.rows[0]) throw new AppError('Child organization not found', 404);

      const membership = await client.query<{ role: MembershipRole }>(`
        SELECT role
        FROM memberships
        WHERE user_id = $1 AND organization_id = $2 AND status = 'active'
      `, [input.actorUserId, input.childOrganizationId]);
      assertCorporateLinkAuthority({
        actorUserId: input.actorUserId,
        parentOwnerId: parent.rows[0].owner_user_id,
        ...(membership.rows[0] ? { childMembershipRole: membership.rows[0].role } : {}),
      });

      if (
        child.rows[0].parent_organization_id &&
        child.rows[0].parent_organization_id !== input.parentId
      ) {
        throw new AppError('Child organization already belongs to another parent', 409);
      }
      await client.query(`
        UPDATE organizations
        SET parent_organization_id = $1, updated_at = NOW()
        WHERE id = $2
      `, [input.parentId, input.childOrganizationId]);
      return {
        id: child.rows[0].id,
        name: child.rows[0].name,
        type: child.rows[0].type,
      };
    });
  }

  public async listChildren(
    ownerUserId: string,
    parentId: string,
  ): Promise<CorporateChildRecord[]> {
    const result = await this.database.query<CorporateChildRecord>(`
      SELECT o.id, o.name, o.type
      FROM organizations o
      JOIN parent_organizations p ON p.id = o.parent_organization_id
      WHERE p.id = $1 AND p.owner_user_id = $2
      ORDER BY o.name, o.id
    `, [parentId, ownerUserId]);
    return result.rows;
  }
}
