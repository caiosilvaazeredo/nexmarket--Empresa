import { create } from 'zustand';

export interface Toast {
  id: number;
  message: string;
  variant: 'success' | 'error' | 'info';
}

interface UIState {
  sidebarOpen: boolean; // mobile drawer
  dark: boolean;
  toasts: Toast[];
  setSidebarOpen: (v: boolean) => void;
  toggleDark: () => void;
  toast: (message: string, variant?: Toast['variant']) => void;
  dismissToast: (id: number) => void;
}

const initialDark =
  typeof window !== 'undefined' && localStorage.getItem('nex-admin-dark') === '1';

if (initialDark && typeof document !== 'undefined') {
  document.documentElement.classList.add('dark');
}

let toastSeq = 1;

export const useUIStore = create<UIState>((set, get) => ({
  sidebarOpen: false,
  dark: initialDark,
  toasts: [],
  setSidebarOpen: (sidebarOpen) => set({ sidebarOpen }),
  toggleDark: () => {
    const dark = !get().dark;
    if (typeof document !== 'undefined') {
      document.documentElement.classList.toggle('dark', dark);
      localStorage.setItem('nex-admin-dark', dark ? '1' : '0');
    }
    set({ dark });
  },
  toast: (message, variant = 'success') => {
    const id = toastSeq++;
    set({ toasts: [...get().toasts, { id, message, variant }] });
    setTimeout(() => get().dismissToast(id), 4200);
  },
  dismissToast: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));
