import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";

// Using a Type Intersection instead of OOP interface extending
export type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    tenantId: string;
    role: string;
  };
};

export const authenticate = async (
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  try {
    const authHeader = req.headers.authorization;

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      res.status(401).json({ message: "Authentication required" });
      return;
    }

    const token = authHeader.split(" ")[1];

    if (!token) {
      res.status(401).json({ message: "Token missing from header" });
      return;
    }

    // Functionally verify and decode the token
    const decoded = jwt.verify(
      token,
      process.env.JWT_SECRET || "fallback_secret",
    ) as JwtPayload;

    req.user = {
      id: decoded.id as string,
      tenantId: decoded.tenantId as string,
      role: decoded.role as string,
    };

    next();
  } catch (error) {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
