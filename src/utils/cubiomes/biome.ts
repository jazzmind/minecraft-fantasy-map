// Minecraft 1.18+ biome noise generator.
// Ported from niduy/minecraft-world-generator (MIT License),
// which is itself a port of Cubitect/cubiomes (MIT License).

import {
  lerp, xor64, add64, multiply64, rotl64,
  leftShift64, rightShift64, intToUint64, uint64ToInt64,
  MAX_UINT64,
} from './math';
import { BIOME, BIOME_VALUES, BIOME_PARAMS, BIOME_TREE } from './const';

// Pre-process biome tree and params from BigInt to Number for fast lookups.
// Each BIOME_TREE node is a 64-bit value encoding:
//   bits 0-47: 6 bytes of biome parameter indices (one per climate)
//   bits 48-55: child pointer (high byte) - if 0xFF, it's a leaf with biome ID in bits 48-55 byte2
//   bits 48-63: child index OR (0xFF## = leaf with biome id)
//
// We extract per-node: paramIndices[6], childPointer (top 16 bits)

interface TreeNode {
  paramIdx: number[]; // 6 param indices (each 0-255)
  child: number;      // top 16 bits as child/leaf indicator
  biomeId: number;    // extracted biome ID (bits 48-55 of original)
}

const TREE_NODES: TreeNode[] = new Array(BIOME_TREE.length);
for (let i = 0; i < BIOME_TREE.length; i++) {
  const n = BIOME_TREE[i];
  const paramIdx = new Array(6);
  for (let j = 0; j < 6; j++) {
    paramIdx[j] = Number((n >> BigInt(8 * j)) & 0xffn);
  }
  const child = Number((n >> 48n) & 0xffffn);
  const biomeId = Number((n >> 48n) & 0xffn);
  TREE_NODES[i] = { paramIdx, child, biomeId };
}

// Pre-process BIOME_PARAMS from bigint[][] to number[][]
const PARAMS_NUM: number[][] = new Array(BIOME_PARAMS.length);
for (let i = 0; i < BIOME_PARAMS.length; i++) {
  PARAMS_NUM[i] = [Number(BIOME_PARAMS[i][0]), Number(BIOME_PARAMS[i][1])];
}

type BiomeValue = (typeof BIOME)[keyof typeof BIOME];

class Xoroshiro {
  constructor(public low: bigint, public high: bigint) {}
}

class PerlinNoise {
  a = 0;
  b = 0;
  c = 0;
  d = new Array<number>(512);
  amplitude = 0;
  lacunarity = 0;
}

class OctaveNoise {
  octaveCount = 0;
  octaves: PerlinNoise[] = [];
}

class DoublePerlinNoise {
  amplitude = 0;
  octA = new OctaveNoise();
  octB = new OctaveNoise();
}

class Spline {
  length = 0;
  type = 0; // 0=Continentalness, 1=Erosion, 2=PeaksAndValleys
  loc = new Float32Array(12);
  der = new Float32Array(12);
  value: FixedSpline[] = new Array(12);
}

class FixedSpline {
  length = 1;
  value = 0;
  constructor(val?: number) { if (val !== undefined) this.value = val; }
}

class SplineStack {
  length = 0;
  stack = new Array(42).fill(null).map(() => new Spline());
}

const Climate = {
  Temperature: 0,
  Humidity: 1,
  Continentalness: 2,
  Erosion: 3,
  PeaksAndValleys: 4,
  Weirdness: 5,
} as const;

const Land = {
  Continentalness: 0,
  Erosion: 1,
  PeaksAndValleys: 2,
} as const;

// --- The biome generator ---

export class BiomeGenerator {
  private splineStack = new SplineStack();
  private spline = new Spline();
  private octaves: PerlinNoise[] = new Array(46).fill(null).map(() => new PerlinNoise());
  private climate: DoublePerlinNoise[] = new Array(6).fill(null).map(() => new DoublePerlinNoise());

  constructor(seed: bigint) {
    this.initSplines();
    this.initClimateSeeds(seed);
  }

