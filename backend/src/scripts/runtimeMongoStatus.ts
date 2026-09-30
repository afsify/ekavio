import dotenv from 'dotenv';
import { loadDatabaseConfig } from '../config/env.js';
import { isFinalRuntimeAuthorityActivated } from '../domains/runtimeRetirement/authority.js';
import { PostgresDatabase } from '../postgres/database.js';

dotenv.config({ quiet: true });
const config = loadDatabaseConfig(process.env);
const database = new PostgresDatabase(config.databaseUrl);
try {
  console.log(JSON.stringify({
    corporate: await isFinalRuntimeAuthorityActivated(database, 'corporate'),
    securityAudit: await isFinalRuntimeAuthorityActivated(database, 'security_audit'),
  }, null, 2));
} catch (error) {
  console.error(error instanceof Error ? error.message : 'Mongo retirement status failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
