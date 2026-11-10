import { PostgresAccountRepository } from '../../src/postgres/accountRepository.js';
import type { PostgresDatabase } from '../../src/postgres/database.js';
import type { RegistrationPersistenceInput, RegistrationResult } from '../../src/services/accountPersistence.js';
import { lockNewPhone } from '../../src/services/identityPolicy.js';
import { lockSeatCatalogue, lockOrganizationSeats, assertSeatCapacity } from '../../src/postgres/seatCapacity.js';
import { generateLegacyMongoOrganizationId, generateLegacyMongoBranchId, generateLegacyMongoUserId, generateLegacyMongoMembershipId } from '../../src/persistence/identifiers.js';

export async function licenseTestOrganization(database: PostgresDatabase, organizationId: string): Promise<void> {
  await database.transaction(async client => {
    await lockSeatCatalogue(client, true);
    await lockOrganizationSeats(client, organizationId);
    const plan = (await client.query("INSERT INTO plans(key,name,description,status,available,version,created_at,updated_at) VALUES ('qa-licensed','QA licensed','Synthetic only','active',false,1,now(),now()) ON CONFLICT(key) DO UPDATE SET name=excluded.name RETURNING id")).rows[0].id;
    await client.query("INSERT INTO plan_limits(plan_id,limit_key,value) VALUES ($1,'staff',100) ON CONFLICT(plan_id,limit_key) DO NOTHING",[plan]);
    await client.query("INSERT INTO subscriptions(organization_id,plan_id,status,source,starts_at,current_period_ends_at,created_at,updated_at) VALUES ($1,$2,'active','pilot',now()-interval '1 day',now()+interval '30 days',now(),now()) ON CONFLICT(organization_id) DO UPDATE SET plan_id=excluded.plan_id,status=excluded.status,starts_at=excluded.starts_at,current_period_ends_at=excluded.current_period_ends_at",[organizationId,plan]);
    await assertSeatCapacity(database,client,organizationId);
  });
}

// Test-only setup, not a runtime registration bypass. Explicit synthetic plan
// capacity precedes membership creation; ordinary registration still rejects.
export class LicensedTestAccounts extends PostgresAccountRepository {
  constructor(private readonly fixtureDatabase: PostgresDatabase) { super(fixtureDatabase); }
  override registerAdmin(input: RegistrationPersistenceInput): Promise<RegistrationResult> {
    return this.fixtureDatabase.transaction(async client => {
      await lockSeatCatalogue(client, true);
      await lockNewPhone(client, input.phone);
      const plan = (await client.query("INSERT INTO plans(key,name,description,status,available,version,created_at,updated_at) VALUES ('qa-licensed','QA licensed','Synthetic only','active',true,1,now(),now()) ON CONFLICT(key) DO UPDATE SET name=excluded.name RETURNING id")).rows[0].id;
      await client.query("INSERT INTO plan_limits(plan_id,limit_key,value) VALUES ($1,'staff',100) ON CONFLICT(plan_id,limit_key) DO NOTHING",[plan]);
      const organization = (await client.query("INSERT INTO organizations(name,type,theme_mode,theme_primary_color,created_at,updated_at,legacy_mongo_id) VALUES ($1,$2,'light','#4F46E5',now(),now(),$3) RETURNING id,name,type",[input.orgName,input.orgType,generateLegacyMongoOrganizationId()])).rows[0];
      await client.query("INSERT INTO subscriptions(organization_id,plan_id,status,source,starts_at,current_period_ends_at,created_at,updated_at) VALUES ($1,$2,'active','pilot',now()-interval '1 day',now()+interval '30 days',now(),now())",[organization.id,plan]);
      await lockOrganizationSeats(client,organization.id);
      await assertSeatCapacity(this.fixtureDatabase,client,organization.id,1);
      const branch = (await client.query("INSERT INTO branches(organization_id,name,code,status,created_at,updated_at,legacy_mongo_id) VALUES ($1,'Main','main','active',now(),now(),$2) RETURNING id,organization_id AS \"organizationId\",name,code,status",[organization.id,generateLegacyMongoBranchId()])).rows[0];
      const user = (await client.query('INSERT INTO users(name,phone,password_hash,created_at,updated_at,legacy_mongo_id) VALUES ($1,$2,$3,now(),now(),$4) RETURNING id,name,phone',[input.userName,input.phone,input.passwordHash,generateLegacyMongoUserId()])).rows[0];
      const member = (await client.query("INSERT INTO memberships(user_id,organization_id,role,status,created_at,updated_at,legacy_mongo_id) VALUES ($1,$2,'admin','active',now(),now(),$3) RETURNING id",[user.id,organization.id,generateLegacyMongoMembershipId()])).rows[0];
      await client.query('INSERT INTO membership_branch_assignments(membership_id,organization_id,branch_id) VALUES ($1,$2,$3)',[member.id,organization.id,branch.id]);
      return {organization,branch,user:{id:user.id,tenantId:organization.id,name:user.name,phone:user.phone,role:'admin'}};
    });
  }
}
