import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import test from 'node:test';
import { mkdtemp, readdir, copyFile, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PostgresDatabase } from '../src/postgres/database.js';
import { migrate } from '../src/postgres/migrations.js';
import { verifyRestoredDatabase } from '../src/postgres/restoreIntegrity.js';

test('current recovery verifier fails closed on 020 schema and restored corruption', async t => {
  const url = new URL(process.env.POSTGRES_TEST_URL ?? '');
  assert.ok(['127.0.0.1', 'localhost', 'postgres'].includes(url.hostname) && url.pathname === '/postgres');
  const admin = new PostgresDatabase(url.href);
  const name = `ekavio_v210_recovery_${randomUUID().replaceAll('-', '')}`;
  await admin.query(`CREATE DATABASE ${name}`);
  url.pathname = `/${name}`;
  const db = new PostgresDatabase(url.href);
  try {
    await migrate(db);
    await t.test('fresh latest schema reports 20 checksums and every new domain without row data', async () => {
      const proof = await verifyRestoredDatabase(db);
      assert.equal(proof.migrations.applied, 20);
      assert.equal(proof.migrations.expected, 20);
      assert.equal(proof.coverage.contractVersion, 'v2-10-recovery-integrity-v1');
      assert.equal(proof.coverage.reviewedThrough, '020_hr_plus.sql');
      assert.deepEqual(proof.coverage.additionalMigrations, []);
      for (const table of ['identity_challenges', 'organization_roles', 'custom_field_values',
        'user_notifications', 'crm_leads', 'purchase_receipts', 'hr_leave_requests', 'hr_shift_assignments']) {
        assert.equal(proof.counts[table], '0');
      }
      assert.ok(Object.keys(proof.integrity).some(key => key.startsWith('fk:hr_leave_requests:')));
      assert.ok(Object.keys(proof.integrity).some(key => key.startsWith('check:purchase_order_lines:')));
      assert.ok(Object.values(proof.integrity).every(value => value === '0'));
    });
    await t.test('a missing current migration cannot inherit historical recovery PASS', async () => {
      const row = (await db.query('DELETE FROM schema_migrations WHERE name=$1 RETURNING *',
        ['020_hr_plus.sql'])).rows[0]!;
      try { await assert.rejects(() => verifyRestoredDatabase(db), /001 through 020/); }
      finally { await db.query('INSERT INTO schema_migrations(name,checksum,applied_at) VALUES($1,$2,$3)',
        [row.name, row.checksum, row.applied_at]); }
    });
    await t.test('checksum changes fail rather than applying or repairing', async () => {
      const row = (await db.query("SELECT checksum FROM schema_migrations WHERE name='020_hr_plus.sql'")).rows[0]!;
      await db.query("UPDATE schema_migrations SET checksum=repeat('0',64) WHERE name='020_hr_plus.sql'");
      try { await assert.rejects(() => verifyRestoredDatabase(db), /checksum changed/); }
      finally { await db.query("UPDATE schema_migrations SET checksum=$1 WHERE name='020_hr_plus.sql'", [row.checksum]); }
    });
    await t.test('disabled immutable-history trigger fails', async () => {
      await db.query('ALTER TABLE hr_events DISABLE TRIGGER hr_events_immutable');
      try { await assert.rejects(() => verifyRestoredDatabase(db), /integrity failures/); }
      finally { await db.query('ALTER TABLE hr_events ENABLE TRIGGER hr_events_immutable'); }
    });
    await t.test('a restored composite FK orphan is detected independently of triggers', async () => {
      const user = randomUUID(), org = randomUUID(), membership = randomUUID();
      await db.withClient(async client => {
        await client.query("SET session_replication_role='replica'");
        try { await client.query("INSERT INTO memberships(id,user_id,organization_id,role,status,created_at,updated_at) VALUES($1,$2,$3,'staff','active',now(),now())",
          [membership, user, org]); }
        finally { await client.query("SET session_replication_role='origin'"); }
      });
      try { await assert.rejects(() => verifyRestoredDatabase(db), /integrity failures/); }
      finally { await db.query('DELETE FROM memberships WHERE id=$1', [membership]); }
    });
    await t.test('a dropped immutable-history guard is not mistaken for valid restored history', async () => {
      await db.query('DROP TRIGGER hr_events_immutable ON hr_events');
      try { await assert.rejects(() => verifyRestoredDatabase(db), /integrity failures/); }
      finally { await db.query('CREATE TRIGGER hr_events_immutable BEFORE UPDATE OR DELETE ON hr_events FOR EACH ROW EXECUTE FUNCTION ekavio_prevent_history_mutation()'); }
    });
    await t.test('populated stock projection corruption fails even with valid foreign keys', async () => {
      const org = randomUUID(), branch = randomUUID(), item = randomUUID();
      await db.query("INSERT INTO organizations(id,name,type,theme_mode,theme_primary_color,created_at,updated_at) VALUES($1,'STAGING V210 recovery','shop','light','#4F46E5',now(),now())", [org]);
      await db.query("INSERT INTO branches(id,organization_id,name,code,status,timezone,created_at,updated_at) VALUES($1,$2,'Main','main','active','Asia/Kolkata',now(),now())", [branch, org]);
      await db.query("INSERT INTO inventory_items(id,organization_id,name,unit_code,creation_idempotency_key,creation_command_fingerprint) VALUES($1,$2,'STAGING V210 item','unit',$3,repeat('a',64))", [item, org, randomUUID()]);
      const location = (await db.query('SELECT id FROM stock_locations WHERE branch_id=$1', [branch])).rows[0]!.id;
      await db.query('INSERT INTO stock_balances(organization_id,branch_id,item_id,location_id,quantity) VALUES($1,$2,$3,$4,1)', [org, branch, item, location]);
      try { await assert.rejects(() => verifyRestoredDatabase(db), /integrity failures/); }
      finally { await db.query('UPDATE stock_balances SET quantity=0 WHERE item_id=$1', [item]); }
      const proof = await verifyRestoredDatabase(db);
      assert.equal(proof.counts.inventory_items, '1');
      assert.equal(proof.integrity.stock_projection_mismatches, '0');
    });
    await t.test('final clean proof and no implicit migration or business writes', async () => {
      const before = (await db.query('SELECT name,checksum,applied_at FROM schema_migrations ORDER BY name')).rows;
      await verifyRestoredDatabase(db);
      assert.deepEqual((await db.query('SELECT name,checksum,applied_at FROM schema_migrations ORDER BY name')).rows, before);
    });
    await t.test('later migrations are checksum checked without a stale fixed count or invented domain certification', async () => {
      const directory = await mkdtemp(path.join(tmpdir(), 'ekavio-v210-future-schema-'));
      try {
        for (const file of (await readdir('postgres/migrations')).filter(file => file.endsWith('.sql'))) {
          await copyFile(path.join('postgres/migrations', file), path.join(directory, file));
        }
        await writeFile(path.join(directory, '021_acceptance_fixture.sql'), '-- Disposable future migration contract fixture\nSELECT 1;\n');
        await assert.rejects(() => verifyRestoredDatabase(db, directory), /zero pending migrations/);
        await migrate(db, directory);
        const proof = await verifyRestoredDatabase(db, directory);
        assert.equal(proof.migrations.applied, 21);
        assert.equal(proof.migrations.expected, 21);
        assert.equal(proof.coverage.reviewedThrough, '020_hr_plus.sql');
        assert.deepEqual(proof.coverage.additionalMigrations, ['021_acceptance_fixture.sql']);
      } finally {
        const resolved = path.resolve(directory);
        assert.ok(resolved.startsWith(path.resolve(tmpdir()) + path.sep) && path.basename(resolved).startsWith('ekavio-v210-future-schema-'));
        await rm(resolved, { recursive: true });
      }
    });
  } finally {
    await db.close();
    await admin.query(`DROP DATABASE ${name}`);
    await admin.close();
  }
});