  getBiomeAt(blockX: number, blockZ: number, y = 63): number {
    const x4 = blockX >> 2;
    const z4 = blockZ >> 2;
    const y4 = y >> 2;
    return this.sampleBiomeNoise(x4, y4, z4);
  }

  /**
   * Estimate the surface height at a given block position using the same
   * continentalness/erosion/weirdness splines that drive biome selection.
   * Returns an approximate Y coordinate of the terrain surface.
   */
  getSurfaceHeight(blockX: number, blockZ: number): number {
    const x4 = blockX >> 2;
    const z4 = blockZ >> 2;

    let px = x4;
    let pz = z4;
    px += this.sampleDoublePerlin(this.climate[Climate.PeaksAndValleys], x4, 0, z4) * 4;
    pz += this.sampleDoublePerlin(this.climate[Climate.PeaksAndValleys], z4, x4, 0) * 4;

    const c = this.sampleDoublePerlin(this.climate[Climate.Continentalness], px, 0, pz);
    const e = this.sampleDoublePerlin(this.climate[Climate.Erosion], px, 0, pz);
    const w = this.sampleDoublePerlin(this.climate[Climate.Weirdness], px, 0, pz);

    const npParam = [c, e, -3.0 * (Math.abs(Math.abs(w) - 0.6666667) - 0.33333334), w];
    const off = this.getSpline(npParam, this.spline) + 0.015;

    // Surface is where depth parameter d = 0:
    //   d = 1 - (y4 * 4) / 128 - 83/160 + off = 0
    //   y4 = (1 - 83/160 + off) * 128 / 4 = (0.48125 + off) * 32
    // Convert back from quarter-res to block coords, clamped to world bounds:
    const surfaceY4 = (0.48125 + off) * 32;
    return Math.max(-64, Math.min(320, Math.round(surfaceY4 * 4)));
  }

  // --- Xoroshiro128 PRNG ---

  private xSetSeed(seed: bigint): Xoroshiro {
    const XL = 0x9e3779b97f4a7c15n;
    const XH = 0x6a09e667f3bcc909n;
    const A = 0xbf58476d1ce4e5b9n;
    const B = 0x94d049bb133111ebn;
    let l = xor64(seed, XH);
    let h = add64(l, XL);
    l = multiply64(xor64(l, rightShift64(l, 30n)), A);
    h = multiply64(xor64(h, rightShift64(h, 30n)), A);
    l = multiply64(xor64(l, rightShift64(l, 27n)), B);
    h = multiply64(xor64(h, rightShift64(h, 27n)), B);
    l = xor64(l, rightShift64(l, 31n));
    h = xor64(h, rightShift64(h, 31n));
    return new Xoroshiro(l, h);
  }

  private xNextLong(xr: Xoroshiro): bigint {
    const l = xr.low;
    const h = xr.high;
    const n = add64(rotl64(l + h, 17n), l);
    const x = xor64(h, l);
    xr.low = xor64(xor64(rotl64(l, 49n), x), leftShift64(x, 21n));
    xr.high = rotl64(x, 28n);
    return n;
  }

  private xNextInt(xr: Xoroshiro, n: number): number {
    let r = multiply64(this.xNextLong(xr) & 0xffffffffn, BigInt(n));
    if ((r & 0xffffffffn) < BigInt(n)) {
      const threshold = (~n + 1) % n;
      while ((r & 0xffffffffn) < BigInt(threshold)) {
        r = multiply64(this.xNextLong(xr) & 0xffffffffn, BigInt(n));
      }
    }
    return Number(rightShift64(r, 32n));
  }

  private xNextDouble(xr: Xoroshiro): number {
    return Number(rightShift64(this.xNextLong(xr), 11n)) * 1.1102230246251565e-16;
  }

  // --- Perlin noise ---

