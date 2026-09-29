import { Attendance } from '../../models/Attendance.js';
import type {
  AttendanceLegacySource,
  LegacyAttendanceSourceRecord,
} from './migrationTypes.js';

interface LeanAttendanceRecord {
  _id: { toString(): string };
  tenantId: { toString(): string };
  userId: { toString(): string };
  date: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export class MongoAttendanceLegacySource implements AttendanceLegacySource {
  public async load(): Promise<LegacyAttendanceSourceRecord[]> {
    const rows = await Attendance.find({}).sort({ _id: 1 }).lean().exec() as unknown as LeanAttendanceRecord[];
    return rows.map((row) => ({
      id: row._id.toString(),
      legacyOrganizationId: row.tenantId.toString(),
      legacyUserId: row.userId.toString(),
      date: new Date(row.date),
      status: row.status,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
    }));
  }
}
