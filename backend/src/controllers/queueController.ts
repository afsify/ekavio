import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware.js";
import { createAppError, getErrorMessage } from "../utils/AppError.js";
import { createTokenService, getQueueService, updateTokenStatusService } from "../services/queueService.js";
import { requireAuthorizationContext } from '../utils/tenantScope.js';

export const createToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const queueEntry = await createTokenService(context, req.body);
    res
      .status(201)
      .json({ message: "Token created successfully", data: queueEntry });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};

export const getQueue = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const result = await getQueueService(
      context,
      req.query.page as string | undefined,
      req.query.limit as string | undefined,
    );
    res.status(200).json(result);
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};

export const updateTokenStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const context = requireAuthorizationContext(req);
    const { tokenId } = req.params;
    const { status } = req.body;

    const updatedToken = await updateTokenStatusService(context, tokenId as string, status);

    if (!updatedToken) {
      next(createAppError("Token not found or does not belong to tenant", 404));
      return;
    }

    res
      .status(200)
      .json({
        message: "Token status updated successfully",
        data: updatedToken,
      });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};
