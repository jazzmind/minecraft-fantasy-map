import { useState } from 'react';
import type {
  Location,
  PortalPair,
  Dimension,
  LocationType,
  ObstacleType,
  TunnelStatus,
} from '../types';
import { LOCATION_LABELS, LOCATION_COLORS, OBSTACLE_LABELS, OBSTACLE_COLORS, PORTAL_COLORS } from '../types';
import {
  distance2D, bearing, convertCoords, tunnelBlockCount,
  idealNetherCoords, portalLinkOffset, checkPortalConflicts,
} from '../utils/coordinates';
import type { WorldDataAPI } from '../hooks/useWorldData';
import { exportWorldData, importWorldData } from '../utils/storage';
import CoordInput from './CoordInput';

interface SidebarProps {
  api: WorldDataAPI;
  viewDimension: Dimension;
  setViewDimension: (d: Dimension) => void;
  selectedLocationId: string | null;
  setSelectedLocationId: (id: string | null) => void;
  selectedTunnelId: string | null;
  setSelectedTunnelId: (id: string | null) => void;
  clickedCoords: { x: number; z: number } | null;
  gridScale: number;
  setGridScale: (s: number) => void;
  yLayerEnabled: boolean;
  setYLayerEnabled: (v: boolean) => void;
  focusY: number;
  setFocusY: (v: number) => void;
  terrainEnabled: boolean;
  setTerrainEnabled: (v: boolean) => void;
}

type Tab = 'locations' | 'tunnels' | 'portals' | 'world';

const LOCATION_TYPES: LocationType[] = [
  'base', 'farm', 'portal', 'village', 'monument', 'stronghold', 'spawner', 'custom',
];
const OBSTACLE_TYPES: ObstacleType[] = [
  'water', 'lava', 'cavern', 'ravine', 'mineshaft', 'stronghold', 'custom',
];
const DIMENSIONS: Dimension[] = ['overworld', 'nether', 'end'];
const TUNNEL_STATUSES: TunnelStatus[] = ['planned', 'in-progress', 'complete'];

