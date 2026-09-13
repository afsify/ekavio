import dotenv from 'dotenv';
import http, { type Server } from 'node:http';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createApp } from './app.js';
import { connectDB } from './config/db.js';
import { initializeRuntimeConfig } from './config/env.js';
import { setupSocket } from './config/socket.js';

export const startServer = async (): Promise<Server> => {
  dotenv.config();
  const config = initializeRuntimeConfig();
  const app = createApp({ config });
  const server = http.createServer(app);

  setupSocket(server, config);

  await new Promise<void>((resolve) => {
    server.listen(config.port, () => {
      console.log(`Server is running on port ${config.port}`);
      resolve();
    });
  });

  void connectDB(config.mongoUri).catch((error: unknown) => {
    console.error('MongoDB connection error:', error);
  });

  return server;
};

const entryPath = process.argv[1];
const isEntryPoint = Boolean(
  entryPath && import.meta.url === pathToFileURL(path.resolve(entryPath)).href,
);

if (isEntryPoint) {
  startServer().catch((error: unknown) => {
    console.error('Server startup failed:', error);
    process.exitCode = 1;
  });
}
