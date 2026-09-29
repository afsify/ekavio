import React, { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import axios from 'axios';
import toast from 'react-hot-toast';
import {
  CalendarDays,
  CheckCircle2,
  Clock3,
  RefreshCw,
  ShieldAlert,
  Users,
  XCircle,
} from 'lucide-react';
import { client } from '../../api/client';
import { useAppStore } from '../../store/useAppStore';
import { Button } from '../../components/ui/Button';
import { Input } from '../../components/ui/Input';

type AttendanceStatus = 'present' | 'absent' | 'half_day';

interface AttendanceRecord {
  id: string;
  membershipId: string;
  attendanceDate: string;
  status: AttendanceStatus;
  checkInAt: string | null;
  checkOutAt: string | null;
  checkInLocal: string | null;
  checkOutLocal: string | null;
  version: number;
  source: 'manual' | 'kiosk' | 'import';
}

interface AttendanceRosterEntry {
  membershipId: string;
  displayName: string;
  role: string;
  membershipStatus: string;
  attendance: AttendanceRecord | null;
  correctionCount: number;
}

interface AttendanceRosterResponse {
  attendanceDate: string;
  branch: { id: string; name: string; timezone: string };
  summary: {
    total: number;
    present: number;
    absent: number;
    half_day: number;
    unmarked: number;
  };
  roster: AttendanceRosterEntry[];
}

interface PendingMark {
  entry: AttendanceRosterEntry;
  status: AttendanceStatus;
  checkInAt: string;
  checkOutAt: string;
  correctionReason: string;
  idempotencyKey: string;
}

const statusLabel = (status: AttendanceStatus | 'unmarked'): string => ({
  present: 'Present',
  absent: 'Absent',
  half_day: 'Half-day',
  unmarked: 'Unmarked',
})[status];

const statusClasses = (status: AttendanceStatus | 'unmarked'): string => ({
  present: 'border-emerald-500/20 bg-emerald-500/10 text-emerald-300',
  absent: 'border-rose-500/20 bg-rose-500/10 text-rose-300',
  half_day: 'border-amber-500/20 bg-amber-500/10 text-amber-200',
  unmarked: 'border-slate-700 bg-slate-800/60 text-slate-400',
})[status];

const toLocalInput = (value: string | null): string => value ? value.slice(0, 16) : '';

const errorMessage = (error: unknown): string => {
  if (axios.isAxiosError<{ error?: { message?: string }; message?: string }>(error)) {
    return error.response?.data?.error?.message
      ?? error.response?.data?.message
      ?? 'Attendance could not be updated.';
  }
  return error instanceof Error ? error.message : 'Attendance could not be updated.';
};

export const AttendancePage: React.FC = () => {
  const queryClient = useQueryClient();
  const activeTenantId = useAppStore((state) => state.activeTenantId);
  const activeBranchId = useAppStore((state) => state.activeBranchId);
  const permissions = useAppStore((state) => state.user?.permissions ?? []);
  const canManage = permissions.includes('attendance.manage');
  const [selectedDate, setSelectedDate] = useState('');
  const [pending, setPending] = useState<PendingMark | null>(null);

  const rosterQuery = useQuery({
    queryKey: ['attendance-roster', activeTenantId, activeBranchId, selectedDate || 'branch-today'],
    queryFn: async () => {
      const response = await client.get<{ data: AttendanceRosterResponse }>('/attendance', {
        params: selectedDate ? { date: selectedDate } : undefined,
      });
      return response.data.data;
    },
    enabled: Boolean(activeTenantId && activeBranchId),
  });

  const markMutation = useMutation({
    mutationFn: async (input: PendingMark) => {
      const correction = input.entry.attendance;
      const response = await client.post('/attendance', {
        membershipId: input.entry.membershipId,
        attendanceDate: rosterQuery.data!.attendanceDate,
        status: input.status,
        checkInAt: input.status === 'absent' ? null : input.checkInAt || null,
        checkOutAt: input.status === 'absent' ? null : input.checkOutAt || null,
        ...(correction
          ? {
              expectedVersion: correction.version,
              correctionReason: input.correctionReason.trim(),
            }
          : { idempotencyKey: input.idempotencyKey }),
      });
      return response.data;
    },
    onSuccess: async () => {
      toast.success(pending?.entry.attendance ? 'Attendance correction saved' : 'Attendance marked');
      setPending(null);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['attendance-roster'] }),
        queryClient.invalidateQueries({ queryKey: ['dashboardStats'] }),
      ]);
    },
    onError: async (error) => {
      const message = errorMessage(error);
      toast.error(/version conflict/i.test(message)
        ? 'Attendance changed elsewhere. The latest state has been reloaded.'
        : message);
      if (axios.isAxiosError(error) && error.response?.status === 409) {
        setPending(null);
        await queryClient.invalidateQueries({ queryKey: ['attendance-roster'] });
      }
    },
  });

  const beginMark = (entry: AttendanceRosterEntry, status: AttendanceStatus) => {
    setPending({
      entry,
      status,
      checkInAt: toLocalInput(entry.attendance?.checkInLocal ?? null),
      checkOutAt: toLocalInput(entry.attendance?.checkOutLocal ?? null),
      correctionReason: '',
      idempotencyKey: crypto.randomUUID(),
    });
  };

  const filteredRoster = useMemo(
    () => rosterQuery.data?.roster ?? [],
    [rosterQuery.data?.roster],
  );
  const pendingIsCorrection = Boolean(pending?.entry.attendance);
  const pendingInvalid = !pending
    || (pendingIsCorrection && pending.correctionReason.trim().length < 3)
    || Boolean(pending.status !== 'absent'
      && pending.checkInAt
      && pending.checkOutAt
      && new Date(pending.checkOutAt) <= new Date(pending.checkInAt));

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-6">
      <header className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-xl sm:p-6">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-indigo-500/20 p-3 text-indigo-300"><Users className="h-7 w-7" /></div>
            <div>
              <h1 className="text-2xl font-bold text-white">Daily Attendance</h1>
              <p className="text-sm text-slate-400">
                {rosterQuery.data
                  ? `${rosterQuery.data.branch.name} · ${rosterQuery.data.branch.timezone}`
                  : 'Selected branch roster'}
              </p>
            </div>
          </div>
          <label className="text-sm text-slate-300">
            Business date
            <input
              type="date"
              value={selectedDate || rosterQuery.data?.attendanceDate || ''}
              onChange={(event) => { setSelectedDate(event.target.value); setPending(null); }}
              className="mt-1 block rounded-xl border border-slate-700 bg-slate-950 px-3 py-2 text-white"
            />
          </label>
        </div>
      </header>

      {rosterQuery.data && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {[
            ['Total', rosterQuery.data.summary.total],
            ['Present', rosterQuery.data.summary.present],
            ['Absent', rosterQuery.data.summary.absent],
            ['Half-day', rosterQuery.data.summary.half_day],
            ['Unmarked', rosterQuery.data.summary.unmarked],
          ].map(([label, value]) => (
            <div key={String(label)} className="rounded-2xl border border-slate-800 bg-slate-900 p-4">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">{label}</p>
              <p className="mt-1 text-2xl font-bold text-white">{value}</p>
            </div>
          ))}
        </section>
      )}

      {rosterQuery.isLoading && (
        <div className="rounded-2xl border border-slate-800 bg-slate-900 p-12 text-center text-slate-400">
          Loading the branch roster…
        </div>
      )}
      {rosterQuery.isError && (
        <div className="rounded-2xl border border-rose-500/20 bg-rose-500/10 p-6 text-rose-200">
          <div className="flex items-center gap-2 font-semibold"><ShieldAlert className="h-5 w-5" /> Attendance could not be loaded</div>
          <p className="mt-2 text-sm">{errorMessage(rosterQuery.error)}</p>
          <Button className="mt-4" size="sm" variant="secondary" onClick={() => void rosterQuery.refetch()}>
            <RefreshCw className="h-4 w-4" /> Retry
          </Button>
        </div>
      )}
      {!rosterQuery.isLoading && !rosterQuery.isError && filteredRoster.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-900/50 p-12 text-center">
          <Users className="mx-auto h-8 w-8 text-slate-600" />
          <p className="mt-3 font-semibold text-white">No staff are assigned to this branch</p>
          <p className="mt-1 text-sm text-slate-500">Assign an active membership before marking Attendance.</p>
        </div>
      )}

      <section className="grid gap-4 lg:grid-cols-2">
        {filteredRoster.map((entry) => {
          const status = entry.attendance?.status ?? 'unmarked';
          return (
            <article key={entry.membershipId} className="rounded-2xl border border-slate-800 bg-slate-900 p-5 shadow-lg">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <h2 className="font-bold text-white">{entry.displayName}</h2>
                  <p className="mt-1 text-xs capitalize text-slate-500">{entry.role} · {entry.membershipStatus}</p>
                </div>
                <span className={`rounded-full border px-2.5 py-1 text-xs font-semibold ${statusClasses(status)}`}>
                  {statusLabel(status)}
                </span>
              </div>
              {entry.attendance && (
                <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-400">
                  <span>Version {entry.attendance.version}</span>
                  <span>{entry.attendance.checkInLocal ? `In ${entry.attendance.checkInLocal.slice(11, 16)}` : 'No check-in time'}</span>
                  <span>{entry.attendance.checkOutLocal ? `Out ${entry.attendance.checkOutLocal.slice(11, 16)}` : 'No check-out time'}</span>
                  {entry.correctionCount > 0 && <span>{entry.correctionCount} correction{entry.correctionCount === 1 ? '' : 's'}</span>}
                </div>
              )}
              {canManage ? (
                <div className="mt-4 grid grid-cols-3 gap-2">
                  <Button size="sm" variant="secondary" className={status === 'present' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-200' : ''} onClick={() => beginMark(entry, 'present')}><CheckCircle2 className="h-4 w-4" /> Present</Button>
                  <Button size="sm" variant="secondary" className={status === 'absent' ? 'border-rose-500/40 bg-rose-500/15 text-rose-200' : ''} onClick={() => beginMark(entry, 'absent')}><XCircle className="h-4 w-4" /> Absent</Button>
                  <Button size="sm" variant="secondary" className={status === 'half_day' ? 'border-amber-500/40 bg-amber-500/15 text-amber-100' : ''} onClick={() => beginMark(entry, 'half_day')}><Clock3 className="h-4 w-4" /> Half-day</Button>
                </div>
              ) : (
                <p className="mt-4 text-xs text-slate-500">Read-only Attendance access</p>
              )}
            </article>
          );
        })}
      </section>

      {pending && rosterQuery.data && (
        <section className="sticky bottom-4 z-20 rounded-2xl border border-indigo-500/30 bg-slate-900 p-5 shadow-2xl shadow-slate-950/70">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="font-bold text-white">{pendingIsCorrection ? 'Correct Attendance' : 'Confirm Attendance'}</h2>
              <p className="mt-1 text-sm text-slate-400">{pending.entry.displayName} · {statusLabel(pending.status)} · {rosterQuery.data.attendanceDate}</p>
            </div>
            <button type="button" onClick={() => setPending(null)} className="rounded-lg p-2 text-slate-400 hover:bg-slate-800 hover:text-white" aria-label="Close Attendance action"><XCircle className="h-5 w-5" /></button>
          </div>
          {pendingIsCorrection && (
            <p className="mt-3 rounded-xl border border-amber-500/20 bg-amber-500/10 p-3 text-xs text-amber-100">
              This changes a recorded fact. A reason and the current version are required; stale changes are rejected and reloaded.
            </p>
          )}
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            {pending.status !== 'absent' && (
              <>
                <Input label={`Check-in (${rosterQuery.data.branch.timezone})`} type="datetime-local" value={pending.checkInAt} onChange={(event) => setPending({ ...pending, checkInAt: event.target.value })} />
                <Input label={`Check-out (${rosterQuery.data.branch.timezone})`} type="datetime-local" value={pending.checkOutAt} onChange={(event) => setPending({ ...pending, checkOutAt: event.target.value })} />
              </>
            )}
            {pendingIsCorrection && (
              <Input label="Correction reason" maxLength={500} value={pending.correctionReason} onChange={(event) => setPending({ ...pending, correctionReason: event.target.value })} />
            )}
          </div>
          <div className="mt-4 flex flex-wrap gap-3">
            <Button disabled={pendingInvalid} isLoading={markMutation.isPending} onClick={() => markMutation.mutate(pending)}>
              <CalendarDays className="h-4 w-4" /> {pendingIsCorrection ? 'Save correction' : 'Mark Attendance'}
            </Button>
            <Button variant="secondary" onClick={() => setPending(null)}>Cancel</Button>
          </div>
        </section>
      )}
    </div>
  );
};

export default AttendancePage;
