// ==========================================
// api.ts — Warstwa abstrakcji komunikacji z bazą (Cloud-Ready)
// ==========================================

import type { ICameraModel } from './types';

export const API = {
    // Symulujemy opóźnienie sieciowe (np. 300ms) jak przy prawdziwym fetch()
    async getCustomCameras(): Promise<Record<string, ICameraModel>> {
        return new Promise(resolve => {
            setTimeout(() => {
                const raw = localStorage.getItem('cctv_custom_cameras');
                const data: Record<string, ICameraModel> = raw ? JSON.parse(raw) : {};
                resolve(data);
            }, 300);
        });
    },

    async saveCustomCamera(id: string, cameraData: ICameraModel): Promise<{ success: boolean; id: string }> {
        return new Promise(resolve => {
            setTimeout(() => {
                const raw = localStorage.getItem('cctv_custom_cameras');
                const data: Record<string, ICameraModel> = raw ? JSON.parse(raw) : {};
                data[id] = cameraData;
                localStorage.setItem('cctv_custom_cameras', JSON.stringify(data));
                resolve({ success: true, id });
            }, 300);
        });
    },

    async deleteCustomCamera(id: string): Promise<{ success: boolean }> {
        return new Promise(resolve => {
            setTimeout(() => {
                const raw = localStorage.getItem('cctv_custom_cameras');
                const data: Record<string, ICameraModel> = raw ? JSON.parse(raw) : {};
                delete data[id];
                localStorage.setItem('cctv_custom_cameras', JSON.stringify(data));
                resolve({ success: true });
            }, 300);
        });
    },

    // --- ULUBIONE KAMERY ---
    async getFavoriteCameras(): Promise<string[]> {
        return new Promise(resolve => {
            setTimeout(() => {
                const raw = localStorage.getItem('cctv_favorite_cameras');
                const data: string[] = raw ? JSON.parse(raw) : [];
                resolve(data);
            }, 100);
        });
    },

    async toggleFavoriteCamera(id: string): Promise<string[]> {
        return new Promise(resolve => {
            setTimeout(() => {
                const raw = localStorage.getItem('cctv_favorite_cameras');
                let data: string[] = raw ? JSON.parse(raw) : [];
                if (data.includes(id)) {
                    data = data.filter(favId => favId !== id);
                } else {
                    data.push(id);
                }
                localStorage.setItem('cctv_favorite_cameras', JSON.stringify(data));
                resolve(data);
            }, 100);
        });
    },

    // --- PODKŁADY MAPOWE ---
    async uploadProjectBackground(base64Image: string): Promise<{ success: boolean; url: string }> {
        return new Promise(resolve => {
            setTimeout(() => {
                localStorage.setItem('cctv_project_bg', base64Image);
                resolve({ success: true, url: 'local_mock_url' });
            }, 500);
        });
    },

    async getProjectBackground(): Promise<string | null> {
        return new Promise(resolve => {
            setTimeout(() => {
                const data = localStorage.getItem('cctv_project_bg');
                resolve(data);
            }, 200);
        });
    },
};
