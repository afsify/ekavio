import dotenv from 'dotenv';
import { initializeRuntimeConfig } from '../config/env.js';
import { runtimePersistence, runtimePostgresDatabase } from '../persistence/runtimePersistence.js';

dotenv.config();
const config = initializeRuntimeConfig();

try {
  void config;
  console.log(JSON.stringify(await runtimePersistence.commercial.reconcileCatalogue(), null, 2));
} finally {
  await runtimePostgresDatabase.close();
}