  private xPerlinInit(noise: PerlinNoise, xr: Xoroshiro): void {
    noise.a = this.xNextDouble(xr) * 256;
    noise.b = this.xNextDouble(xr) * 256;
    noise.c = this.xNextDouble(xr) * 256;
    noise.amplitude = 1.0;
    noise.lacunarity = 1.0;
    const idx = noise.d;
    for (let i = 0; i < 256; i++) idx[i] = i;
    for (let i = 0; i < 256; i++) {
      const j = this.xNextInt(xr, 256 - i) + i;
      const n = idx[i];
      idx[i] = idx[j];
      idx[j] = n;
      idx[i + 256] = idx[i];
    }
  }

  private samplePerlin(
    noise: PerlinNoise, d1: number, d2: number, d3: number,
  ): number {
    d1 += noise.a;
    d2 += noise.b;
    d3 += noise.c;
    const idx = noise.d;
    const i1 = Math.floor(d1);
    const i2 = Math.floor(d2);
    const i3 = Math.floor(d3);
    d1 -= i1;
    d2 -= i2;
    d3 -= i3;
    const t1 = d1 * d1 * d1 * (d1 * (d1 * 6.0 - 15.0) + 10.0);
    const t2 = d2 * d2 * d2 * (d2 * (d2 * 6.0 - 15.0) + 10.0);
    const t3 = d3 * d3 * d3 * (d3 * (d3 * 6.0 - 15.0) + 10.0);

    const h1 = i1 & 0xff;
    const h2 = i2 & 0xff;
    const h3 = i3 & 0xff;
    const a1 = idx[h1] + h2;
    const b1 = idx[h1 + 1] + h2;
    const a2 = idx[a1] + h3;
    const a3 = idx[a1 + 1] + h3;
    const b2 = idx[b1] + h3;
    const b3 = idx[b1 + 1] + h3;

    let l1 = grad(idx[a2], d1, d2, d3);
    let l2 = grad(idx[b2], d1 - 1, d2, d3);
    let l3 = grad(idx[a3], d1, d2 - 1, d3);
    let l4 = grad(idx[b3], d1 - 1, d2 - 1, d3);
    let l5 = grad(idx[a2 + 1], d1, d2, d3 - 1);
    let l6 = grad(idx[b2 + 1], d1 - 1, d2, d3 - 1);
    let l7 = grad(idx[a3 + 1], d1, d2 - 1, d3 - 1);
    let l8 = grad(idx[b3 + 1], d1 - 1, d2 - 1, d3 - 1);

    l1 = lerp(t1, l1, l2);
    l3 = lerp(t1, l3, l4);
    l5 = lerp(t1, l5, l6);
    l7 = lerp(t1, l7, l8);
    l1 = lerp(t2, l1, l3);
    l5 = lerp(t2, l5, l7);
    return lerp(t3, l1, l5);
  }

  // --- Octave / DoublePerlin ---

  private sampleOctave(noise: OctaveNoise, x: number, y: number, z: number): number {
    let v = 0;
    for (let i = 0; i < noise.octaveCount; i++) {
      const p = noise.octaves[i];
      const lf = p.lacunarity;
      v += p.amplitude * this.samplePerlin(p, x * lf, y * lf, z * lf);
    }
    return v;
  }

  private sampleDoublePerlin(noise: DoublePerlinNoise, x: number, y: number, z: number): number {
    const f = 337.0 / 331.0;
    return (this.sampleOctave(noise.octA, x, y, z)
      + this.sampleOctave(noise.octB, x * f, y * f, z * f)) * noise.amplitude;
  }

  // --- Octave init ---

  private static readonly MD5_OCTAVE: bigint[][] = [
    [0xb198de63a8012672n, 0x7b84cad43ef7b5a8n],
    [0x0fd787bfbc403ec3n, 0x74a4a31ca21b48b8n],
    [0x36d326eed40efeb2n, 0x5be9ce18223c636an],
    [0x082fe255f8be6631n, 0x4e96119e22dedc81n],
    [0x0ef68ec68504005en, 0x48b6bf93a2789640n],
    [0xf11268128982754fn, 0x257a1d670430b0aan],
    [0xe51c98ce7d1de664n, 0x5f9478a733040c45n],
    [0x6d7b49e7e429850an, 0x2e3063c622a24777n],
    [0xbd90d5377ba1b762n, 0xc07317d419a7548dn],
    [0x53d39c6752dac858n, 0xbcd1c5a80ab65b3en],
    [0xb4a24d7a84e7677bn, 0x023ff9668e89b5c4n],
    [0xdffa22b534c5f608n, 0xb9b67517d3665ca9n],
    [0xd50708086cef4d7cn, 0x6e1651ecc7f43309n],
  ];

