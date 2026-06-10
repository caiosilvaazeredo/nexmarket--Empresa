import { useEffect, useRef } from 'react';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import { cn } from '../../lib/utils';
import type { DriverProfile, Order } from '../../lib/types';
import type { DemandZone } from '../../lib/geo';

const TILES =
  import.meta.env.VITE_MAP_TILES_URL || 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';

const driverColor = (s?: string) =>
  s === 'online' ? '#58CC02' : s === 'on_delivery' ? '#3B82F6' : '#94A3B8';

function driverIcon(d: DriverProfile) {
  const color = driverColor(d.status);
  return L.divIcon({
    className: '',
    html: `<div style="width:20px;height:20px;border-radius:999px;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(15,23,42,.35)"></div>`,
    iconSize: [20, 20],
    iconAnchor: [10, 10],
  });
}

/**
 * "God Mode" live map (RF11). Pure Leaflet via refs (no React-version peer-dep
 * coupling), OpenStreetMap tiles by default — no API key required. Drivers are
 * colored by status; demand "heat" zones (orders > online drivers) glow red.
 */
export function LiveMap({
  drivers = [],
  orders = [],
  zones = [],
  onSelectDriver,
  height = 460,
  className,
  autoFit = true,
}: {
  drivers?: DriverProfile[];
  orders?: Order[];
  zones?: DemandZone[];
  onSelectDriver?: (d: DriverProfile) => void;
  height?: number | string;
  className?: string;
  autoFit?: boolean;
}) {
  const elRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<L.Map | null>(null);
  const layerRef = useRef<L.LayerGroup | null>(null);
  const fittedRef = useRef(false);

  useEffect(() => {
    if (!elRef.current || mapRef.current) return;
    const map = L.map(elRef.current, {
      center: [-23.5505, -46.6333],
      zoom: 12,
      zoomControl: true,
      attributionControl: false,
    });
    L.tileLayer(TILES, { maxZoom: 19 }).addTo(map);
    layerRef.current = L.layerGroup().addTo(map);
    mapRef.current = map;
    setTimeout(() => map.invalidateSize(), 60);
    return () => {
      map.remove();
      mapRef.current = null;
      layerRef.current = null;
      fittedRef.current = false;
    };
  }, []);

  useEffect(() => {
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!map || !layer) return;
    layer.clearLayers();
    const pts: L.LatLngExpression[] = [];

    for (const z of zones) {
      if (z.pressure <= 0) continue;
      L.circle([z.lat, z.lng], {
        radius: 280 + z.pressure * 140,
        weight: 0,
        fillColor: '#FF4B4B',
        fillOpacity: Math.min(0.4, 0.1 + z.pressure * 0.06),
      }).addTo(layer);
    }

    for (const o of orders) {
      const p = o.deliveryAddress;
      if (!p?.lat || !p?.lng) continue;
      L.circleMarker([p.lat, p.lng], {
        radius: 5,
        color: '#fff',
        weight: 2,
        fillColor: '#6366F1',
        fillOpacity: 0.9,
      })
        .bindTooltip(`Pedido · ${o.storeName || o.supermarketId}`, { direction: 'top' })
        .addTo(layer);
      pts.push([p.lat, p.lng]);
    }

    for (const d of drivers) {
      const loc = d.location;
      if (!loc?.lat || !loc?.lng) continue;
      const m = L.marker([loc.lat, loc.lng], { icon: driverIcon(d) })
        .bindTooltip(`${d.name} · ${d.status || 'offline'}`, { direction: 'top' })
        .addTo(layer);
      if (onSelectDriver) m.on('click', () => onSelectDriver(d));
      pts.push([loc.lat, loc.lng]);
    }

    if (autoFit && !fittedRef.current && pts.length > 0) {
      try {
        map.fitBounds(L.latLngBounds(pts).pad(0.25), { maxZoom: 14 });
        fittedRef.current = true;
      } catch {
        /* ignore */
      }
    }
  }, [drivers, orders, zones, onSelectDriver, autoFit]);

  return (
    <div
      ref={elRef}
      style={{ height }}
      className={cn('rounded-2xl overflow-hidden border-2 border-slate-100 dark:border-slate-800 z-0', className)}
    />
  );
}
