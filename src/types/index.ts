export type LocationType =
  | 'base'
  | 'farm'
  | 'portal'
  | 'village'
  | 'monument'
  | 'stronghold'
  | 'spawner'
  | 'custom';

export type ObstacleType =
  | 'water'
  | 'lava'
  | 'cavern'
  | 'ravine'
  | 'mineshaft'
  | 'stronghold'
  | 'custom';

export type TunnelStatus = 'planned' | 'in-progress' | 'complete';

export type Dimension = 'overworld' | 'nether' | 'end';

export interface Location {
  id: string;
  name: string;
  x: number;
  y: number;
  z: number;
  type: LocationType;
  color: string;
  notes: string;
  dimension: Dimension;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  z: number;
  type: ObstacleType;
  description: string;
}

export interface Tunnel {
  id: string;
  fromId: string;
  toId: string;
  dimension: Dimension;
  status: TunnelStatus;
  obstacles: Obstacle[];
}

export interface PortalPair {
  id: string;
  name: string;
  overworldX: number;
  overworldY: number;
  overworldZ: number;
  netherX: number | null;
  netherY: number | null;
  netherZ: number | null;
  color: string;
  notes: string;
  linked: boolean;
}

export interface WorldData {
  world: {
    name: string;
    seed: string;
  };
  locations: Location[];
  tunnels: Tunnel[];
  portals: PortalPair[];
}

export const LOCATION_COLORS: Record<LocationType, string> = {
  base: '#4a9a5b',
  farm: '#c4a132',
  portal: '#9b59b6',
  village: '#e67e22',
  monument: '#2980b9',
  stronghold: '#7f8c8d',
  spawner: '#c0392b',
  custom: '#1abc9c',
};

export const OBSTACLE_COLORS: Record<ObstacleType, string> = {
  water: '#3498db',
  lava: '#e74c3c',
  cavern: '#555555',
  ravine: '#2c3e50',
  mineshaft: '#8b6914',
  stronghold: '#7f8c8d',
  custom: '#95a5a6',
};

export const LOCATION_LABELS: Record<LocationType, string> = {
  base: 'Base',
  farm: 'Farm',
  portal: 'Portal',
  village: 'Village',
  monument: 'Monument',
  stronghold: 'Stronghold',
  spawner: 'Spawner',
  custom: 'Custom',
};

export const PORTAL_COLORS = [
  '#9b59b6', '#8e44ad', '#c39bd3', '#a569bd',
  '#7d3c98', '#d7bde2', '#bb8fce', '#6c3483',
];

export const OBSTACLE_LABELS: Record<ObstacleType, string> = {
  water: 'Water',
  lava: 'Lava',
  cavern: 'Cavern',
  ravine: 'Ravine',
  mineshaft: 'Mineshaft',
  stronghold: 'Stronghold',
  custom: 'Custom',
};
