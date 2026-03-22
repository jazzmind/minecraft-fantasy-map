// Minecraft biome generation using a port of cubiomes for the Overworld,
// and approximate noise for Nether/End (which use different algorithms).

import { BiomeGenerator, biomeToCategory } from './cubiomes/biome';
import { intToUint64 } from './cubiomes/math';

export type TerrainType =
  | 'deep_ocean'
  | 'ocean'
  | 'river'
  | 'beach'
  | 'plains'
  | 'forest'
  | 'dark_forest'
  | 'swamp'
  | 'desert'
  | 'savanna'
  | 'mountains'
  | 'snowy'
  | 'jungle'
  // Underground / above-ground Y-layer types
  | 'stone'
  | 'deepslate'
  | 'cavern'
  | 'aquifer'
  | 'lava_underground'
  | 'air'
  // Nether
  | 'lava_sea'
  | 'nether_wastes'
  | 'soul_sand'
  | 'crimson_forest'
  | 'warped_forest'
  | 'basalt_delta'
  // End
  | 'end_void'
  | 'end_stone'
  | 'chorus';

export interface TerrainCell {
  type: TerrainType;
  surfaceBiome: TerrainType;
  surfaceY: number;
  elevation: number;
  moisture: number;
  temperature: number;
}

export const TERRAIN_STYLES: Record<TerrainType, { color: string; label: string }> = {
  deep_ocean:       { color: '#2c5f8a', label: 'Deep Ocean' },
  ocean:            { color: '#4a90b8', label: 'Ocean' },
  river:            { color: '#5da0c5', label: 'River' },
  beach:            { color: '#d4c088', label: 'Beach' },
  plains:           { color: '#8cb860', label: 'Plains' },
  forest:           { color: '#5a8a3c', label: 'Forest' },
  dark_forest:      { color: '#3d6b2e', label: 'Dark Forest' },
  swamp:            { color: '#6b7a4a', label: 'Swamp' },
  desert:           { color: '#d4b86a', label: 'Desert' },
  savanna:          { color: '#b8a850', label: 'Savanna' },
  mountains:        { color: '#8a8a7a', label: 'Mountains' },
  snowy:            { color: '#d8dce8', label: 'Snowy' },
  jungle:           { color: '#3d8840', label: 'Jungle' },
  stone:            { color: '#7a7a7a', label: 'Stone' },
  deepslate:        { color: '#4a4a50', label: 'Deepslate' },
  cavern:           { color: '#3a3530', label: 'Cavern' },
  aquifer:          { color: '#3a6a8a', label: 'Aquifer' },
  lava_underground: { color: '#c44a00', label: 'Lava' },
  air:              { color: '#e8e8f0', label: 'Air' },
  lava_sea:         { color: '#c44a00', label: 'Lava Sea' },
  nether_wastes:    { color: '#6b2020', label: 'Nether Wastes' },
  soul_sand:        { color: '#4a3a28', label: 'Soul Sand' },
  crimson_forest:   { color: '#8b1a1a', label: 'Crimson Forest' },
  warped_forest:    { color: '#1a6b5a', label: 'Warped Forest' },
  basalt_delta:     { color: '#3a3a3a', label: 'Basalt Delta' },
  end_void:         { color: '#0a0a18', label: 'Void' },
  end_stone:        { color: '#d4d098', label: 'End Stone' },
  chorus:           { color: '#8a508a', label: 'Chorus' },
};

// --- Cubiomes generator cache ---
// Creating a BiomeGenerator is expensive (~200ms) because it initializes all
// the Perlin octaves. We cache per seed string.
let cachedSeed: string | null = null;
let cachedGen: BiomeGenerator | null = null;

function getGenerator(seed: string): BiomeGenerator {
  if (cachedSeed === seed && cachedGen) return cachedGen;
  const seedBigInt = parseSeedToBigInt(seed);
  cachedGen = new BiomeGenerator(seedBigInt);
  cachedSeed = seed;
  return cachedGen;
}

function parseSeedToBigInt(seed: string): bigint {
  const trimmed = seed.trim();
  try {
    return intToUint64(BigInt(trimmed));
  } catch {
    // Non-numeric seed: hash it like Minecraft's String.hashCode()
    let h = 0;
    for (let i = 0; i < trimmed.length; i++) {
      h = ((h << 5) - h + trimmed.charCodeAt(i)) | 0;
    }
    return intToUint64(h);
  }
}

// --- Approximate noise for Nether/End (cubiomes Nether uses a separate system) ---

