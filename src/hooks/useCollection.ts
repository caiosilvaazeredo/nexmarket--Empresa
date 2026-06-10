import { useEffect, useState } from 'react';
import {
  onSnapshot,
  type Query,
  type CollectionReference,
  type DocumentReference,
} from 'firebase/firestore';

/**
 * Generic realtime collection subscription. Pass a factory that builds the
 * query plus a deps array (so we only re-subscribe when inputs change).
 */
export function useCollectionData<T = any>(
  make: () => Query | CollectionReference | null,
  deps: any[],
): { rows: T[]; loading: boolean } {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const q = make();
    if (!q) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      q,
      (snap) => {
        setRows(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) } as T)));
        setLoading(false);
      },
      (err) => {
        console.warn('useCollectionData error', err);
        setRows([]);
        setLoading(false);
      },
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { rows, loading };
}

export function useDocData<T = any>(
  make: () => DocumentReference | null,
  deps: any[],
): { data: T | null; loading: boolean } {
  const [data, setData] = useState<T | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const ref = make();
    if (!ref) {
      setData(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    const unsub = onSnapshot(
      ref,
      (snap) => {
        setData(snap.exists() ? ({ id: snap.id, ...(snap.data() as any) } as T) : null);
        setLoading(false);
      },
      (err) => {
        console.warn('useDocData error', err);
        setData(null);
        setLoading(false);
      },
    );
    return () => unsub();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { data, loading };
}
