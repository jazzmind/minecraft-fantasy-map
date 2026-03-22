// Fantasy-map-style terrain rendering.
// Draws hand-drawn decorations over a subtle color wash for each terrain type.

import type { TerrainCell, TerrainType } from '../utils/noise';

const FONT_FAMILY = "'Courier New', monospace";

// Seeded random for consistent decoration placement
function decorRng(x: number, z: number, salt: number): number {
  let n = (x * 127 + z * 311 + salt * 997) | 0;
  n = ((n >> 13) ^ n) | 0;
  n = (n * (n * n * 15731 + 789221) + 1376312589) | 0;
  return (n & 0x7fffffff) / 0x7fffffff;
}

// Semi-transparent terrain color wash
const WASH_COLORS: Partial<Record<TerrainType, string>> = {
  deep_ocean:       'rgba(34,75,120,0.35)',
  ocean:            'rgba(60,125,170,0.30)',
  river:            'rgba(75,140,185,0.32)',
  beach:            'rgba(212,192,136,0.15)',
  plains:           'rgba(160,200,110,0.10)',
  forest:           'rgba(90,138,60,0.15)',
  dark_forest:      'rgba(61,107,46,0.18)',
  swamp:            'rgba(107,122,74,0.16)',
  desert:           'rgba(212,184,106,0.18)',
  savanna:          'rgba(184,168,80,0.14)',
  mountains:        'rgba(138,138,122,0.18)',
  snowy:            'rgba(216,220,232,0.22)',
  jungle:           'rgba(61,136,64,0.18)',
  stone:            'rgba(100,100,105,0.30)',
  deepslate:        'rgba(55,55,65,0.38)',
  cavern:           'rgba(30,25,20,0.35)',
  aquifer:          'rgba(40,90,130,0.32)',
  lava_underground: 'rgba(200,80,10,0.35)',
  air:              'rgba(220,225,240,0.06)',
  // Nether
  lava_sea:       'rgba(200,80,0,0.25)',
  nether_wastes:  'rgba(120,40,40,0.20)',
  soul_sand:      'rgba(80,60,40,0.22)',
  crimson_forest: 'rgba(150,30,30,0.22)',
  warped_forest:  'rgba(30,120,100,0.22)',
  basalt_delta:   'rgba(60,60,60,0.25)',
  // End
  end_void:       'rgba(10,10,25,0.30)',
  end_stone:      'rgba(210,205,150,0.18)',
  chorus:         'rgba(140,80,140,0.20)',
};

// Ink colors for decorations
const INK_COLORS: Partial<Record<TerrainType, string>> = {
  deep_ocean:       'rgba(34,65,110,0.50)',
  ocean:            'rgba(50,100,145,0.45)',
  river:            'rgba(60,110,155,0.48)',
  stone:            'rgba(80,80,85,0.45)',
  deepslate:        'rgba(50,50,60,0.50)',
  cavern:           'rgba(50,40,30,0.50)',
  aquifer:          'rgba(40,100,150,0.50)',
  lava_underground: 'rgba(220,100,20,0.55)',
  air:              'rgba(180,190,210,0.10)',
  forest:         'rgba(50,90,40,0.50)',
  dark_forest:    'rgba(40,70,30,0.55)',
  mountains:      'rgba(90,80,70,0.50)',
  snowy:          'rgba(130,140,160,0.40)',
  desert:         'rgba(160,140,80,0.35)',
  swamp:          'rgba(80,90,50,0.40)',
  jungle:         'rgba(40,100,40,0.45)',
  savanna:        'rgba(140,130,60,0.35)',
  // Nether
  lava_sea:       'rgba(220,100,20,0.50)',
  nether_wastes:  'rgba(140,50,40,0.40)',
  soul_sand:      'rgba(100,80,55,0.45)',
  crimson_forest: 'rgba(180,40,40,0.50)',
  warped_forest:  'rgba(40,150,130,0.50)',
  basalt_delta:   'rgba(80,80,80,0.45)',
  // End
  end_void:       'rgba(30,20,60,0.30)',
  end_stone:      'rgba(180,175,120,0.35)',
  chorus:         'rgba(160,80,160,0.50)',
};