function hashSeed(seed: string): number {
  let h = 0;
  for (let i = 0; i < seed.length; i++) {
    h = ((h << 5) - h + seed.charCodeAt(i)) | 0;
  }
  return h;
}

function prng(x: number, z: number, offset: number): number {
  let n = x | 0;
  n = Math.imul(n ^ 0x85ebca6b, 0xcc9e2d51);
  n = n ^ (z * 668265263) | 0;
  n = Math.imul(n ^ (n >>> 16), 0x85ebca6b);
  n = n ^ (offset * 1013904223) | 0;
  n = Math.imul(n ^ (n >>> 13), 0xc2b2ae35);
  n = n ^ (n >>> 16);
  return (n >>> 0) / 0xffffffff;
}

function valueNoise2D(x: number, z: number, offset: number): number {
  const ix = Math.floor(x);
  const iz = Math.floor(z);
  const fx = x - ix;
  const fz = z - iz;
  const sx = fx * fx * (3 - 2 * fx);
  const sz = fz * fz * (3 - 2 * fz);
  const v00 = prng(ix, iz, offset);
  const v10 = prng(ix + 1, iz, offset);
  const v01 = prng(ix, iz + 1, offset);
  const v11 = prng(ix + 1, iz + 1, offset);
  const top = v00 + sx * (v10 - v00);
  const bot = v01 + sx * (v11 - v01);
  return top + sz * (bot - top);
}

function fbm(x: number, z: number, offset: number, octaves: number, lacunarity: number, gain: number): number {
  let value = 0, amplitude = 1, frequency = 1, maxAmp = 0;
  for (let i = 0; i < octaves; i++) {
    value += amplitude * valueNoise2D(x * frequency, z * frequency, offset + i * 1000);
    maxAmp += amplitude;
    amplitude *= gain;
    frequency *= lacunarity;
  }
  return value / maxAmp;
}

function getNetherTerrainAt(worldX: number, worldZ: number, seedHash: number): TerrainCell {
  const NETHER_OFFSET = 100000;
  const base = fbm(worldX * 0.005, worldZ * 0.005, seedHash + NETHER_OFFSET, 4, 2.0, 0.5);
  const biome = fbm(worldX * 0.003, worldZ * 0.003, seedHash + NETHER_OFFSET + 5555, 3, 2.0, 0.5);
  const lava = fbm(worldX * 0.008, worldZ * 0.008, seedHash + NETHER_OFFSET + 9999, 3, 2.0, 0.5);
  let type: TerrainType;
  if (lava < 0.28) type = 'lava_sea';
  else if (base > 0.65) type = 'basalt_delta';
  else if (biome > 0.65) type = 'crimson_forest';
  else if (biome < 0.3) type = 'warped_forest';
  else if (base < 0.35) type = 'soul_sand';
  else type = 'nether_wastes';
  return { type, surfaceBiome: type, surfaceY: 64, elevation: base, moisture: biome, temperature: 1 };
}

function getEndTerrainAt(worldX: number, worldZ: number, seedHash: number): TerrainCell {
  const END_OFFSET = 200000;
  const dist = Math.sqrt(worldX * worldX + worldZ * worldZ);
  const island = fbm(worldX * 0.004, worldZ * 0.004, seedHash + END_OFFSET, 4, 2.0, 0.5);
  const chorus = fbm(worldX * 0.01, worldZ * 0.01, seedHash + END_OFFSET + 3333, 2, 2.0, 0.5);
  const centralRadius = 200;
  if (dist < centralRadius)
    return { type: 'end_stone', surfaceBiome: 'end_stone', surfaceY: 64, elevation: 0.7, moisture: 0, temperature: 0 };
  const islandThreshold = 0.55 + Math.min(dist * 0.00005, 0.15);
  if (island > islandThreshold) {
    const t: TerrainType = chorus > 0.65 ? 'chorus' : 'end_stone';
    return { type: t, surfaceBiome: t, surfaceY: 64, elevation: island, moisture: chorus, temperature: 0 };
  }
  return { type: 'end_void', surfaceBiome: 'end_void', surfaceY: 0, elevation: 0, moisture: 0, temperature: 0 };
}

// --- Underground feature generation ---
// Uses 3D noise (x, z, y-influenced) to approximate caves, aquifers, lava lakes.
// Not block-accurate, but gives a useful planning view of underground hazards.

