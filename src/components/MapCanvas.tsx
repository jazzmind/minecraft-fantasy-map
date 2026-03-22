import { useRef, useEffect, useCallback, useState } from 'react';
import rough from 'roughjs';
import type { RoughCanvas } from 'roughjs/bin/canvas';
import type { WorldData, Location, Tunnel, Dimension, Obstacle, PortalPair } from '../types';
import { LOCATION_COLORS, OBSTACLE_COLORS } from '../types';
import { getDisplayCoords, idealNetherCoords, convertCoords } from '../utils/coordinates';
import { generateTerrainGrid } from '../utils/noise';
import { drawTerrainOverlay } from './TerrainOverlay';

interface MapCanvasProps {
  data: WorldData;
  viewDimension: Dimension;
  selectedLocationId: string | null;
  selectedTunnelId: string | null;
  onLocationClick: (id: string) => void;
  onCanvasClick: (worldX: number, worldZ: number) => void;
  gridScale: number;
  centerOn: { x: number; z: number } | null;
  yLayerEnabled: boolean;
  focusY: number;
  terrainEnabled: boolean;
}

const Y_LAYER_SIZE = 32;

function yLayerAlpha(entityY: number, focusY: number): number {
  const dist = Math.abs(entityY - focusY);
  if (dist <= Y_LAYER_SIZE / 2) return 1.0;
  if (dist <= Y_LAYER_SIZE) return 0.5;
  if (dist <= Y_LAYER_SIZE * 2) return 0.2;
  return 0.08;
}

interface ViewState {
  offsetX: number;
  offsetY: number;
  zoom: number;
}

const FONT_FAMILY = "'Courier New', monospace";

function drawCompassRose(rc: RoughCanvas, ctx: CanvasRenderingContext2D, x: number, y: number, size: number) {
  const armLen = size * 0.4;
  const seed = 42;

  rc.line(x, y - armLen, x, y + armLen, { roughness: 1.2, stroke: '#555', seed });
  rc.line(x - armLen, y, x + armLen, y, { roughness: 1.2, stroke: '#555', seed: seed + 1 });

  const diagLen = armLen * 0.55;
  rc.line(x - diagLen, y - diagLen, x + diagLen, y + diagLen, {
    roughness: 1.2, stroke: '#999', strokeWidth: 0.5, seed: seed + 2,
  });
  rc.line(x + diagLen, y - diagLen, x - diagLen, y + diagLen, {
    roughness: 1.2, stroke: '#999', strokeWidth: 0.5, seed: seed + 3,
  });

  // N arrow head
  rc.polygon(
    [[x, y - armLen - 8], [x - 5, y - armLen + 4], [x + 5, y - armLen + 4]],
    { fill: '#c0392b', fillStyle: 'solid', roughness: 0.8, stroke: '#c0392b', seed: seed + 4 }
  );

  ctx.save();
  ctx.font = `bold 13px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = '#c0392b';
  ctx.fillText('N', x, y - armLen - 18);
  ctx.fillStyle = '#555';
  ctx.font = `11px ${FONT_FAMILY}`;
  ctx.fillText('S', x, y + armLen + 14);
  ctx.fillText('E', x + armLen + 14, y);
  ctx.fillText('W', x - armLen - 14, y);
  ctx.restore();
}

function drawLocationPin(
  rc: RoughCanvas,
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  loc: Location,
  isSelected: boolean,
  seed: number
) {
  const color = LOCATION_COLORS[loc.type] || '#1abc9c';
  const radius = isSelected ? 10 : 7;

  if (loc.type === 'portal') {
    rc.rectangle(sx - 6, sy - 10, 12, 20, {
      fill: '#9b59b6', fillStyle: 'hachure', roughness: 1.5, stroke: '#7d3c98',
      strokeWidth: isSelected ? 2.5 : 1.5, seed,
    });
  } else if (loc.type === 'base') {
    // house shape
    rc.polygon(
      [[sx - 8, sy], [sx, sy - 12], [sx + 8, sy]],
      { fill: color, fillStyle: 'hachure', roughness: 1.2, stroke: color, strokeWidth: 1.5, seed }
    );
    rc.rectangle(sx - 6, sy, 12, 10, {
      fill: color, fillStyle: 'hachure', roughness: 1, stroke: color, strokeWidth: 1.5, seed: seed + 1,
    });
  } else if (loc.type === 'farm') {
    // diamond
    rc.polygon(
      [[sx, sy - 9], [sx + 9, sy], [sx, sy + 9], [sx - 9, sy]],
      { fill: color, fillStyle: 'cross-hatch', roughness: 1.3, stroke: color, strokeWidth: 1.5, seed }
    );
  } else if (loc.type === 'village') {
    rc.polygon(
      [[sx, sy - 10], [sx + 9, sy + 6], [sx - 9, sy + 6]],
      { fill: color, fillStyle: 'hachure', roughness: 1.2, stroke: color, strokeWidth: 1.5, seed }
    );
  } else {
    rc.circle(sx, sy, radius * 2, {
      fill: color, fillStyle: 'hachure', roughness: 1.5, stroke: color,
      strokeWidth: isSelected ? 2.5 : 1.5, seed,
    });
  }

  if (isSelected) {
    rc.circle(sx, sy, radius * 2 + 10, {
      stroke: '#fff', strokeWidth: 2, roughness: 1.8, seed: seed + 10,
    });
  }

  ctx.save();
  ctx.font = `bold 11px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#222';
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeText(loc.name, sx, sy - 16);
  ctx.fillText(loc.name, sx, sy - 16);
  ctx.restore();
}

