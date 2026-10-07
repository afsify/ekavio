import { runtimePostgresDatabase } from '../persistence/runtimePersistence.js';
import { DynamicFieldsService } from '../domains/dynamicFields/service.js';
export const dynamicFieldsService = new DynamicFieldsService(runtimePostgresDatabase);