  private static readonly LACUNA_INI = [
    1, .5, .25, 1/8, 1/16, 1/32, 1/64, 1/128, 1/256, 1/512, 1/1024, 1/2048, 1/4096,
  ];

  private static readonly PERSIST_INI = [
    0, 1, 2/3, 4/7, 8/15, 16/31, 32/63, 64/127, 128/255, 256/511,
  ];

  private static readonly AMP_INI = [
    0, 5/6, 10/9, 15/12, 20/15, 25/18, 30/21, 35/24, 40/27, 45/30,
  ];

  private xOctaveInit(
    noise: OctaveNoise, xr: Xoroshiro, octaves: PerlinNoise[],
    amplitudes: number[], omin: number, len: number, nmax: number,
  ): number {
    let lacuna = BiomeGenerator.LACUNA_INI[-omin];
    let persist = BiomeGenerator.PERSIST_INI[len];
    const xLow = this.xNextLong(xr);
    const xHigh = this.xNextLong(xr);
    let n = 0;
    for (let i = 0; i < len && n !== nmax; i++, lacuna *= 2, persist *= 0.5) {
      if (amplitudes[i] === 0) continue;
      const pxr = new Xoroshiro(
        xor64(xLow, BiomeGenerator.MD5_OCTAVE[12 + omin + i][0]),
        xor64(xHigh, BiomeGenerator.MD5_OCTAVE[12 + omin + i][1]),
      );
      this.xPerlinInit(octaves[n], pxr);
      octaves[n].amplitude = amplitudes[i] * persist;
      octaves[n].lacunarity = lacuna;
      n++;
    }
    noise.octaves = octaves;
    noise.octaveCount = n;
    return n;
  }

  private xDoublePerlinInit(
    noise: DoublePerlinNoise, xr: Xoroshiro, octaves: PerlinNoise[],
    amplitudes: number[], omin: number, len: number, nmax: number,
  ): number {
    let n = 0;
    let na = -1, nb = -1;
    if (nmax > 0) {
      na = (nmax + 1) >> 1;
      nb = nmax - na;
    }
    n += this.xOctaveInit(noise.octA, xr, octaves.slice(n), amplitudes, omin, len, na);
    n += this.xOctaveInit(noise.octB, xr, octaves.slice(n), amplitudes, omin, len, nb);

    let trimLen = len;
    for (let i = trimLen - 1; i >= 0 && amplitudes[i] === 0; i--) trimLen--;
    for (let i = 0; amplitudes[i] === 0; i++) trimLen--;
    noise.amplitude = BiomeGenerator.AMP_INI[trimLen];
    return n;
  }

  // --- Climate seed init ---

  private static readonly CLIMATE_CONFIGS: Array<{
    lo: bigint; hi: bigint; amps: number[]; omin: number; len: number;
  }> = [
    { lo: 0x5c7e6b29735f0d7fn, hi: 0xf7d86f1bbc734988n, amps: [1.5,0,1,0,0,0],    omin: -10, len: 6 },
    { lo: 0x81bb4d22e8dc168en, hi: 0xf1c8b4bea16303cdn, amps: [1,1,0,0,0,0],       omin: -8,  len: 6 },
    { lo: 0x83886c9d0ae3a662n, hi: 0xafa638a61b42e8adn, amps: [1,1,2,2,2,1,1,1,1], omin: -9,  len: 9 },
    { lo: 0xd02491e6058f6fd8n, hi: 0x4792512c94c17a80n, amps: [1,1,0,1,1],          omin: -9,  len: 5 },
    { lo: 0x080518cf6af25384n, hi: 0x3f3dfb40a54febd5n, amps: [1,1,1,0],            omin: -3,  len: 4 },
    { lo: 0xefc8ef4d36102b34n, hi: 0x1beeeb324a0f24ean, amps: [1,2,1,0,0,0],        omin: -7,  len: 6 },
  ];

