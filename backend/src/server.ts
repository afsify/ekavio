import dotenv from 'dotenv';
import http, { type Server } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { connectDB, disconnectDB } from './config/db.js';
import { initializeRuntimeConfig } from './config/env.js';
import { closeSocket, setupSocket } from './config/socket.js';
import { runtimePostgresDatabase } from './persistence/runtimePersistence.js';
import mongoose from 'mongoose';

export const startServer = async (): Promise<Server> => {
  dotenv.config({ quiet: true });
  const config = initializeRuntimeConfig();
  const postgres = runtimePostgresDatabase;
  const app = createApp({
    config,
    isReady: async () => ({
      mongodb: mongoose.connection.readyState === 1,
      postgresql: await postgres.isReady(),
    }),
  });
  const server = http.createServer(app);

  setupSocket(server, config);

  try {
    await Promise.all([
      connectDB(config.mongoUri),
      postgres.query('SELECT 1'),
    ]);
  } catch {
    await Promise.allSettled([closeSocket(), disconnectDB(), postgres.close()]);
    throw new Error('Required database connectivity could not be established');
  }

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(config.port, '0.0.0.0', () => {
      server.off('error', reject);
      console.log(`Server is running on port ${config.port}`);
      resolve();
    });
  });

  let shuttingDown = false;
  const shutdown = async (): Promise<void> => {
    if (shuttingDown) return;
    shuttingDown = true;
    // Socket.IO owns the attached HTTP server and awaits its close.
    await closeSocket();
    await Promise.allSettled([disconnectDB(), postgres.close()]);
    console.log('Server shutdown complete');
  };

  process.once('SIGINT', () => void shutdown());
  process.once('SIGTERM', () => void shutdown());

  return server;
};

const entryPath = process.argv[1];
const isEntryPoint = Boolean(
  entryPath && import.meta.url === pathToFileURL(path.resolve(entryPath)).href,
);

if (isEntryPoint) {
  startServer().catch(() => {
    console.error('Server startup failed');
    process.exitCode = 1;
  });
}
