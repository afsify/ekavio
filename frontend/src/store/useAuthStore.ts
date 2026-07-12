/**
 * Backward compatibility re-export for useAppStore
 */
import { useAppStore, type UserProfile, type AppState } from './useAppStore';

export type AuthUser = UserProfile;
export type AuthState = AppState;
export const useAuthStore = useAppStore;
export default useAppStore;