  private initClimateSeeds(seed: bigint): void {
    const pxr = this.xSetSeed(seed);
    const xLow = this.xNextLong(pxr);
    const xHigh = this.xNextLong(pxr);
    let offset = 0;
    for (let i = 0; i < 6; i++) {
      const cfg = BiomeGenerator.CLIMATE_CONFIGS[i];
      const cxr = new Xoroshiro(xor64(xLow, cfg.lo), xor64(xHigh, cfg.hi));
      offset += this.xDoublePerlinInit(
        this.climate[i], cxr, this.octaves.slice(offset), cfg.amps, cfg.omin, cfg.len, -1,
      );
    }
  }

  // --- Splines (terrain depth for biome mapping) ---

  private createFixed(v: number): FixedSpline {
    return new FixedSpline(v);
  }

  private addSplineVal(sp: Spline, loc: number, val: FixedSpline, der: number): void {
    sp.loc[sp.length] = loc;
    sp.der[sp.length] = der;
    sp.value[sp.length] = val;
    sp.length++;
  }

  private createFlatOffsetSpline(o: number[]): Spline {
    const sp = this.splineStack.stack[this.splineStack.length++];
    sp.type = Land.Erosion;
    const l = 0.5 * (o[1] - o[0]);
    const m = 5 * (o[2] - o[1]);
    this.addSplineVal(sp, -1.0, this.createFixed(o[0]), l);
    this.addSplineVal(sp, -0.4, this.createFixed(o[1]), l < m ? l : m);
    this.addSplineVal(sp, 0.0, this.createFixed(o[2]), m);
    this.addSplineVal(sp, 0.4, this.createFixed(o[3]), 2 * (o[3] - o[2]));
    this.addSplineVal(sp, 1.0, this.createFixed(o[4]), 0.7 * (o[4] - o[3]));
    return sp;
  }

  private createMountainRidgeSpline(
    i: number, k: number, l: number, depth: number,
  ): Spline {
    const spline = this.splineStack.stack[this.splineStack.length++];
    spline.type = Land.PeaksAndValleys;
    const r = Math.max(0.5 * (i - (-0.2)), 0);
    const p = 5 * (0.2 + i);
    const u = (k - i) * 0.5;

    if (l >= 0 && l < 1e9) {
      const s = (k - r) / (1.0 - l);
      this.addSplineVal(spline, -1.0, this.createFixed(i), 0.7 * (0.2 + i));
      this.addSplineVal(spline, -0.75, this.createFixed(p), 0);
      this.addSplineVal(spline, -0.65, this.createFixed(r < i ? i : r), 0);
      this.addSplineVal(spline, l - 0.01, this.createFixed(r), 0);
      this.addSplineVal(spline, l, this.createFixed(r), s);
      this.addSplineVal(spline, 1.0, this.createFixed(k), s);
    } else {
      if (depth) {
        this.addSplineVal(spline, -1.0, this.createFixed(i > 0.2 ? i : 0.2), 0);
        this.addSplineVal(spline, 0.0, this.createFixed(lerp(0.5, i, k)), u);
      } else {
        this.addSplineVal(spline, -1.0, this.createFixed(i), u);
      }
      this.addSplineVal(spline, 1.0, this.createFixed(k), u);
    }
    return spline;
  }

