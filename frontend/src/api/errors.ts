import axios, { type AxiosError } from 'axios';

interface ApiErrorBody {
  message?: unknown;
  error?: {message?:unknown};
}

export interface MutationRecoveryError extends AxiosError {
  recovery: { kind: 'explicit-action-required'; outcome: 'unknown'; automaticReplay: false };
}

export function isMutationRecoveryError(error: unknown): error is MutationRecoveryError {
  if (!axios.isAxiosError(error) || !('recovery' in error)) return false;
  const recovery = error.recovery;
  return typeof recovery === 'object' && recovery !== null &&
    'kind' in recovery && recovery.kind === 'explicit-action-required' &&
    'outcome' in recovery && recovery.outcome === 'unknown' &&
    'automaticReplay' in recovery && recovery.automaticReplay === false;
}

export const getErrorMessage = (error: unknown, fallback: string): string => {
  if (isMutationRecoveryError(error)) {
    return 'We couldn’t confirm whether this change was saved. If prompted, sign in again, then check the record before trying again.';
  }
  if (axios.isAxiosError<ApiErrorBody>(error)) {
    const message = error.response?.data?.message ?? error.response?.data?.error?.message;
    if (typeof message === 'string' && message.length > 0) {
      return message;
    }
  }

  if (error instanceof Error && error.message.length > 0) {
    return error.message;
  }

  return fallback;
};
