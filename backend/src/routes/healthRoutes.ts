import { Router } from 'express';

export type ReadinessProbe = () => boolean;

export const createHealthRouter = (isReady: ReadinessProbe): Router => {
  const router = Router();

  router.get('/live', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  router.get('/ready', (_request, response) => {
    const mongoReady = isReady();

    response.status(mongoReady ? 200 : 503).json({
      status: mongoReady ? 'ready' : 'not_ready',
      dependencies: {
        mongodb: mongoReady ? 'ready' : 'not_ready',
      },
    });
  });

  return router;
};
