import swaggerJsdoc from 'swagger-jsdoc';
import type { Options } from 'swagger-jsdoc';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const options: Options = {
  definition: {
    openapi: '3.0.0',
    info: {
      title: 'Ekavio API',
      version: '1.0.0',
      description: 'API documentation for Ekavio backend',
    },
    servers: [
      {
        url: '/api',
      },
    ],
  },
  apis: [
    path.join(__dirname, '../routes/*.{ts,js}').replace(/\\/g, '/'),
    path.join(__dirname, '../controllers/*.{ts,js}').replace(/\\/g, '/'),
  ],
};

export const swaggerDocs = swaggerJsdoc(options);
