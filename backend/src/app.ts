import compression from 'compression';
import cors, { type CorsOptions } from 'cors';
import express from 'express';
import type { NextFunction, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import mongoose from 'mongoose';
import mongoSanitize from 'express-mongo-sanitize';
import swaggerUi from 'swagger-ui-express';
import type { RuntimeConfig } from './config/env.js';
import { swaggerDocs } from './config/swagger.js';
import routes from './routes/index.js';
import { createHealthRouter, type ReadinessProbe } from './routes/healthRoutes.js';
import { AppError } from './utils/AppError.js';

interface CreateAppOptions {
  config: RuntimeConfig;
  isReady?: ReadinessProbe;
}

interface OperationalError extends Error {
  statusCode?: number;
  status?: 'fail' | 'error';
  isOperational?: boolean;
}

const createOriginPolicy = (allowedOrigins: string[]): CorsOptions['origin'] => {
  return (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
      return;
    }

    callback(new AppError('Origin is not allowed by CORS policy', 403));
  };
};

export const createApp = ({
  config,
  isReady = async () => ({
    mongodb: mongoose.connection.readyState === 1,
    postgresql: false,
  }),
}: CreateAppOptions) => {
  const app = express();
  const apiLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 100,
    standardHeaders: true,
    legacyHeaders: false,
    message: {
      status: 'fail',
      message: 'Too many requests from this IP, please try again after 15 minutes',
    },
  });

  app.use(helmet());
  app.use(compression());
  app.use(cors({
    origin: createOriginPolicy(config.httpAllowedOrigins),
    credentials: true,
  }));
  app.use(express.json());

  app.use('/health', createHealthRouter(isReady));
  app.use(mongoSanitize());
  app.use('/api', apiLimiter, routes);
  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

  app.get('/', (_request: Request, response: Response) => {
    response.send('Ekavio API is running');
  });

  app.use(
    (
      error: OperationalError,
      _request: Request,
      response: Response,
      _next: NextFunction,
    ) => {
      console.error(error.stack);

      if (error instanceof AppError || error.isOperational) {
        response.status(error.statusCode ?? 400).json({
          status: error.status ?? 'fail',
          message: error.message,
        });
        return;
      }

      const statusCode = error.statusCode ?? 500;
      const status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

      response.status(statusCode).json({
        status: error.status ?? status,
        message: error.message || 'Internal Server Error',
      });
    },
  );

  return app;
};
