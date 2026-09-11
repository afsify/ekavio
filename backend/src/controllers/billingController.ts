import type { Response, NextFunction } from 'express';
import type { AuthenticatedRequest } from '../middlewares/authMiddleware.js';

export const getInvoices = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const tenantId = req.user?.tenantId;
    
    // Mock invoices since we don't have a real Billing DB model setup yet
    const mockInvoices = [
      {
        id: 'INV-2023-001',
        date: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        amount: 2999,
        status: 'paid',
        plan: 'Pro Tier',
      },
      {
        id: 'INV-2023-002',
        date: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(),
        amount: 2999,
        status: 'paid',
        plan: 'Pro Tier',
      }
    ];

    res.json({
      success: true,
      data: mockInvoices
    });
  } catch (error) {
    next(error);
  }
};

export const createPaymentOrder = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { planId } = req.body;
    
    // Calculate mock amount based on planId
    let amount = 999;
    if (planId === 'pro') amount = 2999;
    if (planId === 'enterprise') amount = 9999;

    // Return a mock order ID
    res.status(201).json({
      success: true,
      data: {
        orderId: `order_${Math.random().toString(36).substring(7)}`,
        amount: amount,
        currency: 'INR'
      }
    });
  } catch (error) {
    next(error);
  }
};