  private createLandSpline(o: number[], depth: number): Spline {
    const sp6 = this.createFlatOffsetSpline([-0.02, o[5], o[5], o[1], o[2], 0.0]);
    const sp7 = this.createFlatOffsetSpline([0.0, 0.0, 0.0, o[1], o[2], 0.0]);
    const sp8 = this.splineStack.stack[this.splineStack.length++];
    sp8.type = Land.PeaksAndValleys;
    this.addSplineVal(sp8, -1.0, this.createFixed(o[0]), 0.0);
    this.addSplineVal(sp8, -0.4, sp6 as unknown as FixedSpline, 0.0);
    this.addSplineVal(sp8, 0.0, this.createFixed(o[2] + 0.07), 0.0);

    const sp9 = this.createFlatOffsetSpline([-0.02, o[5], o[5], o[1], o[2], 0.0]);
    const sp10 = this.splineStack.stack[this.splineStack.length++];
    sp10.type = Land.PeaksAndValleys;
    this.addSplineVal(sp10, -1.0, this.createFixed(o[0] + 0.015), 0.0);
    this.addSplineVal(sp10, -0.4, sp9 as unknown as FixedSpline, 0.0);
    this.addSplineVal(sp10, 0.0, this.createFixed(o[2] + 0.07), 0.0);

    const sp11 = this.createMountainRidgeSpline(o[3], o[4], 0.45, depth);
    const sp12 = this.createMountainRidgeSpline(o[3], o[4], Infinity, depth);

    const sp = this.splineStack.stack[this.splineStack.length++];
    sp.type = Land.Erosion;
    this.addSplineVal(sp, -1.0, sp8 as unknown as FixedSpline, 0.0);
    this.addSplineVal(sp, -0.4, sp10 as unknown as FixedSpline, 0.0);
    this.addSplineVal(sp, -0.15, sp7 as unknown as FixedSpline, 0.0);
    this.addSplineVal(sp, -0.1, sp7 as unknown as FixedSpline, 0.0);
    this.addSplineVal(sp, 0.2, sp11 as unknown as FixedSpline, 0.0);
    this.addSplineVal(sp, 0.45, sp11 as unknown as FixedSpline, 0.0);
    this.addSplineVal(sp, 0.55, sp12 as unknown as FixedSpline, 0.0);
    this.addSplineVal(sp, 0.7, sp12 as unknown as FixedSpline, 0.0);

    return sp;
  }

  private initSplines(): void {
    const spline = this.splineStack.stack[this.splineStack.length++];
    const sp1 = this.createLandSpline([-0.15, 0.0, 0.0, 0.1, 0.0, -0.03], 0);
    const sp2 = this.createLandSpline([-0.1, 0.03, 0.1, 0.1, 0.01, -0.03], 0);
    const sp3 = this.createLandSpline([-0.1, 0.03, 0.1, 0.7, 0.01, -0.03], 1);
    const sp4 = this.createLandSpline([-0.05, 0.03, 0.1, 1.0, 0.01, 0.01], 1);

    this.addSplineVal(spline, -1.1, this.createFixed(0.044), 0.0);
    this.addSplineVal(spline, -1.02, this.createFixed(-0.2222), 0.0);
    this.addSplineVal(spline, -0.51, this.createFixed(-0.2222), 0.0);
    this.addSplineVal(spline, -0.44, this.createFixed(-0.12), 0.0);
    this.addSplineVal(spline, -0.18, this.createFixed(-0.12), 0.0);
    this.addSplineVal(spline, -0.16, sp1 as unknown as FixedSpline, 0.0);
    this.addSplineVal(spline, -0.15, sp1 as unknown as FixedSpline, 0.0);
    this.addSplineVal(spline, -0.1, sp2 as unknown as FixedSpline, 0.0);
    this.addSplineVal(spline, 0.25, sp3 as unknown as FixedSpline, 0.0);
    this.addSplineVal(spline, 1.0, sp4 as unknown as FixedSpline, 0.0);

    this.spline = spline;
  }

