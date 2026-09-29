import dotenv from 'dotenv';
import { loadDatabaseConfig } from '../config/env.js';
import { isAttendanceAuthorityActivated } from '../domains/attendance/authority.js';
import { PostgresDatabase } from '../postgres/database.js';
import { getMigrationStatus } from '../postgres/migrations.js';

dotenv.config({ quiet: true });
const database = new PostgresDatabase(loadDatabaseConfig(process.env).databaseUrl);

try {
  const migrations = await getMigrationStatus(database);
  const migration = migrations.find(({ name }) => name === '009_attendance_runtime_authority.sql');
  const [activated, counts] = await Promise.all([
    migration?.state === 'applied' ? isAttendanceAuthorityActivated(database) : Promise.resolve(false),
    migration?.state === 'applied'
      ? database.query<{ total: string; imported: string }>(`
          SELECT COUNT(*)::text AS total,
            COUNT(*) FILTER (WHERE source = 'import')::text AS imported
          FROM attendance_records
        `)
      : Promise.resolve({ rows: [{ total: '0', imported: '0' }] }),
  ]);
  console.log(JSON.stringify({
    migration009: migration?.state ?? 'missing',
    authority: activated ? 'postgresql' : 'pending',
    attendanceRecords: Number(counts.rows[0]?.total ?? 0),
    importedRecords: Number(counts.rows[0]?.imported ?? 0),
  }, null, 2));
  if (migration?.state !== 'applied' || !activated) process.exitCode = 1;
} catch {
  console.error('Attendance cutover status failed');
  process.exitCode = 1;
} finally {
  await database.close();
}
