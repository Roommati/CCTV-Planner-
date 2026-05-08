// ==========================================
// algo_heuristic.ts — Algorytm "Roju" (Simulated Annealing)
// ==========================================

import type { ICamera } from './types';
import { state, calculateCoverage, saveToLocalStorage } from './state';
import { draw } from './render';

// Odsuwa kamerę od najbliższej ściany o 5px (Epsilon Offset) do wnętrza pokoju
export function snapToNearestWall(cam: ICamera): void {
    if (state.walls.length === 0) return;
    let minDist = Infinity;
    let bestPt  = { x: cam.x, y: cam.y };
    let bestNormalAngle = cam.angle;
    let normalDx = 0, normalDy = 0;

    const minX = Math.min(...state.walls.map(w => Math.min(w.x1, w.x2)));
    const maxX = Math.max(...state.walls.map(w => Math.max(w.x1, w.x2)));
    const minY = Math.min(...state.walls.map(w => Math.min(w.y1, w.y2)));
    const maxY = Math.max(...state.walls.map(w => Math.max(w.y1, w.y2)));
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;

    for (const w of state.walls) {
        const l2 = Math.pow(w.x2 - w.x1, 2) + Math.pow(w.y2 - w.y1, 2);
        let t = 0;
        if (l2 !== 0) {
            t = Math.max(0, Math.min(1, ((cam.x - w.x1) * (w.x2 - w.x1) + (cam.y - w.y1) * (w.y2 - w.y1)) / l2));
        }
        const ptX = w.x1 + t * (w.x2 - w.x1);
        const ptY = w.y1 + t * (w.y2 - w.y1);
        const dist = Math.hypot(cam.x - ptX, cam.y - ptY);

        if (dist < minDist) {
            minDist = dist;
            bestPt  = { x: ptX, y: ptY };

            let nx = -(w.y2 - w.y1);
            let ny =  (w.x2 - w.x1);
            const len = Math.hypot(nx, ny);
            nx /= len; ny /= len;

            const dot = (centerX - ptX) * nx + (centerY - ptY) * ny;
            if (dot < 0) { nx = -nx; ny = -ny; }
            normalDx = nx; normalDy = ny;

            const wallAngle  = Math.atan2(w.y2 - w.y1, w.x2 - w.x1) * 180 / Math.PI;
            const normal1    = wallAngle + 90, normal2 = wallAngle - 90;
            const angleToCenter = Math.atan2(centerY - ptY, centerX - ptX) * 180 / Math.PI;
            const diff1 = Math.abs((normal1 - angleToCenter + 540) % 360 - 180);
            const diff2 = Math.abs((normal2 - angleToCenter + 540) % 360 - 180);
            bestNormalAngle = diff1 < diff2 ? normal1 : normal2;
        }
    }

    cam.x = bestPt.x + normalDx * 5;
    cam.y = bestPt.y + normalDy * 5;

    const diff = Math.abs((cam.angle - bestNormalAngle + 540) % 360 - 180);
    if (diff > 80) cam.angle = bestNormalAngle + (Math.random() - 0.5) * 45;
}

// --- SYSTEM KAR ---
function evaluateFitness(): number {
    let score   = calculateCoverage().score;
    let penalty = 0;

    for (let i = 0; i < state.placedCameras.length; i++) {
        for (let j = i + 1; j < state.placedCameras.length; j++) {
            const dist = Math.hypot(
                state.placedCameras[i].x - state.placedCameras[j].x,
                state.placedCameras[i].y - state.placedCameras[j].y,
            );
            const minDistance = 150; // ok. 1.5 metra
            if (dist < minDistance) penalty += (minDistance - dist) * 50;
        }
    }
    return score - penalty;
}

export function runHeuristicOptimization(cameraCount: number): void {
    if (state.walls.length === 0) { alert('Najpierw narysuj pomieszczenie!'); return; }

    const snapCheckbox = document.getElementById('chk-snap-walls') as HTMLInputElement | null;
    const snapToWalls  = snapCheckbox ? snapCheckbox.checked : false;
    state.isOptimizing = true;

    const minX = Math.min(...state.walls.map(w => Math.min(w.x1, w.x2)));
    const maxX = Math.max(...state.walls.map(w => Math.max(w.x1, w.x2)));
    const minY = Math.min(...state.walls.map(w => Math.min(w.y1, w.y2)));
    const maxY = Math.max(...state.walls.map(w => Math.max(w.y1, w.y2)));

    state.placedCameras = [];
    const activeModel = state.cameraModels[state.selectedCameraModel];

    for (let i = 0; i < cameraCount; i++) {
        const cam: ICamera = {
            x:     minX + Math.random() * (maxX - minX),
            y:     minY + Math.random() * (maxY - minY),
            angle: Math.random() * 360,
            fov:   activeModel.fov,
            range: activeModel.range,
            dori:  activeModel.dori,
            modelId: state.selectedCameraModel,
            type:  activeModel.type,
        };
        state.placedCameras.push(cam);
    }

    let bestOverallScore = -Infinity;
    let bestSetup: ICamera[] = JSON.parse(JSON.stringify(state.placedCameras));
    let noImprovementCounter = 0;
    const maxNoImprovement   = 80;

    state.optimizationLoop = setInterval(() => {
        if (!state.isOptimizing) {
            clearInterval(state.optimizationLoop ?? undefined);
            return;
        }

        let temperature = 1.0 - noImprovementCounter / maxNoImprovement;
        if (temperature < 0.1) temperature = 0.1;

        const currentScore = evaluateFitness();

        state.placedCameras.forEach(cam => {
            const oldX = cam.x, oldY = cam.y, oldAngle = cam.angle;

            cam.x     += (Math.random() - 0.5) * 100 * temperature;
            cam.y     += (Math.random() - 0.5) * 100 * temperature;
            cam.angle += (Math.random() - 0.5) * 180 * temperature;

            if (snapToWalls && cam.type === 'wall') {
                snapToNearestWall(cam);
            } else {
                cam.x = Math.max(minX + 10, Math.min(maxX - 10, cam.x));
                cam.y = Math.max(minY + 10, Math.min(maxY - 10, cam.y));
            }

            const newScore = evaluateFitness();
            const allowWorseMove = Math.random() < 0.1 * temperature;
            if (newScore < currentScore && !allowWorseMove) {
                cam.x = oldX; cam.y = oldY; cam.angle = oldAngle;
            }
        });

        const loopFinalScore = evaluateFitness();
        if (loopFinalScore > bestOverallScore) {
            bestOverallScore = loopFinalScore;
            bestSetup = JSON.parse(JSON.stringify(state.placedCameras));
            noImprovementCounter = 0;
        } else {
            noImprovementCounter++;
        }

        draw();

        if (noImprovementCounter >= maxNoImprovement) {
            stopOptimization();
            state.placedCameras = JSON.parse(JSON.stringify(bestSetup));
            draw();
        }
    }, 30);
}

export function stopOptimization(): void {
    state.isOptimizing = false;
    if (state.optimizationLoop !== null) {
        clearInterval(state.optimizationLoop);
        state.optimizationLoop = null;
    }
    saveToLocalStorage();
    const btnOptimize = document.getElementById('btn-optimize');
    if (btnOptimize) btnOptimize.innerText = '✨ Optymalizuj Rozstawienie';
}
