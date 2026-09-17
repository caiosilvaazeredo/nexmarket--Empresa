/**
 * Histórico de ruptura de estoque — lido a partir dos registros que a loja
 * grava em `supermarkets/{smId}/stockRuptures` sempre que marca um item como
 * "não tem" no checklist de separação (ver OrderPicker.tsx no repo
 * nexmarket--Loja). Usado para o relatório "produtos que mais faltam" por
 * loja (especificação: Checklist de separação, seção 4).
 */
import { collection, query, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db } from './firebase';

export interface StockRupture {
  id: string;
  supermarketId: string;
  productId: string;
  productName: string;
  orderId: string;
  createdAt?: any;
}

export function subscribeStoreRuptures(supermarketId: string, cb: (r: StockRupture[]) => void) {
  const q = query(
    collection(db, `supermarkets/${supermarketId}/stockRuptures`),
    orderBy('createdAt', 'desc'),
    limit(200),
  );
  return onSnapshot(
    q,
    (snap) => cb(snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) }) as StockRupture)),
    () => cb([]),
  );
}

export interface RuptureRanking {
  productName: string;
  count: number;
}

/** Agrupa por produto e ordena do que mais falta para o que menos falta. */
export function rankRuptures(ruptures: StockRupture[]): RuptureRanking[] {
  const map = new Map<string, number>();
  for (const r of ruptures) {
    const key = r.productName || 'Produto sem nome';
    map.set(key, (map.get(key) || 0) + 1);
  }
  return Array.from(map.entries())
    .map(([productName, count]) => ({ productName, count }))
    .sort((a, b) => b.count - a.count);
}
