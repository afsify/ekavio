import express from 'express';
import type { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import { connectDB } from './config/db.js';
import dotenv from 'dotenv';
import routes from './routes/index.js';
import swaggerUi from 'swagger-ui-express';
import { swaggerDocs } from './config/swagger.js';
import { AppError } from './utils/AppError.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api', routes);
app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));

// Basic Route
app.get('/', (req: Request, res: Response) => {
  res.send('Ekavio API is running');
});

// Global Error Handling Middleware
app.use((err: any, req: Request, res: Response, next: NextFunction) => {
  console.error(err.stack);

  if (err instanceof AppError || err.isOperational) {
    res.status(err.statusCode || 400).json({
      status: err.status || 'fail',
      message: err.message,
    });
    return;
  }

  const statusCode = typeof err.statusCode === 'number' ? err.statusCode : 500;
  const status = `${statusCode}`.startsWith('4') ? 'fail' : 'error';

  res.status(statusCode).json({
    status: err.status || status,
    message: err.message || 'Internal Server Error',
  });
});

// Start Server
export const startServer = async (): Promise<void> => {
  if (process.env.MONGO_URI) {
    await connectDB(process.env.MONGO_URI);
  } else {
    console.warn('MONGO_URI is not defined in environment variables. Running without DB connection.');
  }

  app.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
  });
};

startServer();
