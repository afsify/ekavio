import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { copyFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import test from 'node:test';
import {
  RetirementMigrationBlockedError,
  runCorporateMigration,
  verifyCorporateMigration,
} from '../src/domains/runtimeRetirement/migration.js';
import type {
  CorporateLegacySource,
  LegacyCorporateChildLink,
  LegacyParentOrganizationRecord,
} from '../src/domains/runtimeRetirement/migrationTypes.js';
import { PostgresDatabase } from '../src/postgres/database.js';
import { getMigrationStatus, migrate } from '../src/postgres/migrations.js';

class MemoryCorporateSource implements CorporateLegacySource {
  public constructor(
    private readonly parents: LegacyParentOrganizationRecord[],
    private readonly links: LegacyCorporateChildLink[],
  ) {}
  public async loadParents() { return this.parents.map((row) => ({ ...row })); }
  public async loadChildLinks() { return this.links.map((row) => ({ ...row })); }
}
const legacyId = (): string => randomBytes(12).toString('hex');

test('V2-06F corporate migration maps and reconciles exact legacy relationships', async (context) => {
  const adminUrl = process.env.POSTGRES_TEST_URL;
  assert.ok(adminUrl, 'POSTGRES_TEST_URL is required');
  const parsed = new URL(adminUrl);
  assert.ok(['localhost', '127.0.0.1', 'postgres'].includes(parsed.hostname)
    || /^172\.(1[6-9]|2[0-9]|3[01])\./.test(parsed.hostname));
  assert.equal(parsed.pathname, '/postgres');
  const cleanName = `ekavio_v206f_corp_migration_${randomUUID().replaceAll('-', '')}`;
  const upgradeName = `ekavio_v206f_corp_upgrade_${randomUUID().replaceAll('-', '')}`;
  const admin = new PostgresDatabase(adminUrl);
  await admin.query(`CREATE DATABASE "${cleanName}"`);
  await admin.query(`CREATE DATABASE "${upgradeName}"`);
  const cleanUrl = new URL(adminUrl); cleanUrl.pathname = `/${cleanName}`;
  const upgradeUrl = new URL(adminUrl); upgradeUrl.pathname = `/${upgradeName}`;
  const database = new PostgresDatabase(cleanUrl.toString());
  const upgrade = new PostgresDatabase(upgradeUrl.toString());
  const temporaryMigrations = await mkdtemp(path.join(tmpdir(), 'ekavio-v206f-migrations-'));
  context.after(async () => {
    await database.close();
    await upgrade.close();
    for (const name of [cleanName, upgradeName]) {
      await admin.query('SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = $1', [name]);
      await admin.query(`DROP DATABASE "${name}"`);
    }
    await admin.close();
    await rm(temporaryMigrations, { recursive: true, force: true });
  });

  await migrate(database);
  assert.equal((await getMigrationStatus(database)).length, 15);
  const migrationDirectory = path.resolve(process.cwd(), 'postgres', 'migrations');
  const accepted = (await readdir(migrationDirectory)).filter((name) =>
    /^(?:00[1-9]|01[01])_.*\.sql$/.test(name));
  for (const name of accepted) {
    await copyFile(path.join(migrationDirectory, name), path.join(temporaryMigrations, name));
  }
  await migrate(upgrade, temporaryMigrations);
  assert.equal((await getMigrationStatus(upgrade, temporaryMigrations)).length, 11);
  await migrate(upgrade);
  assert.equal((await getMigrationStatus(upgrade)).length, 15);

  const now = new Date('2026-09-30T01:00:00.000Z');
  const ownerLegacyId = legacyId();
  const ownerId = randomUUID();
  const childLegacyId = legacyId();
  const childId = randomUUID();
  const parentLegacyId = legacyId();
  await database.query(`
    INSERT INTO users (id, legacy_mongo_id, name, phone, created_at, updated_at)
    VALUES ($1, $2, 'Legacy Owner', '+910000000004', $3, $3)
  `, [ownerId, ownerLegacyId, now]);
  await database.query(`
    INSERT INTO organizations
      (id, legacy_mongo_id, name, type, theme_mode, theme_primary_color, created_at, updated_at)
    VALUES ($1, $2, 'Legacy Child', 'clinic', 'light', '#4F46E5', $3, $3)
  `, [childId, childLegacyId, now]);
  const parent: LegacyParentOrganizationRecord = {
    id: parentLegacyId,
    ownerLegacyUserId: ownerLegacyId,
    name: 'Legacy Group',
    consolidatedBilling: false,
    createdAt: now,
    updatedAt: now,
  };
  const source = new MemoryCorporateSource([parent], [{
    legacyOrganizationId: childLegacyId,
    legacyParentOrganizationId: parentLegacyId,
  }]);
  const dryRun = await runCorporateMigration({ source, database });
  assert.equal(dryRun.mode, 'dry-run');
  assert.equal(dryRun.blockerCount, 0);
  assert.equal((await database.query('SELECT id FROM parent_organizations')).rowCount, 0);
  const applied = await runCorporateMigration({ source, database, apply: true });
  assert.equal(applied.appliedParentCount, 1);
  assert.equal(applied.appliedChildLinkCount, 1);
  await runCorporateMigration({ source, database, apply: true });
  const verified = await verifyCorporateMigration({ source, database });
  assert.equal(verified.clean, true);
  assert.equal(verified.targetParentCount, 1);
  assert.equal(verified.targetChildLinkCount, 1);
  const stored = await database.query<{
    owner_user_id: string; name: string; consolidated_billing: boolean;
  }>('SELECT owner_user_id, name, consolidated_billing FROM parent_organizations');
  assert.deepEqual(stored.rows[0], {
    owner_user_id: ownerId,
    name: 'Legacy Group',
    consolidated_billing: false,
  });

  const conflicting = new MemoryCorporateSource([{ ...parent, name: 'Changed Without Review' }], [{
    legacyOrganizationId: childLegacyId,
    legacyParentOrganizationId: parentLegacyId,
  }]);
  const blocked = await runCorporateMigration({ source: conflicting, database });
  assert.ok(blocked.issues.some(({ code }) => code === 'parent_target_conflict'));
  await assert.rejects(
    runCorporateMigration({ source: conflicting, database, apply: true }),
    RetirementMigrationBlockedError,
  );

  const missingOwner = new MemoryCorporateSource([{ ...parent, id: legacyId(), ownerLegacyUserId: legacyId() }], []);
  const missing = await runCorporateMigration({ source: missingOwner, database });
  assert.equal(missing.issues[0]?.code, 'missing_owner_mapping');
});
