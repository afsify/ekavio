import { initializeRuntimeConfig } from '../config/env.js';
import { runtimePostgresDatabase } from '../persistence/runtimePersistence.js';
import { NotificationService } from '../domains/notifications/service.js';
if(process.argv.slice(2).join(' ')!=='--apply')throw new Error('Explicit --apply required: deletes up to 1,000 notifications read more than 90 days ago; unread/audit retained');
initializeRuntimeConfig(process.env);
try{console.log('Old read notifications removed:',await new NotificationService(runtimePostgresDatabase).pruneRead());}finally{await runtimePostgresDatabase.close();}
