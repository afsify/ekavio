import type { Request, Response, NextFunction } from 'express';
import type { ZodSchema } from 'zod';

export const validateRequest = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      res.status(400).json({
        status: 'fail',
        errors: result.error.issues,
      });
      return;
    }
    req.body = result.data;
    next();
  };
};
