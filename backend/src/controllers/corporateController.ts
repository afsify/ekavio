import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';
import { ParentOrganization } from '../models/ParentOrganization.js';
import { Organization } from '../models/Organization.js';
import { createAppError, getErrorMessage } from '../utils/AppError.js';

export const createParentOrg = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { name, consolidatedBilling } = req.body;
    const ownerId = req.user?.id;

    if (!ownerId) {
      next(createAppError('User ID missing from request', 401));
      return;
    }

    const parentOrg = new ParentOrganization({
      name,
      ownerId,
      consolidatedBilling: consolidatedBilling !== undefined ? consolidatedBilling : true,
    });

    await parentOrg.save();

    res.status(201).json({ message: 'Parent organization created successfully', data: parentOrg });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};

export const linkChildOrg = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const { parentId, childOrgId } = req.body;

    const parentOrg = await ParentOrganization.findById(parentId);
    if (!parentOrg) {
      next(createAppError('Parent organization not found', 404));
      return;
    }

    // Optional: check if the user is the owner of the parent org
    if (parentOrg.ownerId.toString() !== req.user?.id) {
      next(createAppError('Unauthorized to link organizations to this parent', 403));
      return;
    }

    const childOrg = await Organization.findByIdAndUpdate(
      childOrgId,
      { parentId },
      { new: true, runValidators: true }
    );

    if (!childOrg) {
      next(createAppError('Child organization not found', 404));
      return;
    }

    res.status(200).json({ message: 'Organization linked successfully', data: childOrg });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};

export const getConsolidatedBilling = async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
  try {
    const parentId = req.params.parentId as string;

    const parentOrg = await ParentOrganization.findById(parentId);
    if (!parentOrg) {
      next(createAppError('Parent organization not found', 404));
      return;
    }

    if (parentOrg.ownerId.toString() !== req.user?.id && req.user?.role !== 'admin') {
      next(createAppError('Unauthorized to view consolidated billing', 403));
      return;
    }

    const childOrgs = await Organization.find({ parentId });
    
    // Assume each active module costs ₹199/month for this demonstration
    const MODULE_COST = 199;
    let totalCost = 0;
    
    const billingDetails = childOrgs.map(org => {
      const orgCost = (org.activeModules?.length || 0) * MODULE_COST;
      totalCost += orgCost;
      return {
        orgId: org._id,
        name: org.name,
        activeModulesCount: org.activeModules?.length || 0,
        cost: orgCost
      };
    });

    res.status(200).json({
      data: {
        parentOrg: parentOrg.name,
        totalCost,
        currency: 'INR',
        billingDetails
      }
    });
  } catch (error: unknown) {
    next(createAppError(getErrorMessage(error), 500));
  }
};
