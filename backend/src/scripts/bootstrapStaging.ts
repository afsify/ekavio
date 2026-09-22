import dotenv from 'dotenv';
import { PLAN_KEYS } from '../commercial/catalogue.js';
import { activateOperationalAuthority } from '../domains/queue/operationalAuthority.js';
import { registerAdmin } from '../services/accountPersistence.js';
import { PostgresAccountRepository } from '../postgres/accountRepository.js';
import { PostgresCommercialRepository } from '../postgres/commercialRepository.js';
import { PostgresDatabase } from '../postgres/database.js';
import { getMigrationStatus } from '../postgres/migrations.js';
import { loadStagingBootstrapConfig } from './stagingBootstrapConfig.js';

interface BootstrapIdentity {
  userId: string;
  organizationId: string;
  branchId: string;
  membershipId: string;
}

dotenv.config({ quiet: true });
const config = loadStagingBootstrapConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);

const resolveIdentity = async (): Promise<BootstrapIdentity> => {
  const existing = await database.query<{
    user_id: string;
    organization_id: string;
    branch_id: string;
    membership_id: string;
  }>(`
    SELECT u.id AS user_id, m.organization_id, b.id AS branch_id, m.id AS membership_id
    FROM users u
    JOIN memberships m ON m.user_id = u.id AND m.role = 'admin' AND m.status = 'active'
    JOIN membership_branch_assignments mba
      ON mba.membership_id = m.id AND mba.organization_id = m.organization_id
    JOIN branches b
      ON b.id = mba.branch_id AND b.organization_id = m.organization_id
      AND b.code = 'main' AND b.status = 'active'
    WHERE u.phone = $1
    ORDER BY m.created_at, b.created_at
  `, [config.phone]);

  if (existing.rows.length > 1) {
    throw new Error('Staging bootstrap phone resolves to more than one active admin/main-branch context');
  }
  const row = existing.rows[0];
  if (row) {
    return {
      userId: row.user_id,
      organizationId: row.organization_id,
      branchId: row.branch_id,
      membershipId: row.membership_id,
    };
  }

  const conflictingUser = await database.query<{ id: string }>(
    'SELECT id FROM users WHERE phone = $1',
    [config.phone],
  );
  if (conflictingUser.rows.length > 0) {
    throw new Error('Staging bootstrap phone already exists without one active admin/main-branch context');
  }

  const accounts = new PostgresAccountRepository(database);
  const created = await registerAdmin(accounts, {
    orgName: config.organizationName,
    orgType: config.organizationType,
    userName: config.userName,
    phone: config.phone,
    password: config.password,
  });
  const branch = created.branch as { id: string };
  const user = created.user as { id: string; tenantId: string };
  const membership = await database.query<{ id: string }>(`
    SELECT id FROM memberships
    WHERE user_id = $1 AND organization_id = $2 AND role = 'admin' AND status = 'active'
  `, [user.id, user.tenantId]);
  if (!membership.rows[0]) throw new Error('Staging bootstrap registration returned no admin membership');
  return {
    userId: user.id,
    organizationId: user.tenantId,
    branchId: branch.id,
    membershipId: membership.rows[0].id,
  };
};

try {
  const migrationStatus = await getMigrationStatus(database);
  const pending = migrationStatus.filter(({ state }) => state !== 'applied');
  if (pending.length > 0) {
    throw new Error(`Staging bootstrap requires current migrations; pending: ${pending.map(({ name }) => name).join(', ')}`);
  }

  const identity = await resolveIdentity();
  await database.transaction(async (client) => {
    const operator = await client.query(
      `UPDATE users SET platform_role = 'operator', updated_at = NOW() WHERE id = $1`,
      [identity.userId],
    );
    if (operator.rowCount !== 1) throw new Error('Staging bootstrap could not assign platform operator');

    const branch = await client.query(`
      UPDATE branches SET timezone = $1, updated_at = NOW()
      WHERE id = $2 AND organization_id = $3 AND ekavio_is_valid_iana_timezone($1)
    `, [config.branchTimezone, identity.branchId, identity.organizationId]);
    if (branch.rowCount !== 1) throw new Error('Staging bootstrap could not set the reviewed branch timezone');
  });

  const commercial = new PostgresCommercialRepository(database);
  await commercial.reconcileCatalogue();
  await commercial.updateSubscription(identity.organizationId, identity.userId, {
    planKey: PLAN_KEYS.PILOT_CORE,
    addOns: [],
    status: 'trialing',
    source: 'pilot',
  });
  // A clean staging database has no legacy Queue source to preflight. Record the
  // already source-controlled PostgreSQL direction so legacy apply stays latched.
  await activateOperationalAuthority(database);

  console.log(JSON.stringify({
    status: 'ready',
    userId: identity.userId,
    organizationId: identity.organizationId,
    branchId: identity.branchId,
    membershipId: identity.membershipId,
  }));
} finally {
  await database.close();
}
