import { Router, type RequestHandler } from 'express';
import { z } from 'zod';
import { authenticate, requirePermission, type AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { validateRequest } from '../middlewares/validateRequest.js';
import { IdentityAccountService } from '../services/identityAccountService.js';
import { emailSchema, passwordSchema } from '../services/identityPolicy.js';
import { createEmailService } from '../services/emailService.js';
import { runtimePostgresDatabase } from '../persistence/runtimePersistence.js';
import { getRuntimeConfig } from '../config/env.js';
import { disconnectUserSockets } from '../config/socket.js';
import { clearRefreshCookie } from '../utils/authCookies.js';
import { permissions } from '../services/authorizationPolicy.js';

const token = z.string().length(43).regex(/^[A-Za-z0-9_-]+$/);
const tokenBody = z.object({ token }).strict();
const passwordBody = z.object({ token, password: passwordSchema }).strict();
const empty = z.object({}).strict();
const appearance = z.object({ mode: z.enum(['light', 'dark', 'system']), primaryColor: z.enum(['#4F46E5','#087443','#7040BC','#B42358']) }).strict();
const invitation = z.object({ name: z.string().trim().min(1).max(200), phone: z.string().trim().max(32), email: emailSchema.optional(), role: z.enum(['admin','manager','hr','staff']), customRoleId:z.uuid().nullable().optional(), branchIds: z.array(z.uuid()).min(1).max(50).refine((values) => new Set(values).size === values.length) }).strict();
let runtimeService: IdentityAccountService | undefined;
export const getIdentityAccountService = () => {
  runtimeService ??= new IdentityAccountService(runtimePostgresDatabase, createEmailService(getRuntimeConfig().email!), disconnectUserSockets);
  return runtimeService;
};
// Dependency injection is explicit at router construction, never a public request
// switch or environment-enabled capture endpoint in the deployed application.
export const createIdentityAccountRouter = (getService = getIdentityAccountService) => {
  const router = Router();
  const handle = (operation: (request: AuthenticatedRequest) => Promise<unknown>): RequestHandler => async (request, response, next) => {
    try { response.setHeader('Cache-Control', 'no-store'); response.json({ data: await operation(request) }); } catch (error) { next(error); }
  };
  router.post('/forgot-password', validateRequest(z.object({ identifier: z.string().trim().min(1).max(254) }).strict()), handle((request) => getService().forgotPassword(request.body.identifier)));
  router.post('/inspect-action', validateRequest(z.object({ token, purpose: z.enum(['password_reset','email_verification','staff_invitation']) }).strict()), handle((request) => getService().inspectAction(request.body.token, request.body.purpose)));
  router.post('/verify-email', validateRequest(tokenBody), handle(async (request) => { await getService().verifyEmail(request.body.token); return { message: 'Email verified' }; }));
  router.post('/reset-password', validateRequest(passwordBody), async (request, response, next) => {
    try { await getService().resetPassword(request.body.token, request.body.password); clearRefreshCookie(response, getRuntimeConfig()); response.setHeader('Cache-Control','no-store'); response.json({ data: { message: 'Password reset. Sign in again.' } }); } catch (error) { next(error); }
  });
  router.post('/accept-invitation', validateRequest(passwordBody), handle(async (request) => { await getService().acceptInvitation(request.body.token, request.body.password); return { message: 'Account ready. Sign in.' }; }));
  router.post('/accept-existing-invitation', authenticate, validateRequest(tokenBody), handle(async request=>{await getService().acceptInvitation(request.body.token,undefined,request.auth!.userId);return {message:'Organization joined. Refresh your workspace context.'};}));
  router.get('/email', authenticate, handle((request) => getService().emailState(request.auth!.userId)));
  router.put('/email', authenticate, validateRequest(z.object({ email: emailSchema }).strict()), handle(async (request) => { await getService().proposeEmail(request.auth!.userId, request.body.email); return { message: 'Check your email to verify' }; }));
  router.post('/email/resend', authenticate, validateRequest(empty), handle(async (request) => { await getService().resendEmail(request.auth!.userId); return { message: 'Verification sent' }; }));
  router.get('/preferences', authenticate, handle((request) => getService().preferences(request.auth!.userId)));
  router.put('/preferences', authenticate, validateRequest(appearance), handle((request) => getService().savePreferences(request.auth!.userId, request.body)));
  return router;
};
export const createStaffInvitationRouter = (getService = getIdentityAccountService) => {
  const router = Router();
  router.use(authenticate, requirePermission(permissions.STAFF_MANAGE));
  router.get('/', async (request: AuthenticatedRequest, response, next) => {
    try { response.setHeader('Cache-Control','no-store'); response.json({ data: await getService().listInvitations(request.auth!) }); } catch (error) { next(error); }
  });
  router.post('/', validateRequest(invitation), async (request: AuthenticatedRequest, response, next) => {
    try { response.setHeader('Cache-Control','no-store'); response.status(201).json({ data: await getService().createInvitation(request.auth!, request.body) }); } catch (error) { next(error); }
  });
  router.delete('/:id', async (request: AuthenticatedRequest, response, next) => {
    try { const id = z.uuid().parse(request.params.id); await getService().revokeInvitation(request.auth!, id); response.json({ data: { message: 'Invitation revoked' } }); } catch (error) { next(error); }
  });
  return router;
};
