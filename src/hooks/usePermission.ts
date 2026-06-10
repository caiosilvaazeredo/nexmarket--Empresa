import { useAuthStore } from '../store/useAuthStore';
import { can, type Permission } from '../lib/rbac';

export function usePermission() {
  const role = useAuthStore((s) => s.admin?.role);
  return {
    role,
    can: (perm: Permission) => can(role, perm),
  };
}
