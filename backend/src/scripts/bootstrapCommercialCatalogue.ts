import dotenv from 'dotenv';
import mongoose from 'mongoose';
import { connectDB } from '../config/db.js';
import { initializeRuntimeConfig } from '../config/env.js';
import { bootstrapCommercialCatalogue } from '../services/commercialCatalogueService.js';

dotenv.config();
const config = initializeRuntimeConfig();

try {
  await connectDB(config.mongoUri);
  console.log(JSON.stringify(await bootstrapCommercialCatalogue(), null, 2));
} finally {
  await mongoose.disconnect();
}