function drawTree(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  // Trunk
  ctx.moveTo(cx, cy + size * 0.5);
  ctx.lineTo(cx, cy - size * 0.1);
  ctx.stroke();
  // Canopy (small triangle / circle-ish)
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.35, cy);
  ctx.lineTo(cx, cy - size * 0.7);
  ctx.lineTo(cx + size * 0.35, cy);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function drawPineTree(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.7;
  // Trunk
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.4);
  ctx.lineTo(cx, cy - size * 0.1);
  ctx.stroke();
  // Two triangle layers
  for (let i = 0; i < 2; i++) {
    const yOff = -size * 0.15 * i;
    const w = size * (0.3 - i * 0.08);
    ctx.beginPath();
    ctx.moveTo(cx - w, cy + yOff);
    ctx.lineTo(cx, cy - size * 0.5 + yOff);
    ctx.lineTo(cx + w, cy + yOff);
    ctx.closePath();
    ctx.fill();
  }
}

function drawMountainPeak(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string, snowy: boolean) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.5, cy + size * 0.3);
  ctx.lineTo(cx - size * 0.1, cy - size * 0.5);
  ctx.lineTo(cx + size * 0.15, cy - size * 0.35);
  ctx.lineTo(cx + size * 0.5, cy + size * 0.3);
  ctx.stroke();
  // Hatch lines for shading
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 3; i++) {
    const ly = cy - size * 0.3 + i * size * 0.18;
    ctx.beginPath();
    ctx.moveTo(cx + size * 0.05, ly);
    ctx.lineTo(cx + size * (0.2 + i * 0.1), ly + size * 0.1);
    ctx.stroke();
  }
  if (snowy) {
    ctx.fillStyle = 'rgba(220,225,240,0.6)';
    ctx.beginPath();
    ctx.moveTo(cx - size * 0.15, cy - size * 0.3);
    ctx.lineTo(cx - size * 0.1, cy - size * 0.5);
    ctx.lineTo(cx + size * 0.15, cy - size * 0.35);
    ctx.lineTo(cx + size * 0.1, cy - size * 0.2);
    ctx.closePath();
    ctx.fill();
  }
}

function drawWaves(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.4, cy);
  ctx.quadraticCurveTo(cx - size * 0.2, cy - size * 0.15, cx, cy);
  ctx.quadraticCurveTo(cx + size * 0.2, cy + size * 0.15, cx + size * 0.4, cy);
  ctx.stroke();
}

function drawSwampReeds(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  for (let i = -1; i <= 1; i++) {
    ctx.beginPath();
    ctx.moveTo(cx + i * size * 0.15, cy + size * 0.3);
    ctx.lineTo(cx + i * size * 0.15 + i * size * 0.05, cy - size * 0.3);
    ctx.stroke();
  }
}

function drawCactus(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  // Main stem
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.4);
  ctx.lineTo(cx, cy - size * 0.4);
  ctx.stroke();
  // Arms
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.2, cy - size * 0.05);
  ctx.lineTo(cx - size * 0.2, cy - size * 0.25);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx + size * 0.15, cy + size * 0.1);
  ctx.lineTo(cx + size * 0.15, cy - size * 0.15);
  ctx.stroke();
}

// --- Nether decorations ---

function drawLavaBlob(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.35, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,160,40,0.3)';
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  ctx.arc(cx - size * 0.1, cy - size * 0.05, size * 0.08, 0, Math.PI * 2);
  ctx.stroke();
}

function drawNetherShrub(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.35);
  ctx.lineTo(cx, cy - size * 0.15);
  ctx.stroke();
  ctx.beginPath();
  ctx.arc(cx, cy - size * 0.25, size * 0.25, 0, Math.PI * 2);
  ctx.fill();
}

function drawWarpedVine(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.4);
  ctx.quadraticCurveTo(cx - size * 0.2, cy, cx + size * 0.1, cy - size * 0.4);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx + size * 0.1, cy - size * 0.4, size * 0.1, 0, Math.PI * 2);
  ctx.fill();
}

