import type { Order, DriverProfile, GeoPoint } from './types';

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const R = 6371;
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const la1 = (a.lat * Math.PI) / 180;
  const la2 = (b.lat * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 + Math.sin(dLng / 2) ** 2 * Math.cos(la1) * Math.cos(la2);
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export interface DemandZone {
  lat: number;
  lng: number;
  orders: number;
  drivers: number;
  /** Heat: positive = under-served (demand > supply). */
  pressure: number;
}

/**
 * Bucket live orders and online drivers into a coarse grid and flag zones where
 * demand outstrips supply ("Zonas de Calor" — RF11).
 */
export function computeDemandZones(
  orders: Order[],
  drivers: DriverProfile[],
  cell = 0.02, // ~2km
): DemandZone[] {
  const map = new Map<string, DemandZone>();
  const keyOf = (lat: number, lng: number) =>
    `${Math.round(lat / cell)}:${Math.round(lng / cell)}`;

  for (const o of orders) {
    const p = o.deliveryAddress;
    if (!p?.lat || !p?.lng) continue;
    const k = keyOf(p.lat, p.lng);
    const z = map.get(k) || {
      lat: Math.round(p.lat / cell) * cell,
      lng: Math.round(p.lng / cell) * cell,
      orders: 0,
      drivers: 0,
      pressure: 0,
    };
    z.orders += 1;
    map.set(k, z);
  }
  for (const d of drivers) {
    if (d.status !== 'online' || !d.location?.lat || !d.location?.lng) continue;
    const k = keyOf(d.location.lat, d.location.lng);
    const z = map.get(k) || {
      lat: Math.round(d.location.lat / cell) * cell,
      lng: Math.round(d.location.lng / cell) * cell,
      orders: 0,
      drivers: 0,
      pressure: 0,
    };
    z.drivers += 1;
    map.set(k, z);
  }
  const zones = Array.from(map.values());
  zones.forEach((z) => (z.pressure = z.orders - z.drivers));
  return zones;
}

/** Center of mass for a set of points (fallback to São Paulo). */
export function centroid(points: { lat?: number; lng?: number }[]): GeoPoint {
  const valid = points.filter((p) => typeof p.lat === 'number' && typeof p.lng === 'number');
  if (valid.length === 0) return { lat: -23.5505, lng: -46.6333 };
  const lat = valid.reduce((s, p) => s + (p.lat as number), 0) / valid.length;
  const lng = valid.reduce((s, p) => s + (p.lng as number), 0) / valid.length;
  return { lat, lng };
}
