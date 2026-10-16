import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, type AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { createRequireEntitlement } from '../middlewares/tenantMiddleware.js';
import { runtimePostgresDatabase } from '../persistence/runtimePersistence.js';
import { TaskService } from '../domains/tasks/service.js';
import { AppError } from '../utils/AppError.js';
import { mapOperationalError } from '../services/operationalRuntimeService.js';

export function createTaskRouter(service = new TaskService(runtimePostgresDatabase), authentication: RequestHandler = authenticate) {
  const router = Router();
  router.use((_request, response, next) => { response.setHeader('Cache-Control', 'no-store'); next(); });
  router.use(authentication, createRequireEntitlement(service.entitlements)('tasks'));
  const id = (request: AuthenticatedRequest) => z.uuid().parse(request.params.id);
  const handle = (operation: (request: AuthenticatedRequest) => Promise<unknown>, status = 200): RequestHandler =>
    async (request, response, next) => {
      try { response.status(status).json({ data: await operation(request) }); }
      catch (error) {
        if (error instanceof z.ZodError) { next(new AppError('Invalid Task input', 400)); return; }
        const code = error && typeof error === 'object' && 'code' in error ? String(error.code) : '';
        next(['23505', '23514', '40001', '55P03', '40P01'].includes(code)
          ? new AppError('Task command conflicts with current state, version or history; reload and resolve', 409)
          : mapOperationalError(error));
      }
    };
  router.get('/', handle(r => service.list(r.auth!, r.query)));
  router.get('/assignees', handle(r => service.assignees(r.auth!, r.query)));
  router.post('/', handle(r => service.create(r.auth!, r.body), 201));
  router.get('/:id/history', handle(r => service.history(r.auth!, id(r), r.query)));
  router.get('/:id', handle(r => service.detail(r.auth!, id(r))));
  router.patch('/:id', handle(r => service.update(r.auth!, id(r), r.body)));
  router.post('/:id/status', handle(r => service.progress(r.auth!, id(r), r.body)));
  router.post('/:id/cancel', handle(r => service.lifecycle(r.auth!, id(r), 'cancel', r.body)));
  router.post('/:id/reopen', handle(r => service.lifecycle(r.auth!, id(r), 'reopen', r.body)));
  return router;
}
export default createTaskRouter();
