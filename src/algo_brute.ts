// ==========================================
// algo_brute.ts — Deterministyczny algorytm Brute Force (Greedy Grid)
// ==========================================

import type { ICamera } from './types';
import { state, isPointInside, calculateCoverage, saveToLocalStorage } from './state';
import { draw } from './render';

export function runBruteForceOptimization(cameraCount: number): void {
    if (state.walls.length === 0) {
        alert('Najpierw narysuj pomieszczenie!');
        return;
    }

    console.log('Uruchamiam deterministyczny algorytm Brute Force...');
    const btnOptimize = document.getElementById('btn-optimize');
    if (btnOptimize) btnOptimize.innerText = '⏳ Obliczam...';

    setTimeout(() => {
        const startTime = performance.now();
        const activeModel = state.cameraModels[state.selectedCameraModel];

        // 1. Generujemy siatkę punktów montażowych wzdłuż ścian
        const mountingPoints: { x: number; y: number }[] = [];
        const step = 60; // Optymalizacja: sprawdzamy potencjalne miejsce rzadziej (np. co 60 pikseli zamiast 30)

        for (const w of state.walls) {
            const len = Math.hypot(w.x2 - w.x1, w.y2 - w.y1);
            const dx  = (w.x2 - w.x1) / len;
            const dy  = (w.y2 - w.y1) / len;
            const nx1 = -dy, ny1 = dx;
            const nx2 =  dy, ny2 = -dx;

            for (let d = 0; d <= len; d += step) {
                const baseX = w.x1 + dx * d;
                const baseY = w.y1 + dy * d;
                const testPt1 = { x: baseX + nx1 * 5, y: baseY + ny1 * 5 };
                const testPt2 = { x: baseX + nx2 * 5, y: baseY + ny2 * 5 };

                if (isPointInside(testPt1.x, testPt1.y)) {
                    mountingPoints.push({ x: testPt1.x, y: testPt1.y });
                } else if (isPointInside(testPt2.x, testPt2.y)) {
                    mountingPoints.push({ x: testPt2.x, y: testPt2.y });
                }
            }
        }

        state.placedCameras = [];

        // 2. Zachłanny Brute Force — ustawiamy kamery jedna po drugiej
        for (let i = 0; i < cameraCount; i++) {
            let bestScore = -1;
            let bestCam: ICamera | null = null;

            for (const pt of mountingPoints) {
                // Optymalizacja: co 30 stopni zamiast co 15
                for (let angle = 0; angle < 360; angle += 30) {
                    const testCam: ICamera = {
                        x:    pt.x,
                        y:    pt.y,
                        angle,
                        fov:   activeModel.fov,
                        range: activeModel.range,
                        dori:  activeModel.dori,
                        type:  activeModel.type,
                    };
                    state.placedCameras.push(testCam);
                    const result = calculateCoverage();
                    state.placedCameras.pop();

                    if (result.score > bestScore) {
                        bestScore = result.score;
                        bestCam   = testCam;
                    }
                }
            }

            if (bestCam) state.placedCameras.push(bestCam);
        }

        const endTime = performance.now();
        console.log(`Brute Force zakończony w ${(endTime - startTime).toFixed(2)}ms.`);

        draw();
        saveToLocalStorage();
        if (btnOptimize) btnOptimize.innerText = '✨ Optymalizuj Rozstawienie';
    }, 50);
}
