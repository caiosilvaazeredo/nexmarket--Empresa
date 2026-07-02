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
  if (patch.cashbackPct !== undefined) {
    await setDoc(
      doc(db, 'platformConfig', 'public'),
      { cashbackPct: Number(patch.cashbackPct) || 0, updatedAt: serverTimestamp() },
      { merge: true },
    );
  }
  await logAudit({ action: 'config.update', target: 'Configurações da plataforma', targetType: 'config', after: patch });
}
