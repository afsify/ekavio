import type { Response, NextFunction } from "express";
import type { AuthenticatedRequest } from "../middlewares/authMiddleware.js";
import { createAppError } from "../utils/AppError.js";
import { createTokenService, getQueueService, updateTokenStatusService } from "../services/queueService.js";

export const createToken = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(createAppError("Tenant ID missing from request context", 401));
      return;
    }

    const queueEntry = await createTokenService(tenantId, req.body);
    res
      .status(201)
      .json({ message: "Token created successfully", data: queueEntry });
  } catch (error: any) {
    next(createAppError(error.message, 500));
  }
};

export const getQueue = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(createAppError("Tenant ID missing from request context", 401));
      return;
    }

    const result = await getQueueService(tenantId, req.query.page as any, req.query.limit as any);
    res.status(200).json(result);
  } catch (error: any) {
    next(createAppError(error.message, 500));
  }
};

export const updateTokenStatus = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    if (!tenantId) {
      next(createAppError("Tenant ID missing from request context", 401));
      return;
    }

    const { tokenId } = req.params;
    const { status } = req.body;

    const updatedToken = await updateTokenStatusService(tenantId, tokenId as string, status);

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
  } catch (error: any) {
    next(createAppError(error.message, 500));
  }
};