function getUndergroundType(wx: number, wz: number, y: number, seedHash: number): TerrainType {
  const CAVE_OFFSET = 300000;
  const AQUIFER_OFFSET = 400000;
  const LAVA_OFFSET = 500000;

  // Cave noise: cheese-cave style (large blobs of open space)
  // Use y-dependent frequency so caves vary by level
  const caveScale = 0.008;
  const cave1 = fbm(wx * caveScale, wz * caveScale, seedHash + CAVE_OFFSET + y * 7, 3, 2.0, 0.5);
  const cave2 = fbm(wx * caveScale * 1.5, wz * caveScale * 1.5, seedHash + CAVE_OFFSET + 7777 + y * 13, 2, 2.0, 0.5);

  // Spaghetti cave factor (thinner tunnels)
  const spaghetti = fbm(wx * 0.02, wz * 0.02, seedHash + CAVE_OFFSET + 33333 + y * 3, 2, 2.0, 0.5);

  const isCavern = (cave1 > 0.62 && cave2 > 0.55) || (spaghetti > 0.72 && spaghetti < 0.78);

  if (isCavern) {
    // Aquifer check: underground water pools in caverns (Y 0-50 roughly)
    if (y > -10 && y < 50) {
      const aquifer = fbm(wx * 0.006, wz * 0.006, seedHash + AQUIFER_OFFSET + y * 5, 3, 2.0, 0.5);
      if (aquifer > 0.58) return 'aquifer';
    }
    return 'cavern';
  }

  // Lava lakes below Y=0 (even outside caverns)
  if (y < 0) {
    const lava = fbm(wx * 0.01, wz * 0.01, seedHash + LAVA_OFFSET + y * 11, 2, 2.0, 0.5);
    if (y < -48) return lava > 0.45 ? 'lava_underground' : 'deepslate';
    if (lava > 0.65) return 'lava_underground';
    return 'deepslate';
  }

  // Scattered lava pockets in deep stone (Y 0-10)
  if (y < 10) {
    const lava = fbm(wx * 0.012, wz * 0.012, seedHash + LAVA_OFFSET + 2222, 2, 2.0, 0.5);
    if (lava > 0.72) return 'lava_underground';
  }

  return y < 0 ? 'deepslate' : 'stone';
}

// --- Grid generation ---

export function generateTerrainGrid(
  worldMinX: number,
  worldMinZ: number,
  worldMaxX: number,
  worldMaxZ: number,
  resolution: number,
  seed: string,
  dimension: 'overworld' | 'nether' | 'end' = 'overworld',
  yLevel = 63,
): { cells: TerrainCell[][]; startX: number; startZ: number; step: number } {
  const step = resolution;
  const sX = Math.floor(worldMinX / step) * step;
  const sZ = Math.floor(worldMinZ / step) * step;
  const cols = Math.ceil((worldMaxX - sX) / step) + 1;
  const rows = Math.ceil((worldMaxZ - sZ) / step) + 1;

  const cells: TerrainCell[][] = [];

  const SEA_LEVEL = 63;

  if (dimension === 'overworld') {
    const gen = getGenerator(seed);
    const seedHash = hashSeed(seed);

    for (let r = 0; r < rows; r++) {
      const row: TerrainCell[] = [];
      for (let c = 0; c < cols; c++) {
        const wx = sX + c * step;
        const wz = sZ + r * step;
        const rawSurfaceY = gen.getSurfaceHeight(wx, wz);
        const biomeId = gen.getBiomeAt(wx, wz, Math.max(rawSurfaceY, SEA_LEVEL));
        const surfaceBiome = biomeToCategory(biomeId) as TerrainType;

        let type: TerrainType;

        if (yLevel >= SEA_LEVEL) {
          // At or above sea level: always show surface biome.
          // The getSurfaceHeight estimate is unreliable, and underground
          // features are approximations — don't let them bleed through.
          type = surfaceBiome;
        } else {
          // Below sea level: underground view
          type = getUndergroundType(wx, wz, yLevel, seedHash);
        }

        row.push({
          type,
          surfaceBiome,
          surfaceY: SEA_LEVEL,
          elevation: rawSurfaceY / 320,
          moisture: 0.5,
          temperature: 0.5,
        });
      }
      cells.push(row);
    }
  } else {
    const seedHash = hashSeed(seed);
    const genFn = dimension === 'nether' ? getNetherTerrainAt : getEndTerrainAt;
    for (let r = 0; r < rows; r++) {
      const row: TerrainCell[] = [];
      for (let c = 0; c < cols; c++) {
        row.push(genFn(sX + c * step, sZ + r * step, seedHash));
      }
      cells.push(row);
    }
  }

  return { cells, startX: sX, startZ: sZ, step };
}
