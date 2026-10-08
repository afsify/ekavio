import assert from 'node:assert/strict';
import { initialAddOns, initialModuleCatalogue, initialPlans } from '../../src/commercial/catalogue.js';
import type { PostgresDatabase } from '../../src/postgres/database.js';

// Test-only boundary: these disposable fixtures describe pre-CRM/pre-Purchasing source data.
// Production verification remains strict; no fictional Mongo CRM mappings exist.
export async function prepareHistoricalCatalogue(db: PostgresDatabase): Promise<void> {
  await db.transaction(async client => {
    const row = (await client.query("SELECT current_database() AS name,(SELECT count(*) FROM organizations)::int AS organizations")).rows[0]!;
    assert.match(row.name, /^ekavio_v20(?:5a|5d)_/);
    assert.equal(row.organizations, 0, 'Historical fixture preparation requires an empty disposable database');
    await client.query("DELETE FROM add_on_modules WHERE add_on_id IN (SELECT id FROM add_ons WHERE key IN ('module-crm','module-purchasing') AND legacy_mongo_id IS NULL)");
    await client.query("DELETE FROM add_ons WHERE key IN ('module-crm','module-purchasing') AND legacy_mongo_id IS NULL");
    await client.query("DELETE FROM module_definitions WHERE key IN ('crm','purchasing') AND legacy_mongo_id IS NULL");
  });
}

// Migration-016 upgrade evidence must use the catalogue supported at 016,
// not today's production reconciler (which correctly includes native CRM/Purchasing).
export async function seedHistoricalCatalogue(db: PostgresDatabase): Promise<void> {
  await db.transaction(async client => {
    assert.match((await client.query('SELECT current_database() AS name')).rows[0]!.name, /^ekavio_v208f_/);
    for (const module of initialModuleCatalogue.filter(item => !['crm','purchasing'].includes(item.key))) {
      await client.query('INSERT INTO module_definitions(key,display_name,description,category,commercial_type,status,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,now(),now())', [module.key,module.displayName,module.description,module.category,module.commercialType,module.status,module.version]);
    }
    for (const plan of initialPlans) {
      const id = (await client.query('INSERT INTO plans(key,name,description,status,available,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,now(),now()) RETURNING id', [plan.key,plan.name,plan.description,plan.status,plan.available,plan.version])).rows[0]!.id;
      for (const key of plan.moduleKeys) await client.query('INSERT INTO plan_modules(plan_id,module_definition_id) SELECT $1,id FROM module_definitions WHERE key=$2', [id,key]);
      for (const limit of plan.limits) await client.query('INSERT INTO plan_limits(plan_id,limit_key,value) VALUES($1,$2,$3)', [id,limit.key,limit.value]);
    }
    for (const addon of initialAddOns.filter(item => !item.moduleKeys.some(k=>['crm','purchasing'].includes(k)))) {
      const id = (await client.query('INSERT INTO add_ons(key,name,description,status,available,version,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,now(),now()) RETURNING id', [addon.key,addon.name,addon.description,addon.status,addon.available,addon.version])).rows[0]!.id;
      for (const key of addon.moduleKeys) await client.query('INSERT INTO add_on_modules(add_on_id,module_definition_id) SELECT $1,id FROM module_definitions WHERE key=$2', [id,key]);
    }
  });
}