function drawBasaltColumn(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 1;
  const w = size * 0.15;
  ctx.beginPath();
  ctx.rect(cx - w, cy - size * 0.35, w * 2, size * 0.7);
  ctx.stroke();
  ctx.strokeStyle = 'rgba(100,100,100,0.3)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.moveTo(cx - w, cy - size * 0.1);
  ctx.lineTo(cx + w, cy - size * 0.1);
  ctx.moveTo(cx - w, cy + size * 0.1);
  ctx.lineTo(cx + w, cy + size * 0.1);
  ctx.stroke();
}

function drawSoulFire(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.6;
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.1, cy + size * 0.2);
  ctx.quadraticCurveTo(cx, cy - size * 0.3, cx + size * 0.1, cy + size * 0.2);
  ctx.stroke();
}

// --- End decorations ---

function drawEndPillar(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  const w = size * 0.12;
  ctx.beginPath();
  ctx.rect(cx - w, cy - size * 0.5, w * 2, size);
  ctx.stroke();
  ctx.fillStyle = 'rgba(210,205,150,0.25)';
  ctx.fillRect(cx - w, cy - size * 0.5, w * 2, size);
}

function drawChorusPlant(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.4);
  ctx.lineTo(cx, cy - size * 0.1);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.1);
  ctx.lineTo(cx - size * 0.2, cy - size * 0.3);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(cx, cy - size * 0.1);
  ctx.lineTo(cx + size * 0.2, cy - size * 0.35);
  ctx.stroke();
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx - size * 0.2, cy - size * 0.3, size * 0.08, 0, Math.PI * 2);
  ctx.fill();
  ctx.beginPath();
  ctx.arc(cx + size * 0.2, cy - size * 0.35, size * 0.08, 0, Math.PI * 2);
  ctx.fill();
}

function drawVoidSpeckle(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, size * 0.04, 0, Math.PI * 2);
  ctx.fill();
}

function drawStoneHash(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.5;
  const s = size * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s * 0.3);
  ctx.lineTo(cx + s, cy - s * 0.3);
  ctx.moveTo(cx - s * 0.7, cy + s * 0.3);
  ctx.lineTo(cx + s * 0.5, cy + s * 0.3);
  ctx.stroke();
}

function drawDeepslateHash(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  const s = size * 0.3;
  ctx.beginPath();
  ctx.moveTo(cx - s, cy - s);
  ctx.lineTo(cx + s, cy + s);
  ctx.moveTo(cx + s * 0.5, cy - s);
  ctx.lineTo(cx - s * 0.5, cy + s);
  ctx.stroke();
}

function drawCavernOpening(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.7;
  // Irregular opening shape
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.35, cy + size * 0.15);
  ctx.quadraticCurveTo(cx - size * 0.2, cy - size * 0.3, cx, cy - size * 0.25);
  ctx.quadraticCurveTo(cx + size * 0.25, cy - size * 0.35, cx + size * 0.35, cy + size * 0.1);
  ctx.stroke();
  // Floor
  ctx.beginPath();
  ctx.moveTo(cx - size * 0.3, cy + size * 0.15);
  ctx.lineTo(cx + size * 0.3, cy + size * 0.15);
  ctx.stroke();
}

function drawAquiferPool(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.35, size * 0.2, 0, 0, Math.PI * 2);
  ctx.fill();
  // Ripple
  ctx.strokeStyle = 'rgba(100,180,220,0.3)';
  ctx.lineWidth = 0.4;
  ctx.beginPath();
  ctx.ellipse(cx, cy - size * 0.05, size * 0.2, size * 0.1, 0, 0, Math.PI * 2);
  ctx.stroke();
}

