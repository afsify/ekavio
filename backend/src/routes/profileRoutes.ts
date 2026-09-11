import { Router } from 'express';
import { updateProfile, changePassword } from '../controllers/profileController.js';
import { authenticate } from '../middlewares/authMiddleware.js';

const router = Router();

router.use(authenticate);

/**
 * @openapi
 * /profile:
 *   put:
 *     summary: Update user profile
 *     tags:
 *       - Profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *             properties:
 *               name:
 *                 type: string
 *                 example: John Doe
 *     responses:
 *       200:
 *         description: Profile updated
 *       400:
 *         description: Bad request
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/', updateProfile);

/**
 * @openapi
 * /profile/password:
 *   put:
 *     summary: Change user password
 *     tags:
 *       - Profile
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - oldPassword
 *               - newPassword
 *             properties:
 *               oldPassword:
 *                 type: string
 *                 example: oldsecurepassword
 *               newPassword:
 *                 type: string
 *                 example: newsecurepassword
 *     responses:
 *       200:
 *         description: Password changed successfully
 *       400:
 *         description: Bad request (e.g. invalid old password)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */
router.put('/password', changePassword);

export default router;
