import type { PostgresDatabase } from '../../postgres/database.js';

interface LocalParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
  millisecond: number;
}

const parseLocal = (value: string): LocalParts => {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/.exec(value);
  if (!match) throw new Error('Local datetime must use YYYY-MM-DDTHH:mm[:ss[.SSS]]');
  const parts: LocalParts = {
    year: Number(match[1]), month: Number(match[2]), day: Number(match[3]),
    hour: Number(match[4]), minute: Number(match[5]), second: Number(match[6] ?? 0),
    millisecond: Number((match[7] ?? '').padEnd(3, '0') || 0),
  };
  const probe = new Date(Date.UTC(
    parts.year, parts.month - 1, parts.day, parts.hour, parts.minute, parts.second, parts.millisecond,
  ));
  if (
    probe.getUTCFullYear() !== parts.year || probe.getUTCMonth() + 1 !== parts.month
    || probe.getUTCDate() !== parts.day || probe.getUTCHours() !== parts.hour
    || probe.getUTCMinutes() !== parts.minute || probe.getUTCSeconds() !== parts.second
  ) throw new Error('Local datetime contains an invalid calendar value');
  return parts;
};

const formatterFor = (timeZone: string): Intl.DateTimeFormat => {
  try {
    return new Intl.DateTimeFormat('en-CA-u-ca-iso8601-nu-latn', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    });
  } catch {
    throw new Error(`Invalid IANA timezone: ${timeZone}`);
  }
};

const partsAt = (formatter: Intl.DateTimeFormat, instant: number): Omit<LocalParts, 'millisecond'> => {
  const values = Object.fromEntries(
    formatter.formatToParts(new Date(instant))
      .filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, Number(value)]),
  );
  return {
    year: values.year!, month: values.month!, day: values.day!, hour: values.hour!,
    minute: values.minute!, second: values.second!,
  };
};

const sameLocal = (left: Omit<LocalParts, 'millisecond'>, right: LocalParts): boolean =>
  left.year === right.year && left.month === right.month && left.day === right.day
  && left.hour === right.hour && left.minute === right.minute && left.second === right.second;

export const branchLocalDateTimeToInstant = (localDateTime: string, timeZone: string): Date => {
  const local = parseLocal(localDateTime);
  const formatter = formatterFor(timeZone);
  const naive = Date.UTC(
    local.year, local.month - 1, local.day, local.hour, local.minute, local.second, local.millisecond,
  );
  const offsets = new Set<number>();
  for (let hours = -36; hours <= 36; hours += 6) {
    const sampled = naive + hours * 3_600_000;
    const displayed = partsAt(formatter, sampled);
    offsets.add(Date.UTC(
      displayed.year, displayed.month - 1, displayed.day,
      displayed.hour, displayed.minute, displayed.second,
    ) - (sampled - (sampled % 1000)));
  }
  const matches = [...offsets]
    .map((offset) => naive - offset)
    .filter((candidate) => sameLocal(partsAt(formatter, candidate), local));
  const unique = [...new Set(matches)];
  if (unique.length === 0) throw new Error('Local datetime does not exist in the branch timezone');
  if (unique.length > 1) throw new Error('Local datetime is ambiguous in the branch timezone');
  return new Date(unique[0]!);
};

export const instantToBranchLocalDateTime = (instant: Date, timeZone: string): string => {
  if (Number.isNaN(instant.getTime())) throw new Error('Invalid instant');
  const parts = partsAt(formatterFor(timeZone), instant.getTime());
  const pad = (value: number): string => String(value).padStart(2, '0');
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}T${pad(parts.hour)}:${pad(parts.minute)}:${pad(parts.second)}`;
};

export class BranchTimezoneRepository {
  public constructor(private readonly database: PostgresDatabase) {}

  public async resolve(organizationId: string, branchId: string): Promise<string> {
    const result = await this.database.query<{ timezone: string | null }>(`
      SELECT timezone
      FROM branches
      WHERE id = $1 AND organization_id = $2 AND status = 'active'
    `, [branchId, organizationId]);
    const timezone = result.rows[0]?.timezone;
    if (!timezone) throw new Error('Active branch has no reviewed IANA timezone');
    formatterFor(timezone);
    return timezone;
  }
}