function drawLavaPool(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(cx, cy, size * 0.3, size * 0.18, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.strokeStyle = 'rgba(255,200,50,0.3)';
  ctx.lineWidth = 0.5;
  ctx.stroke();
}

function drawSandDots(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.fillStyle = color;
  for (let i = 0; i < 4; i++) {
    const dx = (decorRng(Math.round(cx) + i, Math.round(cy), 77) - 0.5) * size * 0.6;
    const dz = (decorRng(Math.round(cx), Math.round(cy) + i, 88) - 0.5) * size * 0.6;
    ctx.fillRect(cx + dx, cy + dz, 1, 1);
  }
}

function drawGrassStrokes(ctx: CanvasRenderingContext2D, cx: number, cy: number, size: number, color: string) {
  ctx.strokeStyle = color;
  ctx.lineWidth = 0.4;
  for (let i = 0; i < 2; i++) {
    const dx = (i - 0.5) * size * 0.25;
    ctx.beginPath();
    ctx.moveTo(cx + dx, cy + size * 0.15);
    ctx.lineTo(cx + dx + size * 0.05, cy - size * 0.15);
    ctx.stroke();
  }
}

export function drawTerrainOverlay(
  ctx: CanvasRenderingContext2D,
  cells: TerrainCell[][],
  startX: number,
  startZ: number,
  step: number,
  worldToScreen: (wx: number, wz: number) => { sx: number; sy: number },
  canvasWidth: number,
  canvasHeight: number,
) {
  if (cells.length === 0) return;

  ctx.save();

  const UNDERGROUND_TYPES = new Set<TerrainType>(['stone', 'deepslate', 'lava_underground', 'cavern', 'aquifer']);
  const AIR_TYPE: TerrainType = 'air';

  // Pass 1: Color wash — subtle background tinting
  // When underground or in air, also draw the surface biome very faintly beneath
  for (let r = 0; r < cells.length - 1; r++) {
    for (let c = 0; c < cells[r].length - 1; c++) {
      const cell = cells[r][c];
      const wx = startX + c * step;
      const wz = startZ + r * step;
      const p1 = worldToScreen(wx, wz);
      const p2 = worldToScreen(wx + step, wz + step);

      if (p2.sx < 0 || p1.sx > canvasWidth || p2.sy < 0 || p1.sy > canvasHeight) continue;

      const w = p2.sx - p1.sx;
      const h = p2.sy - p1.sy;

      // Draw faint surface biome beneath underground/air layers
      if ((UNDERGROUND_TYPES.has(cell.type) || cell.type === AIR_TYPE) && cell.surfaceBiome) {
        const surfaceWash = WASH_COLORS[cell.surfaceBiome];
        if (surfaceWash) {
          ctx.globalAlpha = 0.3;
          ctx.fillStyle = surfaceWash;
          ctx.fillRect(p1.sx, p1.sy, w, h);
          ctx.globalAlpha = 1;
        }
      }

      const wash = WASH_COLORS[cell.type];
      if (!wash) continue;
      ctx.fillStyle = wash;
      ctx.fillRect(p1.sx, p1.sy, w, h);
    }
  }

  // Pass 2: Hand-drawn decorations
  for (let r = 0; r < cells.length; r++) {
    for (let c = 0; c < cells[r].length; c++) {
      const cell = cells[r][c];
      const wx = startX + c * step;
      const wz = startZ + r * step;
      const pos = worldToScreen(wx, wz);

      // Skip off-screen
      if (pos.sx < -20 || pos.sx > canvasWidth + 20 || pos.sy < -20 || pos.sy > canvasHeight + 20) continue;

      // Use deterministic randomness for placement decisions
      const rng = decorRng(c, r, 42);
      const rng2 = decorRng(c, r, 99);
      const ink = INK_COLORS[cell.type] || 'rgba(100,100,100,0.15)';

      // Cell size on screen for decoration scaling
      const nextPos = worldToScreen(wx + step, wz + step);
      const cellPx = Math.max(nextPos.sx - pos.sx, 4);
      const decoSize = Math.min(cellPx * 0.55, 18);

      if (decoSize < 2.5) continue; // too small to decorate

      // Offset from grid point for natural feel
      const ox = (rng - 0.5) * cellPx * 0.4;
      const oz = (rng2 - 0.5) * cellPx * 0.4;
      const dx = pos.sx + cellPx * 0.5 + ox;
      const dy = pos.sy + cellPx * 0.5 + oz;

      switch (cell.type) {
        case 'forest':
          if (rng > 0.2) drawTree(ctx, dx, dy, decoSize, ink);
          break;
        case 'dark_forest':
          if (rng > 0.15) drawPineTree(ctx, dx, dy, decoSize, ink);
          break;
        case 'jungle':
          if (rng > 0.18) drawTree(ctx, dx, dy, decoSize * 1.1, ink);
          break;
        case 'mountains':
          if (rng > 0.35) drawMountainPeak(ctx, dx, dy, decoSize * 1.4, ink, false);
          break;
        case 'snowy':
          if (rng > 0.3) drawMountainPeak(ctx, dx, dy, decoSize * 1.4, ink, true);
          break;
        case 'deep_ocean':
          if (rng > 0.25) drawWaves(ctx, dx, dy, decoSize, ink);
          if (rng2 > 0.6) drawWaves(ctx, dx + decoSize * 0.3, dy + decoSize * 0.35, decoSize * 0.7, ink);
          break;
        case 'ocean':
          if (rng > 0.25) drawWaves(ctx, dx, dy, decoSize, ink);
          break;
        case 'river':
          if (rng > 0.2) drawWaves(ctx, dx, dy, decoSize * 0.8, ink);
          break;
        case 'swamp':
          if (rng > 0.35) drawSwampReeds(ctx, dx, dy, decoSize, ink);
          break;
        case 'desert':
          if (rng > 0.45) drawCactus(ctx, dx, dy, decoSize, ink);
          else if (rng > 0.25) drawSandDots(ctx, dx, dy, decoSize, ink);
          break;
        case 'savanna':
          if (rng > 0.55) drawTree(ctx, dx, dy, decoSize * 0.8, ink);
          else if (rng > 0.35) drawGrassStrokes(ctx, dx, dy, decoSize, ink);
          break;
        case 'plains':
          if (rng > 0.6) drawGrassStrokes(ctx, dx, dy, decoSize, ink);
          break;
        case 'beach':
          if (rng > 0.55) drawSandDots(ctx, dx, dy, decoSize, ink);
          break;
        // Underground
        case 'stone':
          if (rng > 0.3) drawStoneHash(ctx, dx, dy, decoSize, ink);
          break;
        case 'deepslate':
          if (rng > 0.25) drawDeepslateHash(ctx, dx, dy, decoSize, ink);
          break;
        case 'cavern':
          if (rng > 0.2) drawCavernOpening(ctx, dx, dy, decoSize, ink);
          break;
        case 'aquifer':
          if (rng > 0.2) drawAquiferPool(ctx, dx, dy, decoSize, ink);
          if (rng2 > 0.6) drawWaves(ctx, dx + decoSize * 0.2, dy + decoSize * 0.25, decoSize * 0.5, ink);
          break;
        case 'lava_underground':
          if (rng > 0.25) drawLavaPool(ctx, dx, dy, decoSize, ink);
          break;
        case 'air':
          break;
        // Nether
        case 'lava_sea':
          if (rng > 0.35) drawLavaBlob(ctx, dx, dy, decoSize, ink);
          break;
        case 'nether_wastes':
          if (rng > 0.6) drawSandDots(ctx, dx, dy, decoSize, ink);
          break;
        case 'soul_sand':
          if (rng > 0.4) drawSoulFire(ctx, dx, dy, decoSize, ink);
          break;
        case 'crimson_forest':
          if (rng > 0.2) drawNetherShrub(ctx, dx, dy, decoSize, ink);
          break;
        case 'warped_forest':
          if (rng > 0.2) drawWarpedVine(ctx, dx, dy, decoSize, ink);
          break;
        case 'basalt_delta':
          if (rng > 0.3) drawBasaltColumn(ctx, dx, dy, decoSize, ink);
          break;
        // End
        case 'end_void':
          if (rng > 0.8) drawVoidSpeckle(ctx, dx, dy, decoSize, 'rgba(80,60,140,0.20)');
          break;
        case 'end_stone':
          if (rng > 0.65) drawEndPillar(ctx, dx, dy, decoSize, ink);
          break;
        case 'chorus':
          if (rng > 0.25) drawChorusPlant(ctx, dx, dy, decoSize, ink);
          break;
      }
    }
  }

  // Pass 3: Edges — coastlines (Overworld), lava shores (Nether), void edges (End)
  // Draw multiple sketchy lines for a hand-drawn coastline feel
  const liquidTypes = new Set<TerrainType>(['deep_ocean', 'ocean', 'river', 'lava_sea', 'end_void', 'lava_underground', 'aquifer']);

  function edgeStyle(a: TerrainType, b: TerrainType): { color: string; width: number; passes: number } {
    if (a === 'lava_sea' || b === 'lava_sea' || a === 'lava_underground' || b === 'lava_underground')
      return { color: 'rgba(200,100,20,0.40)', width: 1.2, passes: 2 };
    if (a === 'end_void' || b === 'end_void')
      return { color: 'rgba(80,60,140,0.35)', width: 1, passes: 2 };
    if (a === 'aquifer' || b === 'aquifer')
      return { color: 'rgba(40,100,150,0.40)', width: 1.0, passes: 2 };
    if (a === 'river' || b === 'river')
      return { color: 'rgba(60,110,160,0.40)', width: 1.0, passes: 2 };
    return { color: 'rgba(44,85,120,0.45)', width: 1.4, passes: 3 };
  }

  for (let r = 0; r < cells.length - 1; r++) {
    for (let c = 0; c < cells[r].length - 1; c++) {
      const cell = cells[r][c];
      const isLiquid = liquidTypes.has(cell.type);

      if (c + 1 < cells[r].length) {
        const right = cells[r][c + 1];
        if (isLiquid !== liquidTypes.has(right.type)) {
          const wx = startX + (c + 1) * step;
          const wz1 = startZ + r * step;
          const wz2 = startZ + (r + 1) * step;
          const p1 = worldToScreen(wx, wz1);
          const p2 = worldToScreen(wx, wz2);
          if (p1.sx > 0 && p1.sx < canvasWidth) {
            const style = edgeStyle(cell.type, right.type);
            for (let pass = 0; pass < style.passes; pass++) {
              const jitter = (pass - (style.passes - 1) / 2) * 1.5;
              ctx.strokeStyle = style.color;
              ctx.lineWidth = style.width - pass * 0.3;
              ctx.beginPath();
              ctx.moveTo(p1.sx + (decorRng(c, r, 11 + pass) - 0.5) * 4 + jitter, p1.sy);
              ctx.lineTo(p2.sx + (decorRng(c, r, 22 + pass) - 0.5) * 4 + jitter, p2.sy);
              ctx.stroke();
            }
          }
        }
      }

      if (r + 1 < cells.length) {
        const bottom = cells[r + 1][c];
        if (isLiquid !== liquidTypes.has(bottom.type)) {
          const wz = startZ + (r + 1) * step;
          const wx1 = startX + c * step;
          const wx2 = startX + (c + 1) * step;
          const p1 = worldToScreen(wx1, wz);
          const p2 = worldToScreen(wx2, wz);
          if (p1.sy > 0 && p1.sy < canvasHeight) {
            const style = edgeStyle(cell.type, bottom.type);
            for (let pass = 0; pass < style.passes; pass++) {
              const jitter = (pass - (style.passes - 1) / 2) * 1.5;
              ctx.strokeStyle = style.color;
              ctx.lineWidth = style.width - pass * 0.3;
              ctx.beginPath();
              ctx.moveTo(p1.sx, p1.sy + (decorRng(c, r, 33 + pass) - 0.5) * 4 + jitter);
              ctx.lineTo(p2.sx, p2.sy + (decorRng(c, r, 44 + pass) - 0.5) * 4 + jitter);
              ctx.stroke();
            }
          }
        }
      }
    }
  }

  ctx.restore();
}

// Draw terrain legend entry for the map legend
export function drawTerrainLegendItems(ctx: CanvasRenderingContext2D, x: number, y: number): number {
  ctx.save();
  ctx.font = `9px ${FONT_FAMILY}`;

  const items: { label: string; color: string }[] = [
    { label: 'Ocean', color: 'rgba(74,144,184,0.5)' },
    { label: 'Forest', color: 'rgba(90,138,60,0.5)' },
    { label: 'Mountain', color: 'rgba(138,138,122,0.5)' },
    { label: 'Desert', color: 'rgba(212,184,106,0.5)' },
  ];

  items.forEach((item, i) => {
    const iy = y + i * 14;
    ctx.fillStyle = item.color;
    ctx.fillRect(x + 4, iy - 5, 8, 8);
    ctx.fillStyle = '#444';
    ctx.fillText(item.label, x + 18, iy + 2);
  });

  ctx.restore();
  return items.length * 14;
}
