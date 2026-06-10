import { create } from 'zustand';
import type { User } from 'firebase/auth';
import type { AdminProfile } from '../lib/types';

export type AuthStatus = 'loading' | 'signed_out' | 'no_access' | 'ready';

interface AuthState {
  fbUser: User | null;
  admin: AdminProfile | null;
  status: AuthStatus;
  setFbUser: (u: User | null) => void;
  setAdmin: (a: AdminProfile | null) => void;
  setStatus: (s: AuthStatus) => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  fbUser: null,
  admin: null,
  status: 'loading',
  setFbUser: (fbUser) => set({ fbUser }),
  setAdmin: (admin) => set({ admin }),
  setStatus: (status) => set({ status }),
}));
