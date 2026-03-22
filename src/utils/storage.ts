import type { WorldData } from '../types';

const STORAGE_KEY = 'minecraft-tracker-data';

export function getDefaultWorldData(): WorldData {
  return {
    world: { name: 'My World', seed: '' },
    locations: [],
    tunnels: [],
    portals: [],
  };
}

export function loadWorldData(): WorldData {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return getDefaultWorldData();
    const parsed = JSON.parse(raw) as WorldData;
    if (!parsed.locations) parsed.locations = [];
    if (!parsed.tunnels) parsed.tunnels = [];
    if (!parsed.portals) parsed.portals = [];
    if (!parsed.world) parsed.world = { name: 'My World', seed: '' };
    return parsed;
  } catch {
    return getDefaultWorldData();
  }
}

export function saveWorldData(data: WorldData): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function exportWorldData(data: WorldData): void {
  const json = JSON.stringify(data, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${data.world.name.replace(/\s+/g, '_')}_tracker.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function importWorldData(file: File): Promise<WorldData> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const data = JSON.parse(reader.result as string) as WorldData;
        if (!data.locations || !data.tunnels || !data.world) {
          reject(new Error('Invalid file format'));
          return;
        }
        resolve(data);
      } catch {
        reject(new Error('Failed to parse JSON'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
