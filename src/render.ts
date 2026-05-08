// ==========================================
// render.ts — Renderowanie mapy (Canvas 2D)
// ==========================================

import type { DisplayMode } from './types';
import { canvas, ctx, state, PIXELS_PER_METER } from './state';

export function resizeCanvas(): void {
    const rect = canvas.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;
    draw();
}

export function renderFieldOfView(
    x: number, y: number, angle: number, fov: number,
    range: number, dori: [number, number, number, number],
    isGhost = false, displayMode: DisplayMode = 'all',
): void {
    if (displayMode === 'hidden' && !isGhost) return;
    if (range <= 0 || fov <= 0) return;

    let actualRange = range;
    const safeDori = dori ?? ([range * 0.1, range * 0.2, range * 0.5, range] as [number,number,number,number]);

    if (!isGhost) {
        if      (displayMode === 'compact')  actualRange = 150;
        else if (displayMode === 'identify') actualRange = safeDori[0];
        else if (displayMode === 'recognize')actualRange = safeDori[1];
        else if (displayMode === 'observe')  actualRange = safeDori[2];
    }

    const blockingLines: { x1: number; y1: number; x2: number; y2: number }[] = [];

    state.walls.forEach(w => {
        if (w.type !== 'window') {
            blockingLines.push({ x1: w.x1, y1: w.y1, x2: w.x2, y2: w.y2 });
        }
    });

    state.zones.forEach(z => {
        if (z.type === 'obstacle') {
            blockingLines.push({ x1: z.x,          y1: z.y,          x2: z.x + z.width, y2: z.y });
            blockingLines.push({ x1: z.x + z.width, y1: z.y,          x2: z.x + z.width, y2: z.y + z.height });
            blockingLines.push({ x1: z.x + z.width, y1: z.y + z.height, x2: z.x,          y2: z.y + z.height });
            blockingLines.push({ x1: z.x,           y1: z.y + z.height, x2: z.x,          y2: z.y });
        }
    });

    const angles = new Set<number>();

    blockingLines.forEach(l => {
        [{ x: l.x1, y: l.y1 }, { x: l.x2, y: l.y2 }].forEach(pt => {
            const a = Math.atan2(pt.y - y, pt.x - x);
            angles.add(a);
            angles.add(a - 0.0001);
            angles.add(a + 0.0001);
        });
    });

    const startDeg = Math.floor(angle - fov / 2);
    const endDeg   = Math.ceil(angle  + fov / 2);
    for (let d = startDeg; d <= endDeg; d += 2) {
        angles.add(d * Math.PI / 180);
    }

    const sortedAngles = Array.from(angles)
        .filter(a => {
            const deg  = a * 180 / Math.PI;
            const diff = (deg - angle + 180 + 360) % 360 - 180;
            return Math.abs(diff) <= fov / 2 + 0.1;
        })
        .sort((a, b) => {
            const diffA = ((a * 180 / Math.PI) - angle + 180 + 360) % 360 - 180;
            const diffB = ((b * 180 / Math.PI) - angle + 180 + 360) % 360 - 180;
            return diffA - diffB;
        });

    const points: { x: number; y: number }[] = [];
    sortedAngles.forEach(a => {
        const ray = { x, y, dx: Math.cos(a), dy: Math.sin(a) };
        let closest = { x: x + Math.cos(a) * actualRange, y: y + Math.sin(a) * actualRange };
        let record  = actualRange;

        for (const line of blockingLines) {
            const x1 = line.x1, y1 = line.y1, x2 = line.x2, y2 = line.y2;
            const x3 = ray.x,  y3 = ray.y,  x4 = ray.x + ray.dx, y4 = ray.y + ray.dy;
            const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
            if (Math.abs(den) > 0.0001) {
                const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
                const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
                if (t >= 0 && t <= 1 && u > 0.001) {
                    const hitX = x1 + t * (x2 - x1);
                    const hitY = y1 + t * (y2 - y1);
                    const dist = Math.hypot(hitX - x, hitY - y);
                    if (dist < record) { record = dist; closest = { x: hitX, y: hitY }; }
                }
            }
        }
        points.push(closest);
    });

    ctx.beginPath();
    ctx.moveTo(x, y);
    points.forEach(p => ctx.lineTo(p.x, p.y));
    ctx.closePath();

    if (displayMode === 'compact' && !isGhost) {
        ctx.fillStyle = 'rgba(59, 130, 246, 0.2)';
    } else if (displayMode === 'identify' && !isGhost) {
        ctx.fillStyle = 'rgba(239, 68, 68, 0.4)';
    } else if (displayMode === 'recognize' && !isGhost) {
        ctx.fillStyle = 'rgba(245, 158, 11, 0.4)';
    } else if (displayMode === 'observe' && !isGhost) {
        ctx.fillStyle = 'rgba(16, 185, 129, 0.4)';
    } else {
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, range);
        const sI = safeDori[0] / range;
        const sR = safeDori[1] / range;
        const sO = safeDori[2] / range;
        const a  = isGhost ? 0.2 : 0.4;
        gradient.addColorStop(0,       `rgba(239, 68, 68, ${a})`);
        gradient.addColorStop(sI,      `rgba(239, 68, 68, ${a})`);
        gradient.addColorStop(sI + 0.01, `rgba(245, 158, 11, ${a})`);
        gradient.addColorStop(sR,      `rgba(245, 158, 11, ${a})`);
        gradient.addColorStop(sR + 0.01, `rgba(16, 185, 129, ${a})`);
        gradient.addColorStop(sO,      `rgba(16, 185, 129, ${a})`);
        gradient.addColorStop(sO + 0.01, `rgba(59, 130, 246, ${a})`);
        gradient.addColorStop(1.0,     `rgba(59, 130, 246, 0)`);
        ctx.fillStyle = gradient;
    }

    ctx.fill();
    ctx.strokeStyle = isGhost ? 'rgba(255,255,255,0.2)' : 'rgba(255,255,255,0.15)';
    ctx.lineWidth   = 1 / state.scale;
    ctx.stroke();
}