  private getSpline(vals: number[], sp: Spline | FixedSpline): number {
    if (!sp || sp.length <= 0) return 0;
    if (sp.length === 1) {
      if (sp instanceof Spline) return (sp.value[0] as FixedSpline).value;
      return (sp as FixedSpline).value;
    }
    if (sp instanceof FixedSpline) return sp.value;

    const s = sp as Spline;
    const f = vals[s.type];
    let i: number;
    for (i = 0; i < s.length; i++) if (s.loc[i] >= f) break;

    if (i === 0 || i === s.length) {
      if (i) i--;
      return this.getSpline(vals, s.value[i]) + s.der[i] * (f - s.loc[i]);
    }

    const g = s.loc[i - 1];
    const h = s.loc[i];
    const k = (f - g) / (h - g);
    const n = this.getSpline(vals, s.value[i - 1]);
    const o = this.getSpline(vals, s.value[i]);
    const p = s.der[i - 1] * (h - g) - (o - n);
    const q = -s.der[i] * (h - g) + (o - n);
    return lerp(k, n, o) + k * (1.0 - k) * lerp(k, p, q);
  }

  // --- Core biome sampling ---

  private sampleBiomeNoise(x: number, y: number, z: number): number {
    let px = x;
    let pz = z;

    px += this.sampleDoublePerlin(this.climate[Climate.PeaksAndValleys], x, 0, z) * 4;
    pz += this.sampleDoublePerlin(this.climate[Climate.PeaksAndValleys], z, x, 0) * 4;

    const c = this.sampleDoublePerlin(this.climate[Climate.Continentalness], px, 0, pz);
    const e = this.sampleDoublePerlin(this.climate[Climate.Erosion], px, 0, pz);
    const w = this.sampleDoublePerlin(this.climate[Climate.Weirdness], px, 0, pz);

    const npParam = [c, e, -3.0 * (Math.abs(Math.abs(w) - 0.6666667) - 0.33333334), w];
    const off = this.getSpline(npParam, this.spline) + 0.015;
    const d = 1 - (y << 2) / 128 - 83 / 160 + off;

    const t = this.sampleDoublePerlin(this.climate[Climate.Temperature], px, 0, pz);
    const h = this.sampleDoublePerlin(this.climate[Climate.Humidity], px, 0, pz);

    const np = [
      Math.trunc(10000 * t),
      Math.trunc(10000 * h),
      Math.trunc(10000 * c),
      Math.trunc(10000 * e),
      Math.trunc(10000 * d),
      Math.trunc(10000 * w),
    ];

    return this.climateToBiome(np);
  }

  // --- Biome tree lookup (optimized: no BigInt in hot path) ---

  private climateToBiome(np: number[]): number {
    const leaf = this.getNode(np, 0, 0, Infinity, 0);
    return TREE_NODES[leaf].biomeId;
  }

  private getDistanceNum(np: number[], index: number): number {
    const node = TREE_NODES[index];
    if (!node) return Infinity;
    let ds = 0;
    for (let i = 0; i < 6; i++) {
      const pIdx = node.paramIdx[i];
      const p = PARAMS_NUM[pIdx];
      const lo = p[0]; // min
      const hi = p[1]; // max
      let d = 0;
      if (np[i] > hi) d = np[i] - hi;
      else if (np[i] < lo) d = lo - np[i];
      ds += d * d;
    }
    return ds;
  }

  private getNode(np: number[], idx: number, alt: number, ds: number, depth: number): number {
    if (depth >= 5) return idx;
    const steps = [1555, 259, 43, 7, 1];
    let depthx = depth;
    let step: number;
    const treeLen = TREE_NODES.length;
    do {
      if (depthx >= 5) return idx;
      step = steps[depthx];
      depthx++;
    } while (idx + step >= treeLen);

    let inner = TREE_NODES[idx].child;
    let leaf = alt;
    let dsx = ds;

    for (let i = 0; i < 6; i++) {
      if (inner >= treeLen) break;
      const innerDs = this.getDistanceNum(np, inner);
      if (innerDs < dsx) {
        const leaf2 = this.getNode(np, inner, leaf, ds, depthx);
        const dsLeaf2 = inner === leaf2 ? innerDs : this.getDistanceNum(np, leaf2);
        if (dsLeaf2 < dsx) {
          dsx = dsLeaf2;
          leaf = leaf2;
        }
      }
      inner += step;
    }
    return leaf;
  }
}