function drawObstacleMarker(
  rc: RoughCanvas,
  ctx: CanvasRenderingContext2D,
  sx: number,
  sy: number,
  obstacle: Obstacle,
  seed: number
) {
  const color = OBSTACLE_COLORS[obstacle.type] || '#95a5a6';
  const size = 5;

  if (obstacle.type === 'lava') {
    rc.polygon(
      [[sx, sy - size], [sx + size, sy + size], [sx - size, sy + size]],
      { fill: color, fillStyle: 'solid', roughness: 1.5, stroke: '#c0392b', strokeWidth: 1, seed }
    );
  } else if (obstacle.type === 'water') {
    rc.circle(sx, sy, size * 2, {
      fill: color, fillStyle: 'solid', roughness: 1.2, stroke: '#2471a3', strokeWidth: 1, seed,
    });
  } else {
    rc.rectangle(sx - size, sy - size, size * 2, size * 2, {
      fill: color, fillStyle: 'hachure', roughness: 1.5, stroke: color, strokeWidth: 1, seed,
    });
  }

  if (obstacle.description) {
    ctx.save();
    ctx.font = `9px ${FONT_FAMILY}`;
    ctx.textAlign = 'center';
    ctx.fillStyle = color;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 2;
    const label = obstacle.description.length > 18
      ? obstacle.description.slice(0, 16) + '…'
      : obstacle.description;
    ctx.strokeText(label, sx, sy + size + 11);
    ctx.fillText(label, sx, sy + size + 11);
    ctx.restore();
  }
}

