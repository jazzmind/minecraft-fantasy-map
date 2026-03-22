import type { Dimension, Location, PortalPair } from '../types';

export function overworldToNether(x: number, z: number): { x: number; z: number } {
  return { x: Math.floor(x / 8), z: Math.floor(z / 8) };
}

export function netherToOverworld(x: number, z: number): { x: number; z: number } {
  return { x: x * 8, z: z * 8 };
}

export function convertCoords(
  x: number,
  z: number,
  from: Dimension,
  to: Dimension
): { x: number; z: number } {
  if (from === to) return { x, z };
  if (from === 'overworld' && to === 'nether') return overworldToNether(x, z);
  if (from === 'nether' && to === 'overworld') return netherToOverworld(x, z);
  return { x, z };
}

export function getDisplayCoords(
  loc: Location,
  viewDimension: Dimension
): { x: number; z: number } {
  return convertCoords(loc.x, loc.z, loc.dimension, viewDimension);
}

export function distance2D(x1: number, z1: number, x2: number, z2: number): number {
  return Math.sqrt((x2 - x1) ** 2 + (z2 - z1) ** 2);
}

export function distance3D(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number
): number {
  return Math.sqrt((x2 - x1) ** 2 + (y2 - y1) ** 2 + (z2 - z1) ** 2);
}

export function tunnelBlockCount(
  x1: number, y1: number, z1: number,
  x2: number, y2: number, z2: number
): number {
  return Math.ceil(distance3D(x1, y1, z1, x2, y2, z2));
}

export function idealNetherCoords(owX: number, owZ: number): { x: number; z: number } {
  return { x: Math.floor(owX / 8), z: Math.floor(owZ / 8) };
}

export function idealOverworldCoords(nX: number, nZ: number): { x: number; z: number } {
  return { x: nX * 8, z: nZ * 8 };
}

export function portalLinkOffset(portal: PortalPair): number | null {
  if (portal.netherX === null || portal.netherZ === null) return null;
  const ideal = idealNetherCoords(portal.overworldX, portal.overworldZ);
  return distance2D(portal.netherX, portal.netherZ, ideal.x, ideal.z);
}

export function checkPortalConflicts(
  portals: PortalPair[],
  currentId: string,
): { conflictsWith: string; distance: number }[] {
  const current = portals.find((p) => p.id === currentId);
  if (!current) return [];

  const currentNetherX = current.netherX ?? Math.floor(current.overworldX / 8);
  const currentNetherZ = current.netherZ ?? Math.floor(current.overworldZ / 8);

  const conflicts: { conflictsWith: string; distance: number }[] = [];

  for (const other of portals) {
    if (other.id === currentId) continue;
    const otherNetherX = other.netherX ?? Math.floor(other.overworldX / 8);
    const otherNetherZ = other.netherZ ?? Math.floor(other.overworldZ / 8);
    const dist = distance2D(currentNetherX, currentNetherZ, otherNetherX, otherNetherZ);
    if (dist < 128) {
      conflicts.push({ conflictsWith: other.name, distance: Math.round(dist) });
    }
  }

  return conflicts;
}

export function bearing(x1: number, z1: number, x2: number, z2: number): string {
  const dx = x2 - x1;
  const dz = z2 - z1;
  const angle = (Math.atan2(dx, -dz) * 180) / Math.PI;
  const normalized = ((angle % 360) + 360) % 360;

  const directions = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
  const index = Math.round(normalized / 45) % 8;
  return directions[index];
}
