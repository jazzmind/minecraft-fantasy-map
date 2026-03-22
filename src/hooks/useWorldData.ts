import { useState, useCallback, useEffect } from 'react';
import { v4 as uuidv4 } from 'uuid';
import type {
  WorldData,
  Location,
  Tunnel,
  Obstacle,
  Dimension,
  ObstacleType,
  PortalPair,
} from '../types';
import { loadWorldData, saveWorldData } from '../utils/storage';

export function useWorldData() {
  const [data, setData] = useState<WorldData>(loadWorldData);

  useEffect(() => {
    saveWorldData(data);
  }, [data]);

  const setWorldInfo = useCallback((name: string, seed: string) => {
    setData((prev) => ({ ...prev, world: { name, seed } }));
  }, []);

  const addLocation = useCallback(
    (loc: Omit<Location, 'id'>) => {
      const newLoc: Location = { ...loc, id: uuidv4() };
      setData((prev) => ({ ...prev, locations: [...prev.locations, newLoc] }));
      return newLoc;
    },
    []
  );

  const updateLocation = useCallback((id: string, updates: Partial<Omit<Location, 'id'>>) => {
    setData((prev) => ({
      ...prev,
      locations: prev.locations.map((l) => (l.id === id ? { ...l, ...updates } : l)),
    }));
  }, []);

  const deleteLocation = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      locations: prev.locations.filter((l) => l.id !== id),
      tunnels: prev.tunnels.filter((t) => t.fromId !== id && t.toId !== id),
    }));
  }, []);

  const addTunnel = useCallback(
    (fromId: string, toId: string, dimension: Dimension) => {
      const newTunnel: Tunnel = {
        id: uuidv4(),
        fromId,
        toId,
        dimension,
        status: 'planned',
        obstacles: [],
      };
      setData((prev) => ({ ...prev, tunnels: [...prev.tunnels, newTunnel] }));
      return newTunnel;
    },
    []
  );

  const updateTunnel = useCallback(
    (id: string, updates: Partial<Pick<Tunnel, 'status' | 'dimension'>>) => {
      setData((prev) => ({
        ...prev,
        tunnels: prev.tunnels.map((t) => (t.id === id ? { ...t, ...updates } : t)),
      }));
    },
    []
  );

  const deleteTunnel = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      tunnels: prev.tunnels.filter((t) => t.id !== id),
    }));
  }, []);

  const addObstacle = useCallback(
    (
      tunnelId: string,
      obstacle: { x: number; y: number; z: number; type: ObstacleType; description: string }
    ) => {
      const newObstacle: Obstacle = { ...obstacle, id: uuidv4() };
      setData((prev) => ({
        ...prev,
        tunnels: prev.tunnels.map((t) =>
          t.id === tunnelId ? { ...t, obstacles: [...t.obstacles, newObstacle] } : t
        ),
      }));
      return newObstacle;
    },
    []
  );

  const deleteObstacle = useCallback((tunnelId: string, obstacleId: string) => {
    setData((prev) => ({
      ...prev,
      tunnels: prev.tunnels.map((t) =>
        t.id === tunnelId
          ? { ...t, obstacles: t.obstacles.filter((o) => o.id !== obstacleId) }
          : t
      ),
    }));
  }, []);

  const addPortal = useCallback(
    (portal: Omit<PortalPair, 'id'>) => {
      const newPortal: PortalPair = { ...portal, id: uuidv4() };
      setData((prev) => ({ ...prev, portals: [...prev.portals, newPortal] }));
      return newPortal;
    },
    []
  );

  const updatePortal = useCallback((id: string, updates: Partial<Omit<PortalPair, 'id'>>) => {
    setData((prev) => ({
      ...prev,
      portals: prev.portals.map((p) => (p.id === id ? { ...p, ...updates } : p)),
    }));
  }, []);

  const deletePortal = useCallback((id: string) => {
    setData((prev) => ({
      ...prev,
      portals: prev.portals.filter((p) => p.id !== id),
    }));
  }, []);

  const replaceData = useCallback((newData: WorldData) => {
    setData(newData);
  }, []);

  return {
    data,
    setWorldInfo,
    addLocation,
    updateLocation,
    deleteLocation,
    addTunnel,
    updateTunnel,
    deleteTunnel,
    addObstacle,
    deleteObstacle,
    addPortal,
    updatePortal,
    deletePortal,
    replaceData,
  };
}

export type WorldDataAPI = ReturnType<typeof useWorldData>;