function drawTunnel(
  rc: RoughCanvas,
  ctx: CanvasRenderingContext2D,
  from: { sx: number; sy: number },
  to: { sx: number; sy: number },
  tunnel: Tunnel,
  isSelected: boolean,
  seed: number
) {
  const color = tunnel.status === 'complete'
    ? '#27ae60'
    : tunnel.status === 'in-progress'
      ? '#e67e22'
      : '#7f8c8d';

  rc.line(from.sx, from.sy, to.sx, to.sy, {
    stroke: color,
    strokeWidth: isSelected ? 3 : 1.8,
    roughness: 1.8,
    seed,
    strokeLineDash: tunnel.status === 'planned' ? [8, 6] : tunnel.status === 'in-progress' ? [12, 4] : [],
  });

  // midpoint label
  const mx = (from.sx + to.sx) / 2;
  const my = (from.sy + to.sy) / 2;

  ctx.save();
  ctx.font = `10px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = color;
  ctx.strokeStyle = 'rgba(255,255,255,0.8)';
  ctx.lineWidth = 2;
  const statusLabel = tunnel.status === 'complete' ? '✓' : tunnel.status === 'in-progress' ? '⚒' : '?';
  ctx.strokeText(statusLabel, mx, my - 6);
  ctx.fillText(statusLabel, mx, my - 6);
  ctx.restore();
}

function drawPortalPair(
  rc: RoughCanvas,
  ctx: CanvasRenderingContext2D,
  portal: PortalPair,
  viewDimension: Dimension,
  worldToScreen: (wx: number, wz: number) => { sx: number; sy: number },
  isSelected: boolean,
  seed: number
) {
  const owDisplay = convertCoords(portal.overworldX, portal.overworldZ, 'overworld', viewDimension);
  const owScreen = worldToScreen(owDisplay.x, owDisplay.z);

  // Overworld portal marker
  rc.rectangle(owScreen.sx - 7, owScreen.sy - 11, 14, 22, {
    fill: portal.color,
    fillStyle: 'hachure',
    roughness: 1.5,
    stroke: portal.linked ? '#27ae60' : portal.color,
    strokeWidth: isSelected ? 2.5 : 1.5,
    seed,
  });

  // Inner glow
  rc.rectangle(owScreen.sx - 4, owScreen.sy - 8, 8, 16, {
    fill: '#d8b4fe',
    fillStyle: 'solid',
    roughness: 0.8,
    stroke: 'none',
    seed: seed + 1,
  });

  ctx.save();
  ctx.font = `bold 10px ${FONT_FAMILY}`;
  ctx.textAlign = 'center';
  ctx.fillStyle = '#333';
  ctx.strokeStyle = 'rgba(255,255,255,0.85)';
  ctx.lineWidth = 3;
  ctx.strokeText(portal.name, owScreen.sx, owScreen.sy - 16);
  ctx.fillText(portal.name, owScreen.sx, owScreen.sy - 16);
  ctx.restore();

  if (portal.netherX !== null && portal.netherZ !== null) {
    const nDisplay = convertCoords(portal.netherX, portal.netherZ, 'nether', viewDimension);
    const nScreen = worldToScreen(nDisplay.x, nDisplay.z);

    // Only draw the nether-side marker if it's at a different screen position
    const screenDist = Math.sqrt((owScreen.sx - nScreen.sx) ** 2 + (owScreen.sy - nScreen.sy) ** 2);
    if (screenDist > 8) {
      // Connecting line between overworld and nether portal positions
      rc.line(owScreen.sx, owScreen.sy, nScreen.sx, nScreen.sy, {
        stroke: portal.color,
        strokeWidth: 1,
        roughness: 2,
        strokeLineDash: [4, 4],
        seed: seed + 5,
      });

      // Nether side marker (smaller)
      rc.rectangle(nScreen.sx - 5, nScreen.sy - 8, 10, 16, {
        fill: portal.color,
        fillStyle: 'cross-hatch',
        roughness: 1.5,
        stroke: portal.linked ? '#27ae60' : '#c0392b',
        strokeWidth: 1,
        seed: seed + 2,
      });

      ctx.save();
      ctx.font = `9px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = '#8e44ad';
      ctx.strokeStyle = 'rgba(255,255,255,0.8)';
      ctx.lineWidth = 2;
      const sideLabel = viewDimension === 'nether' ? 'OW→' : '←N';
      ctx.strokeText(sideLabel, nScreen.sx, nScreen.sy + 16);
      ctx.fillText(sideLabel, nScreen.sx, nScreen.sy + 16);
      ctx.restore();
    }
  } else {
    // Show ideal nether position as ghost
    const ideal = idealNetherCoords(portal.overworldX, portal.overworldZ);
    const idealDisplay = convertCoords(ideal.x, ideal.z, 'nether', viewDimension);
    const idealScreen = worldToScreen(idealDisplay.x, idealDisplay.z);

    const screenDist = Math.sqrt((owScreen.sx - idealScreen.sx) ** 2 + (owScreen.sy - idealScreen.sy) ** 2);
    if (screenDist > 8) {
      rc.line(owScreen.sx, owScreen.sy, idealScreen.sx, idealScreen.sy, {
        stroke: 'rgba(155,89,182,0.3)',
        strokeWidth: 0.8,
        roughness: 2.5,
        strokeLineDash: [3, 5],
        seed: seed + 6,
      });

      rc.rectangle(idealScreen.sx - 4, idealScreen.sy - 6, 8, 12, {
        stroke: 'rgba(155,89,182,0.3)',
        strokeWidth: 0.8,
        roughness: 1.8,
        fill: 'rgba(155,89,182,0.05)',
        fillStyle: 'solid',
        seed: seed + 3,
      });

      ctx.save();
      ctx.font = `8px ${FONT_FAMILY}`;
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(155,89,182,0.5)';
      ctx.fillText('ideal', idealScreen.sx, idealScreen.sy + 14);
      ctx.restore();
    }
  }

  if (isSelected) {
    rc.circle(owScreen.sx, owScreen.sy, 32, {
      stroke: '#fff',
      strokeWidth: 2,
      roughness: 1.8,
      seed: seed + 10,
    });
  }
}