export default function Sidebar({
  api,
  viewDimension,
  setViewDimension,
  selectedLocationId,
  setSelectedLocationId,
  selectedTunnelId,
  setSelectedTunnelId,
  clickedCoords,
  gridScale,
  setGridScale,
  yLayerEnabled,
  setYLayerEnabled,
  focusY,
  setFocusY,
  terrainEnabled,
  setTerrainEnabled,
}: SidebarProps) {
  const { data } = api;
  const [tab, setTab] = useState<Tab>('locations');
  const [showAddLocation, setShowAddLocation] = useState(false);
  const [showAddTunnel, setShowAddTunnel] = useState(false);
  const [showAddObstacle, setShowAddObstacle] = useState<string | null>(null);
  const [editingLocationId, setEditingLocationId] = useState<string | null>(null);

  // Location form state
  const [locName, setLocName] = useState('');
  const [locX, setLocX] = useState(0);
  const [locY, setLocY] = useState(64);
  const [locZ, setLocZ] = useState(0);
  const [locType, setLocType] = useState<LocationType>('base');
  const [locDim, setLocDim] = useState<Dimension>('overworld');
  const [locNotes, setLocNotes] = useState('');

  // Tunnel form state
  const [tunnelFrom, setTunnelFrom] = useState('');
  const [tunnelTo, setTunnelTo] = useState('');
  const [tunnelDim, setTunnelDim] = useState<Dimension>('overworld');

  // Obstacle form state
  const [obsX, setObsX] = useState(0);
  const [obsY, setObsY] = useState(64);
  const [obsZ, setObsZ] = useState(0);
  const [obsType, setObsType] = useState<ObstacleType>('water');
  const [obsDesc, setObsDesc] = useState('');

  // Portal form state
  const [showAddPortal, setShowAddPortal] = useState(false);
  const [editingPortalId, setEditingPortalId] = useState<string | null>(null);
  const [selectedPortalId, setSelectedPortalId] = useState<string | null>(null);
  const [portalName, setPortalName] = useState('');
  const [portalOwX, setPortalOwX] = useState(0);
  const [portalOwY, setPortalOwY] = useState(64);
  const [portalOwZ, setPortalOwZ] = useState(0);
  const [portalHasNether, setPortalHasNether] = useState(false);
  const [portalNX, setPortalNX] = useState(0);
  const [portalNY, setPortalNY] = useState(64);
  const [portalNZ, setPortalNZ] = useState(0);
  const [portalLinked, setPortalLinked] = useState(false);
  const [portalNotes, setPortalNotes] = useState('');

  // World form
  const [worldName, setWorldName] = useState(data.world.name);
  const [worldSeed, setWorldSeed] = useState(data.world.seed);

  function resetLocationForm() {
    setLocName('');
    setLocX(clickedCoords?.x ?? 0);
    setLocY(64);
    setLocZ(clickedCoords?.z ?? 0);
    setLocType('base');
    setLocDim(viewDimension);
    setLocNotes('');
    setEditingLocationId(null);
  }

  function openAddLocation() {
    resetLocationForm();
    if (clickedCoords) {
      setLocX(clickedCoords.x);
      setLocZ(clickedCoords.z);
    }
    setLocDim(viewDimension);
    setShowAddLocation(true);
  }

  function openEditLocation(loc: Location) {
    setLocName(loc.name);
    setLocX(loc.x);
    setLocY(loc.y);
    setLocZ(loc.z);
    setLocType(loc.type);
    setLocDim(loc.dimension);
    setLocNotes(loc.notes);
    setEditingLocationId(loc.id);
    setShowAddLocation(true);
  }

  function saveLocation() {
    if (!locName.trim()) return;
    const locData = {
      name: locName.trim(),
      x: locX,
      y: locY,
      z: locZ,
      type: locType,
      color: LOCATION_COLORS[locType],
      dimension: locDim,
      notes: locNotes,
    };
    if (editingLocationId) {
      api.updateLocation(editingLocationId, locData);
    } else {
      const newLoc = api.addLocation(locData);
      setSelectedLocationId(newLoc.id);
    }
    setShowAddLocation(false);
    resetLocationForm();
  }

  function saveTunnel() {
    if (!tunnelFrom || !tunnelTo || tunnelFrom === tunnelTo) return;
    const newTunnel = api.addTunnel(tunnelFrom, tunnelTo, tunnelDim);
    setSelectedTunnelId(newTunnel.id);
    setShowAddTunnel(false);
  }

  function saveObstacle(tunnelId: string) {
    api.addObstacle(tunnelId, {
      x: obsX,
      y: obsY,
      z: obsZ,
      type: obsType,
      description: obsDesc,
    });
    setShowAddObstacle(null);
    setObsDesc('');
  }

  function handleImport() {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.json';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const imported = await importWorldData(file);
        api.replaceData(imported);
        setWorldName(imported.world.name);
        setWorldSeed(imported.world.seed);
      } catch (err) {
        alert('Failed to import: ' + (err as Error).message);
      }
    };
    input.click();
  }

  function resetPortalForm() {
    setPortalName('');
    setPortalOwX(clickedCoords?.x ?? 0);
    setPortalOwY(64);
    setPortalOwZ(clickedCoords?.z ?? 0);
    setPortalHasNether(false);
    setPortalNX(0);
    setPortalNY(64);
    setPortalNZ(0);
    setPortalLinked(false);
    setPortalNotes('');
    setEditingPortalId(null);
  }

  function openAddPortal() {
    resetPortalForm();
    if (clickedCoords) {
      setPortalOwX(clickedCoords.x);
      setPortalOwZ(clickedCoords.z);
      const ideal = idealNetherCoords(clickedCoords.x, clickedCoords.z);
      setPortalNX(ideal.x);
      setPortalNZ(ideal.z);
    }
    setShowAddPortal(true);
  }

  function openEditPortal(p: PortalPair) {
    setPortalName(p.name);
    setPortalOwX(p.overworldX);
    setPortalOwY(p.overworldY);
    setPortalOwZ(p.overworldZ);
    setPortalHasNether(p.netherX !== null);
    setPortalNX(p.netherX ?? Math.floor(p.overworldX / 8));
    setPortalNY(p.netherY ?? 64);
    setPortalNZ(p.netherZ ?? Math.floor(p.overworldZ / 8));
    setPortalLinked(p.linked);
    setPortalNotes(p.notes);
    setEditingPortalId(p.id);
    setShowAddPortal(true);
  }

  function savePortal() {
    if (!portalName.trim()) return;
    const colorIndex = editingPortalId
      ? data.portals.findIndex((p) => p.id === editingPortalId)
      : data.portals.length;
    const portalData: Omit<PortalPair, 'id'> = {
      name: portalName.trim(),
      overworldX: portalOwX,
      overworldY: portalOwY,
      overworldZ: portalOwZ,
      netherX: portalHasNether ? portalNX : null,
      netherY: portalHasNether ? portalNY : null,
      netherZ: portalHasNether ? portalNZ : null,
      color: PORTAL_COLORS[colorIndex % PORTAL_COLORS.length],
      notes: portalNotes,
      linked: portalLinked,
    };
    if (editingPortalId) {
      api.updatePortal(editingPortalId, portalData);
    } else {
      const newP = api.addPortal(portalData);
      setSelectedPortalId(newP.id);
    }
    setShowAddPortal(false);
    resetPortalForm();
  }

  function fillIdealNether() {
    const ideal = idealNetherCoords(portalOwX, portalOwZ);
    setPortalNX(ideal.x);
    setPortalNZ(ideal.z);
  }

  // Locations typed as 'portal' that don't already have a matching PortalPair
  const portalLocations = data.locations.filter((loc) => {
    if (loc.type !== 'portal') return false;
    const isNether = loc.dimension === 'nether';
    return !data.portals.some((p) => {
      if (p.name !== loc.name) return false;
      if (isNether) {
        return p.netherX === loc.x && p.netherZ === loc.z;
      }
      return p.overworldX === loc.x && p.overworldZ === loc.z;
    });
  });

  function convertLocationToPortal(loc: Location) {
    const colorIndex = data.portals.length;
    const isNether = loc.dimension === 'nether';
    api.addPortal({
      name: loc.name,
      overworldX: isNether ? loc.x * 8 : loc.x,
      overworldY: isNether ? 64 : loc.y,
      overworldZ: isNether ? loc.z * 8 : loc.z,
      netherX: isNether ? loc.x : null,
      netherY: isNether ? loc.y : null,
      netherZ: isNether ? loc.z : null,
      color: PORTAL_COLORS[colorIndex % PORTAL_COLORS.length],
      notes: loc.notes,
      linked: false,
    });
  }

  return (
    <div className="sidebar">
      <div className="sidebar-header">
        <h1>⛏ MC Tracker</h1>
        <div className="dimension-switcher">
          {DIMENSIONS.map((d) => (
            <button
              key={d}
              className={`dim-btn ${viewDimension === d ? 'active' : ''} dim-${d}`}
              onClick={() => setViewDimension(d)}
            >
              {d === 'overworld' ? '🌍' : d === 'nether' ? '🔥' : '🟣'} {d}
            </button>
          ))}
        </div>
      </div>

      <div className="tabs">
        <button className={tab === 'locations' ? 'active' : ''} onClick={() => setTab('locations')}>
          📍 Locations ({data.locations.length})
        </button>
        <button className={tab === 'tunnels' ? 'active' : ''} onClick={() => setTab('tunnels')}>
          🚇 Tunnels ({data.tunnels.length})
        </button>
        <button className={tab === 'portals' ? 'active' : ''} onClick={() => setTab('portals')}>
          🌀 Portals ({data.portals.length + portalLocations.length})
        </button>
        <button className={tab === 'world' ? 'active' : ''} onClick={() => setTab('world')}>
          🗺 World
        </button>
      </div>

      <div className="tab-content">
        {/* ============ LOCATIONS TAB ============ */}
        {tab === 'locations' && (
          <>
            <button className="btn-primary" onClick={openAddLocation}>
              + Add Location
            </button>

            {showAddLocation && (
              <div className="form-card">
                <h3>{editingLocationId ? 'Edit Location' : 'New Location'}</h3>
                <label>
                  Name
                  <input value={locName} onChange={(e) => setLocName(e.target.value)} placeholder="Main Base" />
                </label>
                <div className="form-row">
                  <label>
                    X
                    <CoordInput value={locX} onChange={setLocX} />
                  </label>
                  <label>
                    Y
                    <CoordInput value={locY} onChange={setLocY} />
                  </label>
                  <label>
                    Z
                    <CoordInput value={locZ} onChange={setLocZ} />
                  </label>
                </div>
                <div className="form-row">
                  <label>
                    Type
                    <select value={locType} onChange={(e) => setLocType(e.target.value as LocationType)}>
                      {LOCATION_TYPES.map((t) => (
                        <option key={t} value={t}>{LOCATION_LABELS[t]}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Dimension
                    <select value={locDim} onChange={(e) => setLocDim(e.target.value as Dimension)}>
                      {DIMENSIONS.map((d) => (
                        <option key={d} value={d}>{d}</option>
                      ))}
                    </select>
                  </label>
                </div>
                <label>
                  Notes
                  <textarea value={locNotes} onChange={(e) => setLocNotes(e.target.value)} rows={2} />
                </label>
                <div className="form-actions">
                  <button className="btn-primary" onClick={saveLocation}>
                    {editingLocationId ? 'Update' : 'Add'}
                  </button>
                  <button className="btn-secondary" onClick={() => { setShowAddLocation(false); resetLocationForm(); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="list">
              {data.locations.map((loc) => {
                const displayCoords = viewDimension !== loc.dimension
                  ? convertCoords(loc.x, loc.z, loc.dimension, viewDimension)
                  : null;
                return (
                  <div
                    key={loc.id}
                    className={`list-item ${selectedLocationId === loc.id ? 'selected' : ''}`}
                    onClick={() => setSelectedLocationId(loc.id === selectedLocationId ? null : loc.id)}
                  >
                    <div className="list-item-header">
                      <span className="color-dot" style={{ background: LOCATION_COLORS[loc.type] }} />
                      <strong>{loc.name}</strong>
                      <span className="type-badge">{LOCATION_LABELS[loc.type]}</span>
                    </div>
                    <div className="list-item-coords">
                      {loc.x}, {loc.y}, {loc.z}
                      <span className="dim-label">{loc.dimension}</span>
                      {displayCoords && (
                        <span className="converted-coords">
                          → {displayCoords.x}, {displayCoords.z} ({viewDimension})
                        </span>
                      )}
                    </div>
                    {loc.notes && <div className="list-item-notes">{loc.notes}</div>}
                    {selectedLocationId === loc.id && (
                      <div className="list-item-actions">
                        <button onClick={(e) => { e.stopPropagation(); openEditLocation(loc); }}>Edit</button>
                        <button className="btn-danger" onClick={(e) => { e.stopPropagation(); api.deleteLocation(loc.id); setSelectedLocationId(null); }}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {data.locations.length === 0 && (
                <p className="empty-state">No locations yet. Click the map or use the form to add one.</p>
              )}
            </div>
          </>
        )}

        {/* ============ TUNNELS TAB ============ */}
        {tab === 'tunnels' && (
          <>
            <button
              className="btn-primary"
              onClick={() => setShowAddTunnel(true)}
              disabled={data.locations.length < 2}
            >
              + Plan Tunnel
            </button>
            {data.locations.length < 2 && (
              <p className="hint">Add at least 2 locations to plan a tunnel.</p>
            )}

            {showAddTunnel && (
              <div className="form-card">
                <h3>Plan Tunnel</h3>
                <label>
                  From
                  <select value={tunnelFrom} onChange={(e) => setTunnelFrom(e.target.value)}>
                    <option value="">Select location...</option>
                    {data.locations.map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  To
                  <select value={tunnelTo} onChange={(e) => setTunnelTo(e.target.value)}>
                    <option value="">Select location...</option>
                    {data.locations.filter((l) => l.id !== tunnelFrom).map((l) => (
                      <option key={l.id} value={l.id}>{l.name}</option>
                    ))}
                  </select>
                </label>
                <label>
                  Dimension
                  <select value={tunnelDim} onChange={(e) => setTunnelDim(e.target.value as Dimension)}>
                    {DIMENSIONS.map((d) => (
                      <option key={d} value={d}>{d}</option>
                    ))}
                  </select>
                </label>
                {tunnelFrom && tunnelTo && (() => {
                  const from = data.locations.find((l) => l.id === tunnelFrom)!;
                  const to = data.locations.find((l) => l.id === tunnelTo)!;
                  const fc = convertCoords(from.x, from.z, from.dimension, tunnelDim);
                  const tc = convertCoords(to.x, to.z, to.dimension, tunnelDim);
                  const dist = Math.round(distance2D(fc.x, fc.z, tc.x, tc.z));
                  const dir = bearing(fc.x, fc.z, tc.x, tc.z);
                  const blocks = tunnelBlockCount(fc.x, from.y, fc.z, tc.x, to.y, tc.z);
                  return (
                    <div className="tunnel-preview">
                      <p>Distance: <strong>{dist} blocks</strong> ({dir})</p>
                      <p>Est. tunnel length: <strong>~{blocks} blocks</strong></p>
                    </div>
                  );
                })()}
                <div className="form-actions">
                  <button className="btn-primary" onClick={saveTunnel}>Create</button>
                  <button className="btn-secondary" onClick={() => setShowAddTunnel(false)}>Cancel</button>
                </div>
              </div>
            )}

            <div className="list">
              {data.tunnels.map((tunnel) => {
                const from = data.locations.find((l) => l.id === tunnel.fromId);
                const to = data.locations.find((l) => l.id === tunnel.toId);
                if (!from || !to) return null;
                const fc = convertCoords(from.x, from.z, from.dimension, tunnel.dimension);
                const tc = convertCoords(to.x, to.z, to.dimension, tunnel.dimension);
                const dist = Math.round(distance2D(fc.x, fc.z, tc.x, tc.z));
                const dir = bearing(fc.x, fc.z, tc.x, tc.z);
                const isSelected = selectedTunnelId === tunnel.id;
                return (
                  <div
                    key={tunnel.id}
                    className={`list-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedTunnelId(isSelected ? null : tunnel.id)}
                  >
                    <div className="list-item-header">
                      <span className={`status-dot status-${tunnel.status}`} />
                      <strong>{from.name} → {to.name}</strong>
                    </div>
                    <div className="list-item-coords">
                      {dist} blocks {dir} • {tunnel.dimension}
                      {tunnel.obstacles.length > 0 && (
                        <span className="obstacle-count"> • {tunnel.obstacles.length} obstacle(s)</span>
                      )}
                    </div>
                    {isSelected && (
                      <>
                        <div className="tunnel-detail">
                          <label>
                            Status
                            <select
                              value={tunnel.status}
                              onChange={(e) => api.updateTunnel(tunnel.id, { status: e.target.value as TunnelStatus })}
                              onClick={(e) => e.stopPropagation()}
                            >
                              {TUNNEL_STATUSES.map((s) => (
                                <option key={s} value={s}>{s}</option>
                              ))}
                            </select>
                          </label>
                        </div>

                        {/* Obstacles list */}
                        {tunnel.obstacles.length > 0 && (
                          <div className="obstacles-list">
                            <h4>Obstacles</h4>
                            {tunnel.obstacles.map((obs) => (
                              <div key={obs.id} className="obstacle-item">
                                <span className="obs-dot" style={{ background: OBSTACLE_COLORS[obs.type] }} />
                                <span className="obs-type">{OBSTACLE_LABELS[obs.type]}</span>
                                <span className="obs-coords">{obs.x}, {obs.y}, {obs.z}</span>
                                {obs.description && <span className="obs-desc">— {obs.description}</span>}
                                <button
                                  className="btn-x"
                                  onClick={(e) => { e.stopPropagation(); api.deleteObstacle(tunnel.id, obs.id); }}
                                >
                                  ×
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {showAddObstacle === tunnel.id ? (
                          <div className="form-card obstacle-form" onClick={(e) => e.stopPropagation()}>
                            <h4>Log Obstacle</h4>
                            <div className="form-row">
                              <label>
                                X
                                <CoordInput value={obsX} onChange={setObsX} />
                              </label>
                              <label>
                                Y
                                <CoordInput value={obsY} onChange={setObsY} />
                              </label>
                              <label>
                                Z
                                <CoordInput value={obsZ} onChange={setObsZ} />
                              </label>
                            </div>
                            <label>
                              Type
                              <select value={obsType} onChange={(e) => setObsType(e.target.value as ObstacleType)}>
                                {OBSTACLE_TYPES.map((t) => (
                                  <option key={t} value={t}>{OBSTACLE_LABELS[t]}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Description
                              <input value={obsDesc} onChange={(e) => setObsDesc(e.target.value)} placeholder="e.g. Large lava lake" />
                            </label>
                            <div className="form-actions">
                              <button className="btn-primary" onClick={() => saveObstacle(tunnel.id)}>Add</button>
                              <button className="btn-secondary" onClick={() => setShowAddObstacle(null)}>Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <button
                            className="btn-outline"
                            onClick={(e) => { e.stopPropagation(); setShowAddObstacle(tunnel.id); }}
                          >
                            + Log Obstacle
                          </button>
                        )}

                        <div className="list-item-actions">
                          <button
                            className="btn-danger"
                            onClick={(e) => { e.stopPropagation(); api.deleteTunnel(tunnel.id); setSelectedTunnelId(null); }}
                          >
                            Delete Tunnel
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                );
              })}
              {data.tunnels.length === 0 && (
                <p className="empty-state">No tunnels planned yet.</p>
              )}
            </div>
          </>
        )}

        {/* ============ PORTALS TAB ============ */}
        {tab === 'portals' && (
          <>
            <button className="btn-primary" onClick={openAddPortal}>
              + Add Portal
            </button>

            {showAddPortal && (
              <div className="form-card">
                <h3>{editingPortalId ? 'Edit Portal' : 'New Portal'}</h3>
                <label>
                  Name
                  <input value={portalName} onChange={(e) => setPortalName(e.target.value)} placeholder="Home Portal" />
                </label>

                <div className="portal-section-label">Overworld Side</div>
                <div className="form-row">
                  <label>
                    X
                    <CoordInput value={portalOwX} onChange={setPortalOwX} />
                  </label>
                  <label>
                    Y
                    <CoordInput value={portalOwY} onChange={setPortalOwY} />
                  </label>
                  <label>
                    Z
                    <CoordInput value={portalOwZ} onChange={setPortalOwZ} />
                  </label>
                </div>

                <div className="portal-ideal">
                  Ideal Nether coords: <strong>{Math.floor(portalOwX / 8)}, {Math.floor(portalOwZ / 8)}</strong>
                </div>

                <label className="portal-checkbox">
                  <input
                    type="checkbox"
                    checked={portalHasNether}
                    onChange={(e) => {
                      setPortalHasNether(e.target.checked);
                      if (e.target.checked) fillIdealNether();
                    }}
                  />
                  Nether side built
                </label>

                {portalHasNether && (
                  <>
                    <div className="portal-section-label">
                      Nether Side
                      <button className="btn-fill-ideal" onClick={fillIdealNether}>
                        Fill ideal coords
                      </button>
                    </div>
                    <div className="form-row">
                      <label>
                        X
                        <CoordInput value={portalNX} onChange={setPortalNX} />
                      </label>
                      <label>
                        Y
                        <CoordInput value={portalNY} onChange={setPortalNY} />
                      </label>
                      <label>
                        Z
                        <CoordInput value={portalNZ} onChange={setPortalNZ} />
                      </label>
                    </div>

                    {(() => {
                      const ideal = idealNetherCoords(portalOwX, portalOwZ);
                      const offset = Math.round(distance2D(portalNX, portalNZ, ideal.x, ideal.z));
                      if (offset > 0) {
                        return (
                          <div className={`portal-offset ${offset > 16 ? 'warning' : ''}`}>
                            {offset} blocks from ideal position
                            {offset > 16 && ' ⚠ May not link correctly!'}
                          </div>
                        );
                      }
                      return <div className="portal-offset ok">Perfectly aligned</div>;
                    })()}

                    <label className="portal-checkbox">
                      <input
                        type="checkbox"
                        checked={portalLinked}
                        onChange={(e) => setPortalLinked(e.target.checked)}
                      />
                      Confirmed linked in-game
                    </label>
                  </>
                )}

                <label>
                  Notes
                  <textarea value={portalNotes} onChange={(e) => setPortalNotes(e.target.value)} rows={2} />
                </label>
                <div className="form-actions">
                  <button className="btn-primary" onClick={savePortal}>
                    {editingPortalId ? 'Update' : 'Add'}
                  </button>
                  <button className="btn-secondary" onClick={() => { setShowAddPortal(false); resetPortalForm(); }}>
                    Cancel
                  </button>
                </div>
              </div>
            )}

            <div className="list">
              {data.portals.map((portal) => {
                const ideal = idealNetherCoords(portal.overworldX, portal.overworldZ);
                const offset = portalLinkOffset(portal);
                const conflicts = checkPortalConflicts(data.portals, portal.id);
                const isSelected = selectedPortalId === portal.id;
                return (
                  <div
                    key={portal.id}
                    className={`list-item ${isSelected ? 'selected' : ''}`}
                    onClick={() => setSelectedPortalId(isSelected ? null : portal.id)}
                  >
                    <div className="list-item-header">
                      <span className="color-dot" style={{ background: portal.color }} />
                      <strong>{portal.name}</strong>
                      {portal.linked && <span className="type-badge portal-linked">LINKED</span>}
                      {!portal.linked && portal.netherX !== null && <span className="type-badge portal-built">BUILT</span>}
                      {portal.netherX === null && <span className="type-badge portal-planned">OW ONLY</span>}
                    </div>
                    <div className="list-item-coords">
                      OW: {portal.overworldX}, {portal.overworldY}, {portal.overworldZ}
                    </div>
                    {portal.netherX !== null && (
                      <div className="list-item-coords">
                        Nether: {portal.netherX}, {portal.netherY}, {portal.netherZ}
                        {offset !== null && offset > 0 && (
                          <span className={offset > 16 ? 'portal-warn-text' : 'portal-ok-text'}>
                            {' '}({Math.round(offset)}b off ideal)
                          </span>
                        )}
                      </div>
                    )}
                    {portal.netherX === null && (
                      <div className="list-item-coords portal-ideal-hint">
                        Ideal Nether: {ideal.x}, {ideal.z}
                      </div>
                    )}
                    {conflicts.length > 0 && (
                      <div className="portal-conflict-warn">
                        ⚠ Too close to: {conflicts.map((c) => `${c.conflictsWith} (${c.distance}b)`).join(', ')}
                      </div>
                    )}
                    {portal.notes && <div className="list-item-notes">{portal.notes}</div>}
                    {isSelected && (
                      <div className="list-item-actions">
                        <button onClick={(e) => { e.stopPropagation(); openEditPortal(portal); }}>Edit</button>
                        <button className="btn-danger" onClick={(e) => { e.stopPropagation(); api.deletePortal(portal.id); setSelectedPortalId(null); }}>
                          Delete
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
              {portalLocations.length > 0 && (
                <>
                  <div className="portal-locations-divider">
                    From Locations ({portalLocations.length})
                  </div>
                  {portalLocations.map((loc) => {
                    const isNether = loc.dimension === 'nether';
                    const owX = isNether ? loc.x * 8 : loc.x;
                    const owZ = isNether ? loc.z * 8 : loc.z;
                    const ideal = idealNetherCoords(owX, owZ);
                    return (
                      <div key={`loc-${loc.id}`} className="list-item portal-from-location">
                        <div className="list-item-header">
                          <span className="color-dot" style={{ background: LOCATION_COLORS.portal }} />
                          <strong>{loc.name}</strong>
                          <span className="type-badge portal-planned">LOCATION</span>
                        </div>
                        <div className="list-item-coords">
                          {isNether ? 'Nether' : 'OW'}: {loc.x}, {loc.y}, {loc.z}
                          <span className="dim-label">{loc.dimension}</span>
                        </div>
                        {isNether ? (
                          <div className="list-item-coords portal-ideal-hint">
                            Overworld equiv: {owX}, {owZ}
                          </div>
                        ) : (
                          <div className="list-item-coords portal-ideal-hint">
                            Ideal Nether: {ideal.x}, {ideal.z}
                          </div>
                        )}
                        {loc.notes && <div className="list-item-notes">{loc.notes}</div>}
                        <div className="list-item-actions">
                          <button
                            className="btn-primary btn-sm"
                            onClick={(e) => { e.stopPropagation(); convertLocationToPortal(loc); }}
                          >
                            + Track as Portal Pair
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </>
              )}
              {data.portals.length === 0 && portalLocations.length === 0 && (
                <p className="empty-state">No portals tracked yet. Add your first portal pair.</p>
              )}
            </div>
          </>
        )}

        {/* ============ WORLD TAB ============ */}
        {tab === 'world' && (
          <div className="world-settings">
            <div className="form-card">
              <h3>World Info</h3>
              <label>
                World Name
                <input
                  value={worldName}
                  onChange={(e) => setWorldName(e.target.value)}
                  onBlur={() => api.setWorldInfo(worldName, worldSeed)}
                />
              </label>
              <label>
                Seed (optional)
                <input
                  value={worldSeed}
                  onChange={(e) => setWorldSeed(e.target.value)}
                  onBlur={() => api.setWorldInfo(worldName, worldSeed)}
                  placeholder="World seed"
                />
              </label>
              <label className="portal-checkbox">
                <input
                  type="checkbox"
                  checked={terrainEnabled}
                  onChange={(e) => setTerrainEnabled(e.target.checked)}
                  disabled={!worldSeed.trim()}
                />
                Show terrain overlay
              </label>
              {terrainEnabled && !worldSeed.trim() && (
                <p className="hint">Enter a seed above to enable terrain.</p>
              )}
              {terrainEnabled && worldSeed.trim() && (
                <p className="hint">
                  Approximate terrain based on seed. Hand-drawn style — not exact.
                </p>
              )}
            </div>

            <div className="form-card">
              <h3>Map Settings</h3>
              <label>
                Grid Scale (blocks per grid square)
                <input
                  type="number"
                  value={gridScale}
                  min={1}
                  max={256}
                  onChange={(e) => setGridScale(Number(e.target.value) || 16)}
                />
              </label>
            </div>

            <div className="form-card">
              <h3>Y-Level Layers</h3>
              <label className="portal-checkbox">
                <input
                  type="checkbox"
                  checked={yLayerEnabled}
                  onChange={(e) => setYLayerEnabled(e.target.checked)}
                />
                Enable onion skin layers
              </label>
              {yLayerEnabled && (
                <>
                  <label>
                    Focus Y level
                    <input
                      type="range"
                      min={-64}
                      max={320}
                      step={1}
                      value={focusY}
                      onChange={(e) => setFocusY(Number(e.target.value))}
                    />
                    <div className="y-range-labels">
                      <span>{focusY}</span>
                    </div>
                  </label>
                  <div className="y-presets">
                    {[
                      { label: 'Bedrock', y: -60 },
                      { label: 'Diamonds', y: -16 },
                      { label: 'Sea Level', y: 62 },
                      { label: 'Surface', y: 72 },
                      { label: 'Clouds', y: 192 },
                    ].map((preset) => (
                      <button
                        key={preset.label}
                        className={`btn-outline btn-sm ${focusY === preset.y ? 'active' : ''}`}
                        onClick={() => setFocusY(preset.y)}
                      >
                        {preset.label} ({preset.y})
                      </button>
                    ))}
                  </div>
                  <p className="hint" style={{ marginTop: 8 }}>
                    Items within ±16 of Y={focusY} are fully visible. 
                    Farther items fade out.
                  </p>
                </>
              )}
            </div>

            <div className="form-card">
              <h3>Import / Export</h3>
              <div className="form-actions">
                <button className="btn-primary" onClick={() => exportWorldData(data)}>
                  Export JSON
                </button>
                <button className="btn-secondary" onClick={handleImport}>
                  Import JSON
                </button>
              </div>
            </div>

            <div className="form-card stats">
              <h3>Stats</h3>
              <p>{data.locations.length} location(s)</p>
              <p>{data.tunnels.length} tunnel(s)</p>
              <p>{data.portals.length} portal pair(s)</p>
              <p>{data.tunnels.reduce((sum, t) => sum + t.obstacles.length, 0)} obstacle(s) logged</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
