import { deflate, inflate } from 'pako';
import type { WorldData, Location, Tunnel, Obstacle, PortalPair } from '../types';
import { LOCATION_COLORS, PORTAL_COLORS } from '../types';

// Compact encoding to minimise URL length.
// We strip UUIDs (regenerate on import), default colors, and empty strings.
// Keys are shortened to single chars. The result is deflated and base64url-encoded.

interface CompactLocation {
  n: string;          // name
  x: number;
  y: number;
  z: number;
  t: string;          // type
  d?: string;         // dimension (omit if overworld)
  c?: string;         // color (omit if default for type)
  o?: string;         // notes (omit if empty)
}

interface CompactObstacle {
  x: number;
  y: number;
  z: number;
  t: string;          // type
  d?: string;         // description
}

interface CompactTunnel {
  f: number;          // fromId index into locations array
  t: number;          // toId index
  d?: string;         // dimension
  s: string;          // status
  o?: CompactObstacle[];
}

interface CompactPortal {
  n: string;          // name
  ox: number; oy: number; oz: number;
  nx?: number | null; ny?: number | null; nz?: number | null;
  c?: string;         // color
  o?: string;         // notes
  l?: boolean;        // linked
}

interface CompactData {
  w: { n: string; s: string }; // world
  l: CompactLocation[];
  t?: CompactTunnel[];
  p?: CompactPortal[];
}

function compactLocation(loc: Location): CompactLocation {
  const cl: CompactLocation = { n: loc.name, x: loc.x, y: loc.y, z: loc.z, t: loc.type };
  if (loc.dimension !== 'overworld') cl.d = loc.dimension;
  if (loc.color !== LOCATION_COLORS[loc.type]) cl.c = loc.color;
  if (loc.notes) cl.o = loc.notes;
  return cl;
}

function compactTunnel(tun: Tunnel, locIdToIndex: Map<string, number>): CompactTunnel | null {
  const f = locIdToIndex.get(tun.fromId);
  const t = locIdToIndex.get(tun.toId);
  if (f === undefined || t === undefined) return null;
  const ct: CompactTunnel = { f, t, s: tun.status };
  if (tun.dimension !== 'overworld') ct.d = tun.dimension;
  if (tun.obstacles.length > 0) {
    ct.o = tun.obstacles.map((o) => {
      const co: CompactObstacle = { x: o.x, y: o.y, z: o.z, t: o.type };
      if (o.description) co.d = o.description;
      return co;
    });
  }
  return ct;
}

function compactPortal(p: PortalPair, idx: number): CompactPortal {
  const cp: CompactPortal = { n: p.name, ox: p.overworldX, oy: p.overworldY, oz: p.overworldZ };
  if (p.netherX != null) cp.nx = p.netherX;
  if (p.netherY != null) cp.ny = p.netherY;
  if (p.netherZ != null) cp.nz = p.netherZ;
  const defaultColor = PORTAL_COLORS[idx % PORTAL_COLORS.length];
  if (p.color !== defaultColor) cp.c = p.color;
  if (p.notes) cp.o = p.notes;
  if (p.linked) cp.l = true;
  return cp;
}

export function encodePermalink(data: WorldData): string {
  const locIdToIndex = new Map<string, number>();
  data.locations.forEach((loc, i) => locIdToIndex.set(loc.id, i));

  const compact: CompactData = {
    w: { n: data.world.name, s: data.world.seed },
    l: data.locations.map(compactLocation),
  };
  if (data.tunnels.length > 0) {
    compact.t = data.tunnels.map((t) => compactTunnel(t, locIdToIndex)).filter(Boolean) as CompactTunnel[];
  }
  if (data.portals.length > 0) {
    compact.p = data.portals.map(compactPortal);
  }

  const json = JSON.stringify(compact);
  const compressed = deflate(new TextEncoder().encode(json), { level: 9 });
  return base64UrlEncode(compressed);
}

export function decodePermalink(encoded: string): WorldData | null {
  try {
    const compressed = base64UrlDecode(encoded);
    const json = new TextDecoder().decode(inflate(compressed));
    const compact = JSON.parse(json) as CompactData;
    return expandData(compact);
  } catch {
    return null;
  }
}

function expandData(compact: CompactData): WorldData {
  const locationIds: string[] = [];

  const locations: Location[] = compact.l.map((cl) => {
    const id = crypto.randomUUID();
    locationIds.push(id);
    return {
      id,
      name: cl.n,
      x: cl.x,
      y: cl.y,
      z: cl.z,
      type: cl.t as Location['type'],
      dimension: (cl.d || 'overworld') as Location['dimension'],
      color: cl.c || LOCATION_COLORS[cl.t as Location['type']] || '#1abc9c',
      notes: cl.o || '',
    };
  });

  const tunnels: Tunnel[] = (compact.t || []).map((ct) => ({
    id: crypto.randomUUID(),
    fromId: locationIds[ct.f] || '',
    toId: locationIds[ct.t] || '',
    dimension: (ct.d || 'overworld') as Tunnel['dimension'],
    status: ct.s as Tunnel['status'],
    obstacles: (ct.o || []).map((co): Obstacle => ({
      id: crypto.randomUUID(),
      x: co.x,
      y: co.y,
      z: co.z,
      type: co.t as Obstacle['type'],
      description: co.d || '',
    })),
  }));

  const portals: PortalPair[] = (compact.p || []).map((cp, i) => ({
    id: crypto.randomUUID(),
    name: cp.n,
    overworldX: cp.ox,
    overworldY: cp.oy,
    overworldZ: cp.oz,
    netherX: cp.nx ?? null,
    netherY: cp.ny ?? null,
    netherZ: cp.nz ?? null,
    color: cp.c || PORTAL_COLORS[i % PORTAL_COLORS.length],
    notes: cp.o || '',
    linked: cp.l || false,
  }));

  return {
    world: { name: compact.w.n, seed: compact.w.s },
    locations,
    tunnels,
    portals,
  };
}

function base64UrlEncode(bytes: Uint8Array): string {
  let binary = '';
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64UrlDecode(str: string): Uint8Array {
  let base64 = str.replace(/-/g, '+').replace(/_/g, '/');
  while (base64.length % 4) base64 += '=';
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

export function generateShareUrl(data: WorldData): string {
  const encoded = encodePermalink(data);
  const base = window.location.href.split('#')[0];
  return `${base}#data=${encoded}`;
}

export function getHashData(): string | null {
  const hash = window.location.hash;
  if (!hash.startsWith('#data=')) return null;
  return hash.slice(6);
}

export function clearHash(): void {
  history.replaceState(null, '', window.location.pathname + window.location.search);
}
