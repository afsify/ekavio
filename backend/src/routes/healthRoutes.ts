import { Router } from 'express';

export interface DependencyReadiness {
  mongodb: boolean;
  postgresql: boolean;
}

export type ReadinessProbe = () => Promise<DependencyReadiness>;

export const createHealthRouter = (isReady: ReadinessProbe): Router => {
  const router = Router();

  router.get('/live', (_request, response) => {
    response.status(200).json({ status: 'ok' });
  });

  router.get('/ready', async (_request, response) => {
    try {
      const readiness = await isReady();
      const ready = readiness.mongodb && readiness.postgresql;

      response.status(ready ? 200 : 503).json({
        status: ready ? 'ready' : 'not_ready',
        dependencies: {
          mongodb: readiness.mongodb ? 'ready' : 'not_ready',
          postgresql: readiness.postgresql ? 'ready' : 'not_ready',
        },
      });
    } catch {
      response.status(503).json({
        status: 'not_ready',
        dependencies: {
          mongodb: 'not_ready',
          postgresql: 'not_ready',
        },
      });
    }
  });

  return router;
};
