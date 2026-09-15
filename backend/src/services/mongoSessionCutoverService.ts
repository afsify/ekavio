export interface LegacyMongoSessionRevocationRepository {
  countExisting(): Promise<number>;
  countRevocable(): Promise<number>;
  revokeAll(revokedAt: Date): Promise<number>;
}

export interface MongoSessionRevocationReport {
  mode: 'dry-run' | 'apply';
  cutoverTimestamp: string;
  existingSessions: number;
  revocableSessions: number;
  revokedSessions: number;
}

export const runMongoSessionRevocation = async ({
  repository,
  apply = false,
  now = () => new Date(),
}: {
  repository: LegacyMongoSessionRevocationRepository;
  apply?: boolean;
  now?: () => Date;
}): Promise<MongoSessionRevocationReport> => {
  const cutoverAt = now();
  const [existingSessions, revocableSessions] = await Promise.all([
    repository.countExisting(),
    repository.countRevocable(),
  ]);
  const revokedSessions = apply ? await repository.revokeAll(cutoverAt) : 0;
  return {
    mode: apply ? 'apply' : 'dry-run',
    cutoverTimestamp: cutoverAt.toISOString(),
    existingSessions,
    revocableSessions,
    revokedSessions,
  };
};
