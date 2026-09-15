import { Session } from '../models/Session.js';
import type { SessionRepository } from '../services/sessionService.js';

export const mongooseSessionRepository: SessionRepository = {
  async create(record) {
    await Session.create(record);
  },

  async findBySessionId(sessionId) {
    const session = await Session.findOne({ sessionId }).select('+refreshTokenHash').lean();
    return session
      ? {
          sessionId: session.sessionId,
          userId: String(session.userId),
          refreshTokenHash: session.refreshTokenHash,
          expiresAt: session.expiresAt,
          lastUsedAt: session.lastUsedAt,
          revokedAt: session.revokedAt ?? null,
        }
      : null;
  },

  async rotate(sessionId, previousHash, nextHash, now, expiresAt) {
    const session = await Session.findOneAndUpdate(
      { sessionId, refreshTokenHash: previousHash, revokedAt: null, expiresAt: { $gt: now } },
      { $set: { refreshTokenHash: nextHash, lastUsedAt: now, expiresAt } },
      { new: true },
    );
    return Boolean(session);
  },

  async revoke(sessionId, refreshTokenHash, revokedAt) {
    await Session.updateOne(
      { sessionId, refreshTokenHash, revokedAt: null },
      { $set: { revokedAt } },
    );
  },

  async revokeAllForUser(userId, revokedAt) {
    await Session.updateMany({ userId, revokedAt: null }, { $set: { revokedAt } });
  },
};
