import type { PostgresDatabase } from './database.js';
import { asPostgresUserId } from '../persistence/identifiers.js';
import type {
  CreateSessionRecord,
  SessionRecord,
  SessionRepository,
} from '../services/sessionService.js';

interface SessionRow {
  session_id: string;
  user_id: string;
  credential_hash: string;
  expires_at: Date;
  last_used_at: Date;
  revoked_at: Date | null;
}

const toSessionRecord = (row: SessionRow): SessionRecord => ({
  sessionId: row.session_id,
  userId: row.user_id,
  refreshTokenHash: row.credential_hash,
  expiresAt: row.expires_at,
  lastUsedAt: row.last_used_at,
  revokedAt: row.revoked_at,
});

export class PostgresSessionRepository implements SessionRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async create(record: CreateSessionRecord): Promise<void> {
    await this.database.query(
      `INSERT INTO auth_sessions
        (session_id, user_id, credential_hash, expires_at, last_used_at, revoked_at,
         user_agent, ip_address, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $5, $5)`,
      [
        record.sessionId,
        asPostgresUserId(record.userId),
        record.refreshTokenHash,
        record.expiresAt,
        record.lastUsedAt,
        record.revokedAt,
        record.userAgent ?? null,
        record.ipAddress ?? null,
      ],
    );
  }

  public async findBySessionId(sessionId: string): Promise<SessionRecord | null> {
    const result = await this.database.query<SessionRow>(
      `SELECT session_id, user_id, credential_hash, expires_at, last_used_at, revoked_at
       FROM auth_sessions
       WHERE session_id = $1`,
      [sessionId],
    );
    const row = result.rows[0];
    return row ? toSessionRecord(row) : null;
  }

  public async rotate(
    sessionId: string,
    previousHash: string,
    nextHash: string,
    now: Date,
    expiresAt: Date,
  ): Promise<boolean> {
    const result = await this.database.query(
      `UPDATE auth_sessions
       SET credential_hash = $3,
           last_used_at = $4,
           expires_at = $5,
           updated_at = $4
       WHERE session_id = $1
         AND credential_hash = $2
         AND revoked_at IS NULL
         AND expires_at > $4`,
      [sessionId, previousHash, nextHash, now, expiresAt],
    );
    return result.rowCount === 1;
  }

  public async revoke(
    sessionId: string,
    refreshTokenHash: string,
    revokedAt: Date,
  ): Promise<void> {
    await this.database.query(
      `UPDATE auth_sessions
       SET revoked_at = $3, updated_at = $3
       WHERE session_id = $1 AND credential_hash = $2 AND revoked_at IS NULL`,
      [sessionId, refreshTokenHash, revokedAt],
    );
  }

  public async revokeAllForUser(userId: string, revokedAt: Date): Promise<void> {
    await this.database.query(
      `UPDATE auth_sessions
       SET revoked_at = $2, updated_at = $2
       WHERE user_id = $1 AND revoked_at IS NULL`,
      [asPostgresUserId(userId), revokedAt],
    );
  }
}