function drawLegend(ctx: CanvasRenderingContext2D, rc: RoughCanvas, x: number, y: number, terrainEnabled: boolean) {
  ctx.save();

  const markerItems = [
    { label: 'Planned', dash: '- - - -', color: '#7f8c8d' },
    { label: 'In Progress', dash: '— — —', color: '#e67e22' },
    { label: 'Complete', dash: '———', color: '#27ae60' },
    { label: 'Water', shape: '●', color: '#3498db' },
    { label: 'Lava', shape: '▲', color: '#e74c3c' },
    { label: 'Cavern', shape: '■', color: '#555' },
    { label: 'Portal', shape: '▯', color: '#9b59b6' },
  ];

  const biomeItems = [
    { label: 'Ocean', color: '#4a90b8' },
    { label: 'River', color: '#5da0c5' },
    { label: 'Beach', color: '#d4c088' },
    { label: 'Plains', color: '#8cb860' },
    { label: 'Forest', color: '#5a8a3c' },
    { label: 'Jungle', color: '#3d8840' },
    { label: 'Swamp', color: '#6b7a4a' },
    { label: 'Desert', color: '#d4b86a' },
    { label: 'Savanna', color: '#b8a850' },
    { label: 'Mountains', color: '#8a8a7a' },
    { label: 'Snowy', color: '#d8dce8' },
  ];

  const markerRows = markerItems.length;
  const biomeRows = terrainEnabled ? biomeItems.length : 0;
  const sectionGap = terrainEnabled ? 20 : 0;
  const totalHeight = 28 + markerRows * 16 + sectionGap + biomeRows * 14 + 10;

  rc.rectangle(x, y, 155, totalHeight, {
    fill: 'rgba(255,252,240,0.92)',
    fillStyle: 'solid',
    roughness: 1.2,
    stroke: '#aaa',
    strokeWidth: 1,
    seed: 999,
  });

  ctx.font = `bold 11px ${FONT_FAMILY}`;
  ctx.fillStyle = '#333';
  ctx.fillText('LEGEND', x + 10, y + 18);

  ctx.font = `10px ${FONT_FAMILY}`;
  markerItems.forEach((item, i) => {
    const iy = y + 34 + i * 16;
    ctx.fillStyle = item.color;
    ctx.fillText(item.dash || item.shape || '', x + 10, iy);
    ctx.fillStyle = '#444';
    ctx.fillText(item.label, x + 55, iy);
  });

  if (terrainEnabled) {
    const biomeStartY = y + 34 + markerRows * 16 + 6;
    ctx.font = `bold 10px ${FONT_FAMILY}`;
    ctx.fillStyle = '#555';
    ctx.fillText('BIOMES', x + 10, biomeStartY);

    ctx.font = `9px ${FONT_FAMILY}`;
    biomeItems.forEach((item, i) => {
      const iy = biomeStartY + 14 + i * 14;
      ctx.fillStyle = item.color;
      ctx.fillRect(x + 10, iy - 8, 10, 10);
      ctx.strokeStyle = '#999';
      ctx.lineWidth = 0.5;
      ctx.strokeRect(x + 10, iy - 8, 10, 10);
      ctx.fillStyle = '#444';
      ctx.fillText(item.label, x + 26, iy);
    });
  }

  ctx.restore();
}

