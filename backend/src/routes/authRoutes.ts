import { Router, type RequestHandler } from "express";
import {
  registerAdmin,
  login,
  logout,
  refreshSession,
  updateTheme,
} from "../controllers/authController.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { authenticate, requirePermission } from "../middlewares/authMiddleware.js";
import { permissions } from '../services/authorizationPolicy.js';
import { registerSchema, loginSchema, updateThemeSchema } from "../schemas/authSchemas.js";

const router = Router();

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new organization and admin user
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - orgName
 *               - orgType
 *               - userName
 *               - phone
 *               - password
 *             properties:
 *               orgName:
 *                 type: string
 *                 description: Name of the organization
 *                 example: Ekavio Corp
 *               orgType:
 *                 type: string
 *                 description: Type of organization (e.g., Enterprise, SMB)
 *                 example: Enterprise
 *               userName:
 *                 type: string
 *                 description: Full name of the admin user
 *                 example: John Doe
 *               phone:
 *                 type: string
 *                 description: Phone number of the admin user
 *                 example: "+1234567890"
 *               password:
 *                 type: string
 *                 description: Password (minimum 6 characters)
 *                 example: secret123
 *     responses:
 *       201:
 *         description: Organization and Admin registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                   example: Organization and Admin registered successfully
 *                 organization:
 *                   type: object
 *                 user:
 *                   type: object
 *       400:
 *         description: Bad request (validation error)
 *       500:
 *         description: Internal server error
 */
router.post("/register", validateRequest(registerSchema), registerAdmin);

/**
 * @openapi
 * /auth/login:
 *   post:
 *     summary: Authenticate user and create a revocable refresh session
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - phone
 *               - password
 *             properties:
 *               phone:
 *                 type: string
 *                 description: User's registered phone number
 *                 example: "+1234567890"
 *               password:
 *                 type: string
 *                 description: User's password
 *                 example: secret123
 *     responses:
 *       200:
 *         description: Successful login returning an access token and safe user context; the refresh credential is set as an HttpOnly cookie
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: Short-lived JWT access token (15m)
 *                 userId:
 *                   type: string
 *                 tenantId:
 *                   type: string
 *                 role:
 *                   type: string
 *                 user:
 *                   type: object
 *       400:
 *         description: Bad request (validation error)
 *       401:
 *         description: Invalid credentials
 *       500:
 *         description: Internal server error
 */
router.post("/login", validateRequest(loginSchema), login);

/**
 * @openapi
 * /auth/theme:
 *   put:
 *     summary: Update organization theme configuration (Protected)
 *     tags:
 *       - Auth
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               mode:
 *                 type: string
 *                 enum: [light, dark]
 *               primaryColor:
 *                 type: string
 *                 example: "#4F46E5"
 *     responses:
 *       200:
 *         description: Theme updated successfully
 *       401:
 *         description: Unauthorized
 */
router.put(
  "/theme",
  authenticate as RequestHandler,
  requirePermission(permissions.ORGANIZATION_MANAGE) as RequestHandler,
  validateRequest(updateThemeSchema),
  updateTheme as RequestHandler,
);
router.patch(
  "/theme",
  authenticate as RequestHandler,
  requirePermission(permissions.ORGANIZATION_MANAGE) as RequestHandler,
  validateRequest(updateThemeSchema),
  updateTheme as RequestHandler,
);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Rotate the HttpOnly refresh session and issue a new access token
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Successfully rotated the refresh cookie and returned a new access token and safe user context
 *       401:
 *         description: Missing, invalid, revoked, or expired refresh session
 */
router.post("/refresh", refreshSession as RequestHandler);

/**
 * @openapi
 * /auth/logout:
 *   post:
 *     summary: Revoke the current refresh session and clear its HttpOnly cookie
 *     tags:
 *       - Auth
 *     responses:
 *       200:
 *         description: Logout completed; repeated requests are safe
 */
router.post("/logout", logout as RequestHandler);

export default router;
