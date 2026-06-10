import * as React from 'react';
import { Lock } from 'lucide-react';
import { usePermission } from '../../hooks/usePermission';
import type { Permission } from '../../lib/rbac';
import { EmptyState } from '../ui/Feedback';

/** Route-level guard (RNF01). Renders children only if the role has `perm`. */
export function RoleGate({ perm, children }: { perm: Permission; children: React.ReactNode }) {
  const { can } = usePermission();
  if (!can(perm)) {
    return (
      <div className="p-8">
        <EmptyState
          icon={<Lock className="w-7 h-7" />}
          title="Acesso restrito"
          description="Seu perfil de acesso não inclui esta área. Fale com um administrador master se precisar de permissão."
        />
      </div>
    );
  }
  return <>{children}</>;
}