export default function MapCanvas({
  data,
  viewDimension,
  selectedLocationId,
  selectedTunnelId,
  onLocationClick,
  onCanvasClick,
  gridScale,
  centerOn,
  yLayerEnabled,
  focusY,
  terrainEnabled,
}: MapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [view, setView] = useState<ViewState>({ offsetX: 0, offsetY: 0, zoom: 1 });
  const isDragging = useRef(false);
  const dragStart = useRef({ x: 0, y: 0 });
  const lastMouse = useRef({ x: 0, y: 0 });
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [cursorCoords, setCursorCoords] = useState<{ x: number; z: number } | null>(null);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        const { width, height } = entry.contentRect;
        setCanvasSize({ width: Math.floor(width), height: Math.floor(height) });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Center on a world coordinate when requested
  useEffect(() => {
    if (!centerOn) return;
    setView((prev) => ({
      ...prev,
      offsetX: -(centerOn.x / gridScale) * 40 * prev.zoom,
      offsetY: -(centerOn.z / gridScale) * 40 * prev.zoom,
    }));
  }, [centerOn, gridScale]);

  // Non-passive wheel handler to avoid passive event listener errors
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setView((prev) => ({
        ...prev,
        zoom: Math.max(0.1, Math.min(10, prev.zoom * delta)),
      }));
    };
    canvas.addEventListener('wheel', onWheel, { passive: false });
    return () => canvas.removeEventListener('wheel', onWheel);
  }, []);

  const worldToScreen = useCallback(
    (wx: number, wz: number) => {
      const cx = canvasSize.width / 2;
      const cy = canvasSize.height / 2;
      return {
        sx: cx + (wx / gridScale) * 40 * view.zoom + view.offsetX,
        sy: cy + (wz / gridScale) * 40 * view.zoom + view.offsetY,
      };
    },
    [canvasSize, view, gridScale]
  );

  const screenToWorld = useCallback(
    (sx: number, sy: number) => {
      const cx = canvasSize.width / 2;
      const cy = canvasSize.height / 2;
      return {
        wx: Math.round(((sx - cx - view.offsetX) / (40 * view.zoom)) * gridScale),
        wz: Math.round(((sy - cy - view.offsetY) / (40 * view.zoom)) * gridScale),
      };
    },
    [canvasSize, view, gridScale]
  );

  // Render
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = canvasSize.width * window.devicePixelRatio;
    canvas.height = canvasSize.height * window.devicePixelRatio;
    canvas.style.width = `${canvasSize.width}px`;
    canvas.style.height = `${canvasSize.height}px`;
    ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

    const rc = rough.canvas(canvas);

    // Background — warm paper
    ctx.fillStyle = '#fffcf0';
    ctx.fillRect(0, 0, canvasSize.width, canvasSize.height);

    // Subtle paper texture dots
    ctx.fillStyle = 'rgba(180,160,120,0.04)';
    for (let px = 0; px < canvasSize.width; px += 6) {
      for (let py = 0; py < canvasSize.height; py += 6) {
        if ((px + py) % 18 === 0) {
          ctx.fillRect(px, py, 1, 1);
        }
      }
    }

    // Terrain overlay (drawn under the grid for subtle effect)
    if (terrainEnabled && data.world.seed) {
      const topLeft = screenToWorld(0, 0);
      const bottomRight = screenToWorld(canvasSize.width, canvasSize.height);
      // Adaptive resolution: coarser when zoomed out, finer when zoomed in
      const worldWidth = bottomRight.wx - topLeft.wx;
      const targetCells = 60;
      const rawStep = Math.abs(worldWidth) / targetCells;
      const resolution = Math.max(16, Math.pow(2, Math.round(Math.log2(rawStep))));
      const padding = resolution * 2;
      const terrain = generateTerrainGrid(
        topLeft.wx - padding,
        topLeft.wz - padding,
        bottomRight.wx + padding,
        bottomRight.wz + padding,
        resolution,
        data.world.seed,
        viewDimension,
        yLayerEnabled ? focusY : 63,
      );
      drawTerrainOverlay(
        ctx,
        terrain.cells,
        terrain.startX,
        terrain.startZ,
        terrain.step,
        worldToScreen,
        canvasSize.width,
        canvasSize.height,
      );
    }

    // Grid
    const gridSpacingPx = 40 * view.zoom;
    const ox = (view.offsetX % gridSpacingPx + canvasSize.width / 2 % gridSpacingPx) % gridSpacingPx;
    const oy = (view.offsetY % gridSpacingPx + canvasSize.height / 2 % gridSpacingPx) % gridSpacingPx;

    const majorEvery = 5;
    const colCount = Math.ceil(canvasSize.width / gridSpacingPx) + 2;
    const rowCount = Math.ceil(canvasSize.height / gridSpacingPx) + 2;

    for (let i = -1; i < colCount; i++) {
      const x = ox + i * gridSpacingPx;
      const worldCol = Math.round(((x - canvasSize.width / 2 - view.offsetX) / gridSpacingPx));
      const isMajor = worldCol % majorEvery === 0;

      rc.line(x, 0, x, canvasSize.height, {
        stroke: isMajor ? 'rgba(100,140,180,0.25)' : 'rgba(100,140,180,0.1)',
        strokeWidth: isMajor ? 0.8 : 0.4,
        roughness: 0.3,
        seed: i + 1000,
      });

      if (isMajor && gridSpacingPx > 15) {
        const { wx } = screenToWorld(x, 0);
        ctx.save();
        ctx.font = `9px ${FONT_FAMILY}`;
        ctx.fillStyle = 'rgba(100,140,180,0.6)';
        ctx.textAlign = 'center';
        ctx.fillText(`${wx}`, x, 12);
        ctx.restore();
      }
    }

    for (let i = -1; i < rowCount; i++) {
      const y = oy + i * gridSpacingPx;
      const worldRow = Math.round(((y - canvasSize.height / 2 - view.offsetY) / gridSpacingPx));
      const isMajor = worldRow % majorEvery === 0;

      rc.line(0, y, canvasSize.width, y, {
        stroke: isMajor ? 'rgba(100,140,180,0.25)' : 'rgba(100,140,180,0.1)',
        strokeWidth: isMajor ? 0.8 : 0.4,
        roughness: 0.3,
        seed: i + 2000,
      });

      if (isMajor && gridSpacingPx > 15) {
        const { wz } = screenToWorld(0, y);
        ctx.save();
        ctx.font = `9px ${FONT_FAMILY}`;
        ctx.fillStyle = 'rgba(100,140,180,0.6)';
        ctx.textAlign = 'left';
        ctx.fillText(`${wz}`, 4, y - 3);
        ctx.restore();
      }
    }

    // Origin crosshair
    const origin = worldToScreen(0, 0);
    rc.line(origin.sx - 12, origin.sy, origin.sx + 12, origin.sy, {
      stroke: 'rgba(200,50,50,0.4)', strokeWidth: 1, roughness: 0.5, seed: 9000,
    });
    rc.line(origin.sx, origin.sy - 12, origin.sx, origin.sy + 12, {
      stroke: 'rgba(200,50,50,0.4)', strokeWidth: 1, roughness: 0.5, seed: 9001,
    });
    ctx.save();
    ctx.font = `8px ${FONT_FAMILY}`;
    ctx.fillStyle = 'rgba(200,50,50,0.5)';
    ctx.textAlign = 'left';
    ctx.fillText('0,0', origin.sx + 4, origin.sy - 4);
    ctx.restore();

    // Tunnels
    data.tunnels.forEach((tunnel, ti) => {
      const fromLoc = data.locations.find((l) => l.id === tunnel.fromId);
      const toLoc = data.locations.find((l) => l.id === tunnel.toId);
      if (!fromLoc || !toLoc) return;

      if (yLayerEnabled) {
        const avgY = (fromLoc.y + toLoc.y) / 2;
        ctx.globalAlpha = yLayerAlpha(avgY, focusY);
      }

      const fc = getDisplayCoords(fromLoc, viewDimension);
      const tc = getDisplayCoords(toLoc, viewDimension);
      const fromScreen = worldToScreen(fc.x, fc.z);
      const toScreen = worldToScreen(tc.x, tc.z);

      drawTunnel(rc, ctx, fromScreen, toScreen, tunnel, tunnel.id === selectedTunnelId, ti * 100 + 5000);

      tunnel.obstacles.forEach((obs, oi) => {
        if (yLayerEnabled) ctx.globalAlpha = yLayerAlpha(obs.y, focusY);
        const oc = worldToScreen(obs.x, obs.z);
        drawObstacleMarker(rc, ctx, oc.sx, oc.sy, obs, ti * 100 + oi + 6000);
      });
      ctx.globalAlpha = 1;
    });

    // Locations
    data.locations.forEach((loc, li) => {
      if (yLayerEnabled) ctx.globalAlpha = yLayerAlpha(loc.y, focusY);
      const coords = getDisplayCoords(loc, viewDimension);
      const { sx, sy } = worldToScreen(coords.x, coords.z);
      drawLocationPin(rc, ctx, sx, sy, loc, loc.id === selectedLocationId, li * 10 + 3000);
      ctx.globalAlpha = 1;
    });

    // Portals
    data.portals.forEach((portal, pi) => {
      if (yLayerEnabled) ctx.globalAlpha = yLayerAlpha(portal.overworldY, focusY);
      drawPortalPair(rc, ctx, portal, viewDimension, worldToScreen, false, pi * 20 + 8000);
      ctx.globalAlpha = 1;
    });

    // Compass rose (top-right corner)
    drawCompassRose(rc, ctx, canvasSize.width - 50, 55, 70);

    // Legend (bottom-left)
    const legendHeight = terrainEnabled ? 370 : 163;
    drawLegend(ctx, rc, 10, canvasSize.height - legendHeight, terrainEnabled);

    // Dimension label
    ctx.save();
    ctx.font = `bold 14px ${FONT_FAMILY}`;
    ctx.fillStyle = viewDimension === 'nether' ? '#c0392b' : viewDimension === 'end' ? '#8e44ad' : '#2c3e50';
    ctx.textAlign = 'left';
    const dimLabel = viewDimension === 'nether' ? '⬛ NETHER' : viewDimension === 'end' ? '🟣 THE END' : '🌍 OVERWORLD';
    ctx.fillText(dimLabel, 14, 22);
    ctx.restore();

    // World name
    ctx.save();
    ctx.font = `bold 12px ${FONT_FAMILY}`;
    ctx.fillStyle = '#888';
    ctx.textAlign = 'right';
    ctx.fillText(data.world.name, canvasSize.width - 14, canvasSize.height - 10);
    ctx.restore();
  }, [data, viewDimension, selectedLocationId, selectedTunnelId, canvasSize, view, gridScale, worldToScreen, screenToWorld, yLayerEnabled, focusY, terrainEnabled]);

  // Mouse handlers
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    isDragging.current = true;
    dragStart.current = { x: e.clientX, y: e.clientY };
    lastMouse.current = { x: e.clientX, y: e.clientY };
  }, []);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    const canvas = canvasRef.current;
    if (canvas) {
      const rect = canvas.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;
      const { wx, wz } = screenToWorld(sx, sy);
      setCursorCoords({ x: wx, z: wz });
    }

    if (!isDragging.current) return;
    const dx = e.clientX - lastMouse.current.x;
    const dy = e.clientY - lastMouse.current.y;
    lastMouse.current = { x: e.clientX, y: e.clientY };
    setView((prev) => ({
      ...prev,
      offsetX: prev.offsetX + dx,
      offsetY: prev.offsetY + dy,
    }));
  }, [screenToWorld]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return;
    isDragging.current = false;

    const totalDrag =
      Math.abs(e.clientX - dragStart.current.x) +
      Math.abs(e.clientY - dragStart.current.y);

    if (totalDrag > 5) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    let hitLocation = false;
    for (const loc of data.locations) {
      const coords = getDisplayCoords(loc, viewDimension);
      const screen = worldToScreen(coords.x, coords.z);
      const dist = Math.sqrt((sx - screen.sx) ** 2 + (sy - screen.sy) ** 2);
      if (dist < 15) {
        onLocationClick(loc.id);
        hitLocation = true;
        break;
      }
    }

    if (!hitLocation) {
      const { wx, wz } = screenToWorld(sx, sy);
      onCanvasClick(wx, wz);
    }
  }, [data.locations, viewDimension, worldToScreen, screenToWorld, onLocationClick, onCanvasClick]);

  const handleMouseLeave = useCallback(() => {
    isDragging.current = false;
    setCursorCoords(null);
  }, []);

  return (
    <div
      ref={containerRef}
      style={{ flex: 1, position: 'relative', overflow: 'hidden', touchAction: 'none' }}
    >
      <canvas
        ref={canvasRef}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseLeave}
        style={{ display: 'block', width: '100%', height: '100%', cursor: 'crosshair' }}
      />
      {cursorCoords && (
        <div className="cursor-coords">
          X: {cursorCoords.x}  Z: {cursorCoords.z}
          {yLayerEnabled && <>  Y: {focusY}</>}
        </div>
      )}
      {yLayerEnabled && (
        <div className="y-layer-indicator">
          <div className="y-layer-label">Y Layer</div>
          <div className="y-layer-value">{focusY}</div>
          <div className="y-layer-range">
            ±{Y_LAYER_SIZE / 2} in focus
          </div>
        </div>
      )}
    </div>
  );
}
