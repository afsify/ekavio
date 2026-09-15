import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadConfig } from '../config/env.js';
import { Session } from '../models/Session.js';
import { runMongoSessionRevocation } from '../services/mongoSessionCutoverService.js';

dotenv.config({ quiet: true });

const args = process.argv.slice(2);
if (args.some((argument) => argument !== '--apply') || args.filter((argument) => argument === '--apply').length > 1) {
  throw new Error('Usage: sessions:mongo:revoke [-- --apply]');
}
const apply = args.includes('--apply');
const config = loadConfig(process.env);
const hostname = new URL(config.mongoUri).hostname;
const localDevelopmentTarget = config.nodeEnv === 'development' &&
  ['mongo', 'localhost', '127.0.0.1', '::1'].includes(hostname);

if (apply && !localDevelopmentTarget) {
  throw new Error('Mongo session revocation apply is limited to an explicitly reviewed local development target');
}

try {
  await connectDB(config.mongoUri);
  const report = await runMongoSessionRevocation({
    apply,
    repository: {
      countExisting: () => Session.countDocuments({}),
      countRevocable: () => Session.countDocuments({ revokedAt: null }),
      async revokeAll(revokedAt) {
        const result = await Session.updateMany(
          { revokedAt: null },
          { $set: { revokedAt } },
        );
        return result.modifiedCount;
      },
    },
  });
  console.log(JSON.stringify({
    environment: 'local-development',
    ...report,
  }, null, 2));
} catch {
  console.error('Mongo refresh-session cutover revocation failed');
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
