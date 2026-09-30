import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { loadLegacyToolConfig } from '../config/env.js';
import { reconcileLegacyMongoCatalogue } from '../postgres/legacyMongoCatalogue.js';

dotenv.config({ quiet: true });
const config = loadLegacyToolConfig(process.env);

try {
  await connectDB(config.mongoUri);
  console.log(JSON.stringify(await reconcileLegacyMongoCatalogue(), null, 2));
} finally {
  await mongoose.disconnect();
}
