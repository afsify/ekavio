export interface LegacyAttendanceSourceRecord {
  id: string;
  legacyOrganizationId: string;
  legacyUserId: string;
  date: Date;
  status: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AttendanceLegacySource {
  load(): Promise<LegacyAttendanceSourceRecord[]>;
}

export interface AttendanceOrganizationMapping {
  legacyOrganizationId: string;
  organizationId: string;
  branchResolutions: Record<string, string>;
}

export interface AttendanceMigrationMapping {
  version: 1;
  organizations: AttendanceOrganizationMapping[];
}
