import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';
import { db } from './firebase';
import { logAudit } from './audit';
import { useAuthStore } from '../store/useAuthStore';
import type { PlatformConfig } from './types';

const CONFIG_REF = () => doc(db, 'platformConfig', 'main');

export function subscribePlatformConfig(cb: (c: PlatformConfig | null) => void) {
  return onSnapshot(
    CONFIG_REF(),
    (snap) => cb(snap.exists() ? (snap.data() as PlatformConfig) : null),
    () => cb(null),
  );
}

export async function savePlatformConfig(patch: Partial<PlatformConfig>) {
  await setDoc(
    CONFIG_REF(),
    { ...patch, updatedBy: useAuthStore.getState().admin?.uid ?? null, updatedAt: serverTimestamp() },
    { merge: true },
  );
  // Espelha no doc PÚBLICO apenas o que os apps clientes precisam ler.
  // O calendário de repasse vai junto: os apps da loja e do entregador
  // mostram ao parceiro quando ele recebe.
  const publicPatch: Record<string, unknown> = {};
  if (patch.cashbackPct !== undefined) publicPatch.cashbackPct = Number(patch.cashbackPct) || 0;
  if (patch.storePayout !== undefined) publicPatch.storePayout = patch.storePayout;
  if (patch.driverPayout !== undefined) publicPatch.driverPayout = patch.driverPayout;
  if (Object.keys(publicPatch).length > 0) {
    await setDoc(
      doc(db, 'platformConfig', 'public'),
      { ...publicPatch, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  await logAudit({ action: 'config.update', target: 'Configurações da plataforma', targetType: 'config', after: patch });
}
