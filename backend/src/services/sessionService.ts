import {
  createHmac,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto';
import { AppError } from '../utils/AppError.js';
import { getRuntimeConfig } from '../config/env.js';
import { runtimePersistence } from '../persistence/runtimePersistence.js';

export const REFRESH_SESSION_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

export interface SessionMetadata {
  userAgent?: string;
  ipAddress?: string;
}

export interface SessionRecord {
  sessionId: string;
  userId: string;
  refreshTokenHash: string;
  expiresAt: Date;
  lastUsedAt: Date;
  revokedAt: Date | null;
}

export interface CreateSessionRecord extends SessionRecord, SessionMetadata {}

export interface SessionRepository {
  create(record: CreateSessionRecord): Promise<void>;
  findBySessionId(sessionId: string): Promise<SessionRecord | null>;
  rotate(
    sessionId: string,
    previousHash: string,
    nextHash: string,
    now: Date,
    expiresAt: Date,
  ): Promise<boolean>;
  revoke(sessionId: string, refreshTokenHash: string, revokedAt: Date): Promise<void>;
  revokeAllForUser(userId: string, revokedAt: Date): Promise<void>;
}

export interface RefreshSession {
  sessionId: string;
  userId: string;
  refreshCredential: string;
  expiresAt: Date;
}

export interface RefreshSessionManager {
  create(userId: string, metadata?: SessionMetadata): Promise<RefreshSession>;
  rotate(refreshCredential: string): Promise<RefreshSession>;
  revoke(refreshCredential: string | undefined): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

const parseCredential = (
  refreshCredential: string,
): { sessionId: string; secret: string } | null => {
  const [sessionId, secret, extra] = refreshCredential.split('.');
  if (extra || !sessionId || !secret) {
    return null;
  }

  if (!/^[a-f0-9]{32}$/.test(sessionId) || !/^[A-Za-z0-9_-]{40,}$/.test(secret)) {
    return null;
  }

  return { sessionId, secret };
};

export const getSessionIdFromRefreshCredential = (
  refreshCredential: string | undefined,
): string | undefined => {
  if (!refreshCredential) return undefined;
  return parseCredential(refreshCredential)?.sessionId;
};

const hashesMatch = (left: string, right: string): boolean => {
  const leftBuffer = Buffer.from(left, 'hex');
  const rightBuffer = Buffer.from(right, 'hex');
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer);
};

export interface SessionManagerOptions {
  repository: SessionRepository;
  getHashSecret: () => string;
  now?: () => Date;
  random?: (size: number) => Buffer;
}

export const createRefreshSessionManager = ({
  repository,
  getHashSecret,
  now = () => new Date(),
  random = randomBytes,
}: SessionManagerOptions): RefreshSessionManager => {
  const hash = (credential: string): string =>
    createHmac('sha256', getHashSecret()).update(credential).digest('hex');

  const createCredential = (sessionId = random(16).toString('hex')): string =>
    `${sessionId}.${random(32).toString('base64url')}`;

  return {
    async create(userId, metadata = {}) {
      const createdAt = now();
      const expiresAt = new Date(createdAt.getTime() + REFRESH_SESSION_MAX_AGE_MS);
      const refreshCredential = createCredential();
      const parsed = parseCredential(refreshCredential);

      if (!parsed) {
        throw new Error('Failed to create refresh credential');
      }

      await repository.create({
        sessionId: parsed.sessionId,
        userId,
        refreshTokenHash: hash(refreshCredential),
        expiresAt,
        lastUsedAt: createdAt,
        revokedAt: null,
        ...(metadata.userAgent ? { userAgent: metadata.userAgent.slice(0, 512) } : {}),
        ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress.slice(0, 128) } : {}),
      });

      return { sessionId: parsed.sessionId, userId, refreshCredential, expiresAt };
    },

    async rotate(refreshCredential) {
      const parsed = parseCredential(refreshCredential);
      if (!parsed) {
        throw new AppError('Invalid refresh session', 401);
      }

      const session = await repository.findBySessionId(parsed.sessionId);
      const rotatedAt = now();
      const suppliedHash = hash(refreshCredential);

      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() <= rotatedAt.getTime() ||
        !hashesMatch(session.refreshTokenHash, suppliedHash)
      ) {
        throw new AppError('Invalid or expired refresh session', 401);
      }

      const nextCredential = createCredential(parsed.sessionId);
      const nextExpiresAt = new Date(rotatedAt.getTime() + REFRESH_SESSION_MAX_AGE_MS);
      const rotated = await repository.rotate(
        parsed.sessionId,
        suppliedHash,
        hash(nextCredential),
        rotatedAt,
        nextExpiresAt,
      );

      if (!rotated) {
        throw new AppError('Invalid or expired refresh session', 401);
      }

      return {
        sessionId: parsed.sessionId,
        userId: session.userId,
        refreshCredential: nextCredential,
        expiresAt: nextExpiresAt,
      };
    },

    async revoke(refreshCredential) {
      if (!refreshCredential) {
        return;
      }

      const parsed = parseCredential(refreshCredential);
      if (!parsed) {
        return;
      }

      await repository.revoke(parsed.sessionId, hash(refreshCredential), now());
    },

    async revokeAllForUser(userId) {
      await repository.revokeAllForUser(userId, now());
    },
  };
};

export const runtimeRefreshSessions = createRefreshSessionManager({
  repository: runtimePersistence.sessions,
  getHashSecret: () => getRuntimeConfig().refreshTokenSecret,
});