function grad(idx: number, a: number, b: number, c: number): number {
  switch (idx & 0xf) {
    case 0:  return  a + b;
    case 1:  return -a + b;
    case 2:  return  a - b;
    case 3:  return -a - b;
    case 4:  return  a + c;
    case 5:  return -a + c;
    case 6:  return  a - c;
    case 7:  return -a - c;
    case 8:  return  b + c;
    case 9:  return -b + c;
    case 10: return  b - c;
    case 11: return -b - c;
    case 12: return  a + b;
    case 13: return -b + c;
    case 14: return -a + b;
    case 15: return -b - c;
    default: return 0;
  }
}

// Map biome IDs to our terrain rendering categories
export function biomeToCategory(biomeId: number): string {
  switch (biomeId) {
    case BIOME.DeepOcean:
    case BIOME.DeepColdOcean:
    case BIOME.DeepFrozenOcean:
    case BIOME.DeepLukewarmOcean:
    case BIOME.DeepWarmOcean:
      return 'deep_ocean';
    case BIOME.Ocean:
    case BIOME.ColdOcean:
    case BIOME.FrozenOcean:
    case BIOME.LukewarmOcean:
    case BIOME.WarmOcean:
      return 'ocean';
    case BIOME.River:
    case BIOME.FrozenRiver:
      return 'river';
    case BIOME.Beach:
    case BIOME.SnowyBeach:
    case BIOME.StoneShore:
    case BIOME.MushroomFieldShore:
      return 'beach';
    case BIOME.Plains:
    case BIOME.SunflowerPlains:
    case BIOME.Meadow:
      return 'plains';
    case BIOME.Forest:
    case BIOME.FlowerForest:
    case BIOME.BirchForest:
    case BIOME.BirchForestHills:
    case BIOME.TallBirchForest:
      return 'forest';
    case BIOME.DarkForest:
      return 'dark_forest';
    case BIOME.Swamp:
    case BIOME.MangroveSwamp:
      return 'swamp';
    case BIOME.Desert:
      return 'desert';
    case BIOME.Savanna:
    case BIOME.SavannaPlateau:
      return 'savanna';
    case BIOME.WindsweptHills:
    case BIOME.WindsweptForest:
    case BIOME.WindsweptSavanna:
    case BIOME.StonyPeaks:
    case BIOME.JaggedPeaks:
    case BIOME.GravellyMountains:
      return 'mountains';
    case BIOME.SnowyTundra:
    case BIOME.SnowyMountains:
    case BIOME.SnowyTaiga:
    case BIOME.SnowySlopes:
    case BIOME.FrozenPeaks:
    case BIOME.IceSpikes:
    case BIOME.Grove:
      return 'snowy';
    case BIOME.Jungle:
    case BIOME.JungleHills:
    case BIOME.JungleEdge:
    case BIOME.BambooJungle:
      return 'jungle';
    case BIOME.Taiga:
    case BIOME.TaigaHills:
    case BIOME.GiantTreeTaiga:
    case BIOME.GiantSpruceTaiga:
    case BIOME.OldGrowthSpruceTaiga:
      return 'dark_forest';
    case BIOME.Badlands:
    case BIOME.WoodedBadlands:
    case BIOME.BadlandsPlateau:
    case BIOME.ErodedBadlands:
      return 'desert';
    case BIOME.MushroomFields:
      return 'jungle';
    case BIOME.DripstoneCaves:
    case BIOME.LushCaves:
    case BIOME.DeepDark:
      return 'dark_forest';
    // Nether
    case BIOME.NetherWastes:
      return 'nether_wastes';
    case BIOME.SoulSandValley:
      return 'soul_sand';
    case BIOME.CrimsonForest:
      return 'crimson_forest';
    case BIOME.WarpedForest:
      return 'warped_forest';
    case BIOME.BasaltDeltas:
      return 'basalt_delta';
    // End
    case BIOME.TheEnd:
    case BIOME.SmallEndIslands:
    case BIOME.EndBarrens:
      return 'end_stone';
    case BIOME.EndMidlands:
      return 'end_stone';
    case BIOME.EndHighlands:
      return 'chorus';
    default:
      return 'plains';
  }
}

export { BIOME };