export function renderCameraIcon(x: number, y: number, angle: number, color: string): void {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, 7 / state.scale, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2 / state.scale;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle * Math.PI / 180) * (18 / state.scale), y + Math.sin(angle * Math.PI / 180) * (18 / state.scale));
    ctx.stroke();
}

function drawGrid(): void {
    const gridSize = PIXELS_PER_METER * state.scale;
    const startX   = state.offsetX % gridSize;
    const startY   = state.offsetY % gridSize;
    ctx.strokeStyle = 'rgba(255,255,255,0.05)';
    ctx.lineWidth   = 1;
    ctx.beginPath();
    for (let x = startX; x < canvas.width;  x += gridSize) { ctx.moveTo(x, 0); ctx.lineTo(x, canvas.height); }
    for (let y = startY; y < canvas.height; y += gridSize) { ctx.moveTo(0, y); ctx.lineTo(canvas.width, y); }
    ctx.stroke();
}

export function draw(): void {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    drawGrid();

    ctx.save();
    ctx.translate(state.offsetX, state.offsetY);
    ctx.scale(state.scale, state.scale);

    // --- TŁA ---
    state.backgroundImages.forEach(imgData => {
        if (!imgData.img.complete) return;
        ctx.save();
        let opacity = imgData.opacity;
        if (state.currentMode === 'bg-edit' && state.selectedImageId !== null && imgData.id !== state.selectedImageId) {
            opacity = imgData.opacity * 0.4;
        }
        ctx.globalAlpha = opacity;
        const sW = imgData.w * imgData.scale, sH = imgData.h * imgData.scale;
        const cx = imgData.x + sW / 2,        cy = imgData.y + sH / 2;
        const ang = imgData.rotation * Math.PI / 180;
        ctx.translate(cx, cy); ctx.rotate(ang); ctx.translate(-cx, -cy);
        ctx.drawImage(imgData.img, imgData.x, imgData.y, sW, sH);

        if (state.currentMode === 'bg-edit' && imgData.id === state.selectedImageId) {
            ctx.restore();
            ctx.save();
            ctx.translate(cx, cy); ctx.rotate(ang); ctx.translate(-cx, -cy);
            ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2 / state.scale;
            ctx.strokeRect(imgData.x, imgData.y, sW, sH);
            const hSize = 8 / state.scale;
            ctx.fillStyle = '#fff';
            [[imgData.x, imgData.y], [imgData.x + sW, imgData.y], [imgData.x, imgData.y + sH], [imgData.x + sW, imgData.y + sH]].forEach(([hx, hy]) => {
                ctx.fillRect(hx - hSize / 2, hy - hSize / 2, hSize, hSize);
                ctx.strokeRect(hx - hSize / 2, hy - hSize / 2, hSize, hSize);
            });
            ctx.beginPath();
            ctx.arc(imgData.x + sW / 2, imgData.y - 25 / state.scale, hSize / 1.5, 0, Math.PI * 2);
            ctx.fill(); ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(imgData.x + sW / 2, imgData.y);
            ctx.lineTo(imgData.x + sW / 2, imgData.y - 25 / state.scale + hSize / 1.5);
            ctx.stroke();
        }
        ctx.restore();
    });

    const drawStandardHandle = (hx: number, hy: number, isSelected = false) => {
        const size = isSelected ? 8 / state.scale : 5 / state.scale;
        ctx.fillStyle   = isSelected ? '#fff'     : '#1e293b';
        ctx.strokeStyle = isSelected ? '#3b82f6'  : '#64748b';
        ctx.lineWidth   = isSelected ? 2 / state.scale : 1 / state.scale;
        ctx.fillRect(hx - size / 2, hy - size / 2, size, size);
        ctx.strokeRect(hx - size / 2, hy - size / 2, size, size);
    };

    // --- STREFY ---
    state.zones.forEach((z, index) => {
        const isSelected = state.selectedObjects.some(o => o.type === 'zone' && o.index === index);
        ctx.fillStyle = z.type === 'obstacle' ? 'rgba(239, 68, 68, 0.2)' :
            z.type === 'poi_high' ? 'rgba(16, 185, 129, 0.2)' :
            z.type === 'poi_med'  ? 'rgba(245, 158, 11, 0.2)' : 'rgba(148, 163, 184, 0.2)';
        ctx.strokeStyle = z.type === 'obstacle' ? '#ef4444' :
            z.type === 'poi_high' ? '#10b981' :
            z.type === 'poi_med'  ? '#f59e0b' : '#94a3b8';
        ctx.lineWidth = 2 / state.scale;
        if (isSelected) { ctx.shadowColor = '#3b82f6'; ctx.shadowBlur = 10; ctx.strokeStyle = '#3b82f6'; }
        ctx.fillRect(z.x, z.y, z.width, z.height);
        ctx.strokeRect(z.x, z.y, z.width, z.height);
        ctx.shadowBlur = 0;
        if (isSelected) {
            drawStandardHandle(z.x, z.y, true);
            drawStandardHandle(z.x + z.width, z.y, true);
            drawStandardHandle(z.x, z.y + z.height, true);
            drawStandardHandle(z.x + z.width, z.y + z.height, true);
        }
    });

    // --- ŚCIANY ---
    ctx.lineCap  = 'butt';
    ctx.lineJoin = 'miter';
    state.walls.forEach((w, index) => {
        const isSelected = state.selectedObjects.some(o => o.type === 'wall' && o.index === index);
        if (isSelected) {
            ctx.save();
            ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2);
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.4)'; ctx.lineWidth = 14 / state.scale; ctx.stroke();
            ctx.restore();
        }
        ctx.beginPath(); ctx.moveTo(w.x1, w.y1); ctx.lineTo(w.x2, w.y2);
        if      (w.type === 'window') { ctx.strokeStyle = '#38bdf8'; ctx.lineWidth = 2 / state.scale; }
        else if (w.type === 'door')   { ctx.strokeStyle = '#f97316'; ctx.lineWidth = 2 / state.scale; }
        else                          { ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2 / state.scale; }
        ctx.stroke();
        drawStandardHandle(w.x1, w.y1, isSelected);
        drawStandardHandle(w.x2, w.y2, isSelected);
        drawStandardHandle((w.x1 + w.x2) / 2, (w.y1 + w.y2) / 2, isSelected);
    });

    // --- KAMERY ---
    state.placedCameras.forEach((cam, index) => {
        const isSelected = state.selectedObjects.some(o => o.type === 'camera' && o.index === index);
        
        renderFieldOfView(cam.x, cam.y, cam.angle, cam.fov, cam.range, cam.dori, false, cam.displayMode);

        ctx.save();
        ctx.translate(cam.x, cam.y);
        ctx.rotate(cam.angle * Math.PI / 180);
        if (isSelected) {
            ctx.beginPath(); ctx.arc(0, 0, 20 / state.scale, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(59, 130, 246, 0.8)'; ctx.lineWidth = 4 / state.scale; ctx.stroke();

            // Uchwyt rotacji (kropka na obwodzie w stronę patrzenia)
            ctx.beginPath();
            ctx.arc(20 / state.scale, 0, 6 / state.scale, 0, Math.PI * 2);
            ctx.fillStyle = '#fff';
            ctx.fill();
            ctx.strokeStyle = '#3b82f6';
            ctx.lineWidth = 2 / state.scale;
            ctx.stroke();
        }
        if (cam.type === 'ceiling') {
            ctx.beginPath(); ctx.arc(0, 0, 8 / state.scale, 0, Math.PI * 2);
            ctx.fillStyle = '#f8fafc'; ctx.fill();
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2 / state.scale; ctx.stroke();
        } else {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(-8 / state.scale, -6 / state.scale, 16 / state.scale, 12 / state.scale);
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2 / state.scale;
            ctx.strokeRect(-8 / state.scale, -6 / state.scale, 16 / state.scale, 12 / state.scale);
            ctx.beginPath();
            ctx.moveTo(8 / state.scale, -4 / state.scale);
            ctx.lineTo(14 / state.scale, 0);
            ctx.lineTo(8 / state.scale, 4 / state.scale);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
    });

    // --- DUCH KAMERY (TRYB SIMULATE) ---
    if (state.currentMode === 'simulate' && state.cameraPos && state.cameraModels[state.selectedCameraModel]) {
        const activeModel = state.cameraModels[state.selectedCameraModel];
        renderFieldOfView(
            state.cameraPos.x, state.cameraPos.y, state.cameraAngle,
            activeModel.fov, activeModel.range, activeModel.dori,
            true, 'all'
        );

        ctx.save();
        ctx.globalAlpha = 0.5;
        ctx.translate(state.cameraPos.x, state.cameraPos.y);
        ctx.rotate(state.cameraAngle * Math.PI / 180);
        
        if (activeModel.type === 'ceiling') {
            ctx.beginPath(); ctx.arc(0, 0, 8 / state.scale, 0, Math.PI * 2);
            ctx.fillStyle = '#f8fafc'; ctx.fill();
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2 / state.scale; ctx.stroke();
        } else {
            ctx.fillStyle = '#f8fafc';
            ctx.fillRect(-8 / state.scale, -6 / state.scale, 16 / state.scale, 12 / state.scale);
            ctx.strokeStyle = '#334155'; ctx.lineWidth = 2 / state.scale;
            ctx.strokeRect(-8 / state.scale, -6 / state.scale, 16 / state.scale, 12 / state.scale);
            ctx.beginPath();
            ctx.moveTo(8 / state.scale, -4 / state.scale);
            ctx.lineTo(14 / state.scale, 0);
            ctx.lineTo(8 / state.scale, 4 / state.scale);
            ctx.closePath(); ctx.fill(); ctx.stroke();
        }
        ctx.restore();
    }

    // --- LINIA KALIBRACJI ---
    if (state.currentMode === 'bg-edit' && state.isCalibrating && state.startPoint && state.currentPoint) {
        ctx.save();
        ctx.strokeStyle = '#ef4444'; ctx.lineWidth = 4 / state.scale;
        ctx.setLineDash([10 / state.scale, 10 / state.scale]);
        ctx.beginPath();
        ctx.moveTo(state.startPoint.x, state.startPoint.y);
        ctx.lineTo(state.currentPoint.x, state.currentPoint.y);
        ctx.stroke();
        ctx.restore();
    }

    // --- LINIE POMOCNICZE ---
    const isBuildingMode = state.currentMode === 'draw' || state.currentMode === 'draw-obstacle' || state.currentMode === 'draw-zone' || state.currentMode === 'simulate' || state.isDraggingObj || state.activeHandle !== null;
    if (isBuildingMode) {
        if (state.guideX) {
            ctx.beginPath();
            ctx.moveTo(state.guideX.x, -1000000); ctx.lineTo(state.guideX.x, 1000000);
            ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1 / state.scale;
            ctx.setLineDash([5 / state.scale, 5 / state.scale]); ctx.stroke(); ctx.setLineDash([]);
        }
        if (state.guideY) {
            ctx.beginPath();
            ctx.moveTo(-1000000, state.guideY.y); ctx.lineTo(1000000, state.guideY.y);
            ctx.strokeStyle = '#10b981'; ctx.lineWidth = 1 / state.scale;
            ctx.setLineDash([5 / state.scale, 5 / state.scale]); ctx.stroke(); ctx.setLineDash([]);
        }
    }

    // --- PODGLĄD RYSOWANIA ---
    if (state.isDrawing && state.startPoint && state.currentPoint &&
        (state.currentMode === 'draw' || state.currentMode === 'draw-obstacle' || state.currentMode === 'draw-zone')) {
        if (state.currentMode === 'draw') {
            ctx.beginPath();
            ctx.moveTo(state.startPoint.x, state.startPoint.y);
            ctx.lineTo(state.currentPoint.x, state.currentPoint.y);
            ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2 / state.scale; ctx.stroke();
        } else {
            const minX = Math.min(state.startPoint.x, state.currentPoint.x);
            const minY = Math.min(state.startPoint.y, state.currentPoint.y);
            const w    = Math.abs(state.currentPoint.x - state.startPoint.x);
            const h    = Math.abs(state.currentPoint.y - state.startPoint.y);
            ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 2 / state.scale;
            ctx.strokeRect(minX, minY, w, h);
        }
    }

    // --- MAGNES SNAPPOWANIA ---
    if (state.snapPoint) {
        ctx.beginPath();
        ctx.arc(state.snapPoint.x, state.snapPoint.y, 6 / state.scale, 0, Math.PI * 2);
        ctx.fillStyle = '#f59e0b'; ctx.fill();
    }

    // --- ZAPAMIĘTANE PUNKTY TRACKINGU ---
    if (isBuildingMode && state.trackingPoints && state.trackingPoints.length > 0) {
        ctx.strokeStyle = '#3b82f6'; 
        ctx.lineWidth = 2 / state.scale;
        const s = 4 / state.scale;
        state.trackingPoints.forEach(tp => {
            // Draw a tiny cross for tracking points
            ctx.beginPath();
            ctx.moveTo(tp.x - s, tp.y); ctx.lineTo(tp.x + s, tp.y);
            ctx.moveTo(tp.x, tp.y - s); ctx.lineTo(tp.x, tp.y + s);
            ctx.stroke();
        });
    }

    // --- PROSTOKĄT ZAZNACZANIA (MARQUEE) ---
    if (state.isSelecting && state.selectionStart && state.currentPoint) {
        const minX = Math.min(state.selectionStart.x, state.currentPoint.x);
        const minY = Math.min(state.selectionStart.y, state.currentPoint.y);
        const w    = Math.abs(state.currentPoint.x - state.selectionStart.x);
        const h    = Math.abs(state.currentPoint.y - state.selectionStart.y);
        ctx.fillStyle   = 'rgba(59, 130, 246, 0.2)'; ctx.fillRect(minX, minY, w, h);
        ctx.strokeStyle = '#3b82f6'; ctx.lineWidth = 1 / state.scale; ctx.strokeRect(minX, minY, w, h);
    }

    ctx.restore();
}
