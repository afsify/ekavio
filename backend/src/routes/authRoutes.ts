import { Router } from "express";
import { registerAdmin, login, updateTheme, refreshToken } from "../controllers/authController.js";
import { validateRequest } from "../middlewares/validateRequest.js";
import { authenticate } from "../middlewares/authMiddleware.js";
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
 *     summary: Authenticate user and return JWT access & refresh tokens
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
 *         description: Successful login returning tokens and user info
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 accessToken:
 *                   type: string
 *                   description: Short-lived JWT access token (15m)
 *                 refreshToken:
 *                   type: string
 *                   description: Long-lived JWT refresh token (7d)
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
router.put("/theme", authenticate as any, validateRequest(updateThemeSchema), updateTheme as any);
router.patch("/theme", authenticate as any, validateRequest(updateThemeSchema), updateTheme as any);

/**
 * @openapi
 * /auth/refresh:
 *   post:
 *     summary: Refresh access token using a refresh token
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - refreshToken
 *             properties:
 *               refreshToken:
 *                 type: string
 *     responses:
 *       200:
 *         description: Successfully refreshed tokens
 *       400:
 *         description: Refresh token required
 *       401:
 *         description: Invalid or expired refresh token
 */
router.post("/refresh", refreshToken as any);

export default router;
