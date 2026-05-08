// ==========================================
// cameras.ts — Baza modeli i konfiguracja sprzętu CCTV
// ==========================================

import type { ICameraModel } from './types';
import { API } from './api';
import { state } from './state';

export const DEFAULT_CAMERAS: Record<string, ICameraModel> = {
    'cam_2_8mm':  { name: 'Kopułka 2.8mm (Szeroka - 108°)',       fov: 108, range: 4000, dori: [400,  800,  1600, 4000], type: 'ceiling', isDefault: true },
    'cam_4_0mm':  { name: 'Tuba 4.0mm (Wąska - 84°)',             fov:  84, range: 5500, dori: [600, 1200, 2400, 5500], type: 'wall',    isDefault: true },
    'cam_fisheye':{ name: 'Fisheye 180° (Sufitowa)',               fov: 180, range: 2000, dori: [200,  400,  800,  2000], type: 'ceiling', isDefault: true },
    'cam_corridor':{ name: 'Korytarzowa (Tuba 6.0mm - 53°)',       fov:  53, range: 8000, dori: [900, 1800, 3200, 8000], type: 'wall',    isDefault: true },
};

// Asynchroniczne ładowanie bazy z "API" — aktualizuje state.cameraModels i state.favoriteCameras
export async function loadCameraDatabase(): Promise<void> {
    try {
        const customCameras = await API.getCustomCameras();
        state.cameraModels = { ...DEFAULT_CAMERAS, ...customCameras };
        state.favoriteCameras = await API.getFavoriteCameras();
    } catch (error) {
        console.error('Błąd połączenia z bazą kamer:', error);
    }
}
