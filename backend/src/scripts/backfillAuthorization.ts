import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { initializeRuntimeConfig } from '../config/env.js';
import { runAuthorizationBackfill } from '../services/authorizationBackfillService.js';

dotenv.config();
const config = initializeRuntimeConfig();
const apply = process.argv.includes('--apply');

try {
  await connectDB(config.mongoUri);
  const result = await runAuthorizationBackfill({ apply });
  console.log(JSON.stringify(result, null, 2));
  if (!apply) {
    console.log('Dry run only. Re-run with --apply after reviewing the result.');
  }
} finally {
  await mongoose.disconnect();
}
