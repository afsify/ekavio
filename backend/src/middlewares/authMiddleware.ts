import type { Request, Response, NextFunction } from "express";
import jwt, { type JwtPayload } from "jsonwebtoken";
import { getRuntimeConfig } from "../config/env.js";

// Using a Type Intersection instead of OOP interface extending
export type AuthenticatedRequest = Request & {
  user?: {
    id: string;
    tenantId: string;
    role: string;
    sessionId: string;
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
    const decoded = jwt.verify(token, getRuntimeConfig().jwtSecret) as JwtPayload;
    if (
      typeof decoded.id !== 'string' ||
      typeof decoded.tenantId !== 'string' ||
      typeof decoded.role !== 'string' ||
      typeof decoded.sessionId !== 'string'
    ) {
      throw new Error('Invalid access token claims');
    }

    const requestedTenantId = req.headers['x-tenant-id'] as string;
    let finalTenantId = decoded.tenantId as string;
    let finalRole = decoded.role as string;

    if (requestedTenantId && requestedTenantId !== finalTenantId) {
      // Dynamic import to avoid circular dependencies if any, but since it's middleware we can just import User
      const { User } = await import("../models/User.js");
      const userRecord = await User.findById(decoded.id);
      
      if (!userRecord) {
        res.status(401).json({ message: "User not found" });
        return;
      }

      const assignment = userRecord.assignments?.find(
        (a) => a.tenantId.toString() === requestedTenantId
      );

      if (!assignment) {
        res.status(403).json({ message: "Access denied to this tenant" });
        return;
      }

      finalTenantId = requestedTenantId;
      finalRole = assignment.role;
    }

    req.user = {
      id: decoded.id as string,
      tenantId: finalTenantId,
      role: finalRole,
      sessionId: decoded.sessionId,
    };

    next();
  } catch {
    res.status(401).json({ message: "Invalid or expired token" });
  }
};
