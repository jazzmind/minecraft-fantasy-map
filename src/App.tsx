import { useState, useCallback, useMemo } from 'react';
import MapCanvas from './components/MapCanvas';
import Sidebar from './components/Sidebar';
import { useWorldData } from './hooks/useWorldData';
import { getDisplayCoords } from './utils/coordinates';
import type { Dimension } from './types';
import './App.css';

function App() {
  const api = useWorldData();
  const [viewDimension, setViewDimension] = useState<Dimension>('overworld');
  const [selectedLocationId, setSelectedLocationId] = useState<string | null>(null);
  const [selectedTunnelId, setSelectedTunnelId] = useState<string | null>(null);
  const [clickedCoords, setClickedCoords] = useState<{ x: number; z: number } | null>(null);
  const [gridScale, setGridScale] = useState(16);
  const [centerCounter, setCenterCounter] = useState(0);
  const [yLayerEnabled, setYLayerEnabled] = useState(false);
  const [focusY, setFocusY] = useState(64);
  const [terrainEnabled, setTerrainEnabled] = useState(false);

  const centerOn = useMemo(() => {
    if (!selectedLocationId) return null;
    const loc = api.data.locations.find((l) => l.id === selectedLocationId);
    if (!loc) return null;
    const coords = getDisplayCoords(loc, viewDimension);
    // Include counter so re-selecting the same location still triggers centering
    return { x: coords.x, z: coords.z, _key: centerCounter };
  }, [selectedLocationId, centerCounter, api.data.locations, viewDimension]);

  const handleCanvasClick = useCallback((worldX: number, worldZ: number) => {
    setClickedCoords({ x: worldX, z: worldZ });
    setSelectedLocationId(null);
  }, []);

  const handleLocationClick = useCallback((id: string) => {
    setSelectedLocationId((prev) => (prev === id ? null : id));
    setSelectedTunnelId(null);
    setCenterCounter((c) => c + 1);
  }, []);

  const handleSidebarSelectLocation = useCallback((id: string | null) => {
    setSelectedLocationId(id);
    if (id) setCenterCounter((c) => c + 1);
  }, []);

  return (
    <div className="app">
      <Sidebar
        api={api}
        viewDimension={viewDimension}
        setViewDimension={setViewDimension}
        selectedLocationId={selectedLocationId}
        setSelectedLocationId={handleSidebarSelectLocation}
        selectedTunnelId={selectedTunnelId}
        setSelectedTunnelId={setSelectedTunnelId}
        clickedCoords={clickedCoords}
        gridScale={gridScale}
        setGridScale={setGridScale}
        yLayerEnabled={yLayerEnabled}
        setYLayerEnabled={setYLayerEnabled}
        focusY={focusY}
        setFocusY={setFocusY}
        terrainEnabled={terrainEnabled}
        setTerrainEnabled={setTerrainEnabled}
      />
      <MapCanvas
        data={api.data}
        viewDimension={viewDimension}
        selectedLocationId={selectedLocationId}
        selectedTunnelId={selectedTunnelId}
        onLocationClick={handleLocationClick}
        onCanvasClick={handleCanvasClick}
        gridScale={gridScale}
        centerOn={centerOn}
        yLayerEnabled={yLayerEnabled}
        focusY={focusY}
        terrainEnabled={terrainEnabled}
      />
    </div>
  );
}

export default App;
