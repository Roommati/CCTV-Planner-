// ==========================================
// state.ts — Globalny stan aplikacji + silnik fizyki / geometrii
// ==========================================

import type {
    IAppState, IWall, ICamera, IZone, IPoint,
    ISelectedObject, IProjectState, ICoverageResult, IMousePos,
    AppMode, ICable,
} from './types';
import { DEFAULT_CAMERAS } from './cameras';

// --- CANVAS (inicjalizowany raz przy starcie modułu) ---
const canvasEl = document.getElementById('mapCanvas');
if (!(canvasEl instanceof HTMLCanvasElement)) {
    throw new Error('Nie znaleziono elementu #mapCanvas');
}
export const canvas: HTMLCanvasElement = canvasEl;

const ctxOrNull = canvas.getContext('2d');
if (!ctxOrNull) {
    throw new Error('Nie można uzyskać kontekstu 2D canvasa');
}
export const ctx: CanvasRenderingContext2D = ctxOrNull;

// --- STAŁE ---
export const PIXELS_PER_METER = 100;
export const MAX_HISTORY = 30;

// --- GLOBALNY STAN ---
export const state: IAppState = {
    // Marquee
    selectedObjects:    [],
    isSelecting:        false,
    selectionStart:     null,
    selectionCurrent:   null,

    // Drag
    isDraggingObj:      false,
    dragStartPos:       null,
    dragInitialState:   [],

    // Klawisze modyfikujące
    isAltPressed:       false,
    isShiftPressed:     false,
    isCtrlPressed:      false,
    isSpacePressed:     false,

    // Rysowanie
    currentMode:        'none',
    isDrawing:          false,
    startPoint:         null,
    currentPoint:       null,
    snapPoint:          null,
    guideX:             null,
    guideY:             null,
    trackingPoints:     [],
    isOptimizing:       false,

    // Viewport
    scale:      (v => isNaN(v) ? 1.0 : v)(parseFloat(localStorage.getItem('cctv_scale') ?? '1.0')),
    offsetX:    (v => isNaN(v) ? 0   : v)(parseFloat(localStorage.getItem('cctv_offsetX') ?? '0')),
    offsetY:    (v => isNaN(v) ? 0   : v)(parseFloat(localStorage.getItem('cctv_offsetY') ?? '0')),
    isPanning:  false,
    panStart:   { x: 0, y: 0 },
    lastMousePos: { x: 0, y: 0 },

    // Hover / placementStep
    hoveredObj:     null,
    placementStep:  'pos',

    // Dane projektu (ładowane z localStorage)
    walls:          JSON.parse(localStorage.getItem('cctv_walls')   ?? '[]') as IWall[],
    placedCameras:  JSON.parse(localStorage.getItem('cctv_cameras') ?? '[]') as ICamera[],
    zones:          JSON.parse(localStorage.getItem('cctv_zones')   ?? '[]') as IZone[],
    cables:         JSON.parse(localStorage.getItem('cctv_cables')  ?? '[]') as ICable[],

    // Duch kamery
    cameraPos:   { x: 500, y: 400 },
    cameraAngle: 0,

    // Podkłady mapowe
    backgroundImages:   [],
    selectedImageId:    null,
    hasBg:              false,
    isDraggingBg:       false,
    isRotatingBg:       false,
    isResizingBg:       false,
    resizeHandle:       null,
    isCalibrating:      false,
    bgInitialRotation:  0,
    bgInitialOffset:    { x: 0, y: 0 },
    bgInitialState:     null,

    // Historia
    history:      [],
    redoHistory:  [],

    // Edycja
    activeHandle:     null,
    editingCameraId:  null,

    // Baza kamer
    cameraModels:          { ...DEFAULT_CAMERAS },
    selectedCameraModel:   'cam_2_8mm',
    favoriteCameras:       [],

    // Heurystyka
    optimizationLoop: null,

    // UI
    lastActiveTool: 'draw',
};

// --- CALLBACK draw() (rejestrowany z render.ts przez app.ts) ---
// Pozwala uniknąć cyklicznego importu state.ts ↔ render.ts
let _drawCallback: (() => void) | null = null;
export function registerDrawCallback(fn: () => void): void {
    _drawCallback = fn;
}
export function callDraw(): void {
    _drawCallback?.();
}

// --- CALLBACK updateTree() ---
let _updateTreeCallback: (() => void) | null = null;
export function registerUpdateTreeCallback(fn: () => void): void {
    _updateTreeCallback = fn;
}

// --- HISTORIA (undo / redo) ---

export function saveState(): void {
    const backgroundsMetadata = state.backgroundImages.map(bg => ({
        ...bg,
        img: null // Don't serialize the HTML element
    }));

    state.history.push({
        walls:   JSON.parse(JSON.stringify(state.walls)),
        cameras: JSON.parse(JSON.stringify(state.placedCameras)),
        zones:   JSON.parse(JSON.stringify(state.zones)),
        cables:  JSON.parse(JSON.stringify(state.cables)),
        backgrounds: JSON.parse(JSON.stringify(backgroundsMetadata)),
        scale: state.scale,
        offsetX: state.offsetX,
        offsetY: state.offsetY
    });
    state.redoHistory = [];
    if (state.history.length > MAX_HISTORY) state.history.shift();
}

function restoreProjectData(data: IProjectState) {
    state.walls = data.walls;
    state.placedCameras = data.cameras;
    state.zones = data.zones ?? [];
    state.cables = data.cables ?? [];
    if (data.backgrounds) {
        state.backgroundImages = data.backgrounds.map(bgData => {
            const img = new Image();
            if (bgData.src) img.src = bgData.src;
            img.onload = () => callDraw();
            return { ...bgData, img };
        });
        state.hasBg = state.backgroundImages.length > 0;
    }
}

export function undo(): void {
    if (state.history.length > 0) {
        saveToRedo();
        const prev: IProjectState = state.history.pop()!;
        restoreProjectData(prev);
        saveToLocalStorage();
        updateHover();
        callDraw();
    }
}

export function redo(): void {
    if (state.redoHistory.length > 0) {
        saveToHistory();
        const next: IProjectState = state.redoHistory.pop()!;
        restoreProjectData(next);
        saveToLocalStorage();
        updateHover();
        callDraw();
    }
}

function saveToHistory() { /* helper for standard cloning logic */ }

function saveToRedo(): void {
    state.redoHistory.push({
        walls: [...state.walls],
        cameras: state.placedCameras.map(c => ({ ...c, dori: [...c.dori] })),
        zones: [...state.zones],
        cables: [...state.cables],
        scale: state.scale,
        offsetX: state.offsetX,
        offsetY: state.offsetY,
    });
}

// --- PERSISTENCE ---

export function saveToLocalStorage(): void {
    const backgroundsData = state.backgroundImages.map(bg => ({ ...bg, img: null }));
    localStorage.setItem('cctv_walls',   JSON.stringify(state.walls));
    localStorage.setItem('cctv_cameras', JSON.stringify(state.placedCameras));
    localStorage.setItem('cctv_zones',   JSON.stringify(state.zones));
    localStorage.setItem('cctv_cables',  JSON.stringify(state.cables));
    localStorage.setItem('cctv_backgrounds', JSON.stringify(backgroundsData));
    localStorage.setItem('cctv_scale',   state.scale.toString());
    localStorage.setItem('cctv_offsetX', state.offsetX.toString());
    localStorage.setItem('cctv_offsetY', state.offsetY.toString());
    _updateTreeCallback?.();
}

// --- GEOMETRIA / FIZYKA ---

export function splitWallIfIntersecting(newWall: IWall): IWall[] {
    const result: IWall[] = [newWall];
    const wallsToRemove: number[] = [];
    const wallsToAdd: IWall[] = [];

    // Najpierw znajdź wszystkie przecięcia i zbierz zmiany
    for (let i = 0; i < state.walls.length; i++) {
        const existingWall = state.walls[i];
        const intersection = findLineIntersection(
            newWall.x1, newWall.y1, newWall.x2, newWall.y2,
            existingWall.x1, existingWall.y1, existingWall.x2, existingWall.y2
        );

        if (intersection && isCollinear(newWall, existingWall)) {
            wallsToRemove.push(i);
            
            // Sortuj punkty wzdłuż linii
            const points = [
                { x: newWall.x1, y: newWall.y1 },
                { x: newWall.x2, y: newWall.y2 },
                { x: existingWall.x1, y: existingWall.y1 },
                { x: existingWall.x2, y: existingWall.y2 }
            ];
            
            // Usuń duplikaty i sortuj po współrzędnej x (lub y dla linii pionowych)
            const uniquePoints = points.filter((point, index, self) => 
                index === self.findIndex(p => Math.abs(p.x - point.x) < 0.1 && Math.abs(p.y - point.y) < 0.1)
            );
            
            uniquePoints.sort((a, b) => {
                if (Math.abs(newWall.x2 - newWall.x1) > Math.abs(newWall.y2 - newWall.y1)) {
                    return a.x - b.x;
                } else {
                    return a.y - b.y;
                }
            });

            // Stwórz nowe segmenty między kolejnymi punktami
            for (let j = 0; j < uniquePoints.length - 1; j++) {
                const start = uniquePoints[j];
                const end = uniquePoints[j + 1];
                
                // Sprawdź czy ten segment nie jest już w result
                const exists = result.some(w => 
                    (Math.abs(w.x1 - start.x) < 0.1 && Math.abs(w.y1 - start.y) < 0.1 &&
                     Math.abs(w.x2 - end.x) < 0.1 && Math.abs(w.y2 - end.y) < 0.1) ||
                    (Math.abs(w.x1 - end.x) < 0.1 && Math.abs(w.y1 - end.y) < 0.1 &&
                     Math.abs(w.x2 - start.x) < 0.1 && Math.abs(w.y2 - start.y) < 0.1)
                );
                
                if (!exists && (Math.abs(end.x - start.x) > 0.1 || Math.abs(end.y - start.y) > 0.1)) {
                    // Użyj typu nowej ściany dla środkowego segmentu, typu starej dla skrajnych
                    const isMiddleSegment = j > 0 && j < uniquePoints.length - 2;
                    const segmentType = isMiddleSegment ? newWall.type : existingWall.type;
                    
                    wallsToAdd.push({
                        x1: start.x,
                        y1: start.y,
                        x2: end.x,
                        y2: end.y,
                        type: segmentType
                    });
                }
            }
        }
    }

    // Aplikuj zmiany - najpierw usuń stare ściany (od końca, żeby nie zmienić indeksów)
    wallsToRemove.sort((a, b) => b - a).forEach(index => {
        state.walls.splice(index, 1);
    });

    // Potem dodaj nowe ściany
    wallsToAdd.forEach(wall => {
        state.walls.push(wall);
    });

    return result;
}

function findLineIntersection(
    x1: number, y1: number, x2: number, y2: number,
    x3: number, y3: number, x4: number, y4: number
): { x: number; y: number } | null {
    const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (Math.abs(denom) < 0.0001) return null;

    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / denom;

    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
        return {
            x: x1 + t * (x2 - x1),
            y: y1 + t * (y2 - y1)
        };
    }

    return null;
}

function isCollinear(wall1: IWall, wall2: IWall): boolean {
    // Sprawdź czy linie są współliniowe
    const cross1 = (wall2.x1 - wall1.x1) * (wall1.y2 - wall1.y1) - (wall2.y1 - wall1.y1) * (wall1.x2 - wall1.x1);
    const cross2 = (wall2.x2 - wall1.x1) * (wall1.y2 - wall1.y1) - (wall2.y2 - wall1.y1) * (wall1.x2 - wall1.x1);
    
    return Math.abs(cross1) < 0.1 && Math.abs(cross2) < 0.1;
}

export function validateDoorWindowPlacement(newWall: IWall): boolean {
    // Drzwi i okna mogą być stawiane TYLKO na istniejących ścianach
    if (newWall.type === 'wall') {
        console.log('DEBUG: validateDoorWindowPlacement - wall type, returning true');
        return true; // Ściany mogą być stawiane wszędzie
    }
    
    console.log('DEBUG: validateDoorWindowPlacement - checking door/window placement');
    console.log('DEBUG: existing walls count:', state.walls.length);
    
    // Sprawdź czy nowy element przecina jakąkolwiek istniejącą ścianę
    for (const existingWall of state.walls) {
        if (existingWall.type !== 'wall') continue; // Sprawdzaj tylko przecięcia ze ścianami
        
        console.log('DEBUG: checking against existing wall:', existingWall);
        
        const intersection = findLineIntersection(
            newWall.x1, newWall.y1, newWall.x2, newWall.y2,
            existingWall.x1, existingWall.y1, existingWall.x2, existingWall.y2
        );
        
        console.log('DEBUG: intersection:', intersection);
        console.log('DEBUG: isCollinear:', isCollinear(newWall, existingWall));
        
        if (intersection && isCollinear(newWall, existingWall)) {
            console.log('DEBUG: found valid intersection, returning true');
            return true; // Znaleziono przecięcie ze ścianą - dozwolone
        }
    }
    
    console.log('DEBUG: no valid intersection found, returning false');
    return false; // Brak przecięcia ze ścianą - niedozwolone dla drzwi/okien
}

export function getMousePos(e: MouseEvent): IMousePos {
    const screenX = e.offsetX;
    const screenY = e.offsetY;
    const worldX  = (screenX - state.offsetX) / state.scale;
    const worldY  = (screenY - state.offsetY) / state.scale;
    return { worldX, worldY, screenX, screenY };
}

export function getIntersection(
    ray: { x: number; y: number; dx: number; dy: number },
    wall: IWall,
): IPoint | null {
    const x1 = wall.x1, y1 = wall.y1, x2 = wall.x2, y2 = wall.y2;
    const x3 = ray.x,  y3 = ray.y,  x4 = ray.x + ray.dx, y4 = ray.y + ray.dy;
    const den = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
    if (den === 0) return null;
    const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / den;
    const u = -((x1 - x2) * (y1 - y3) - (y1 - y2) * (x1 - x3)) / den;
    if (t > 0 && t < 1 && u > 0) return { x: x1 + t * (x2 - x1), y: y1 + t * (y2 - y1) };
    return null;
}

export function distToSegment(p: IPoint, v: IPoint, w: IPoint): number {
    const l2 = Math.pow(w.x - v.x, 2) + Math.pow(w.y - v.y, 2);
    if (l2 === 0) return Math.hypot(p.x - v.x, p.y - v.y);
    let t = ((p.x - v.x) * (w.x - v.x) + (p.y - v.y) * (w.y - v.y)) / l2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(p.x - (v.x + t * (w.x - v.x)), p.y - (v.y + t * (w.y - v.y)));
}

export function getSnappedCameraPosition(mouseX: number, mouseY: number): IPoint {
    if (state.walls.length === 0) return { x: mouseX, y: mouseY };
    let minDist = Infinity;
    let bestPt: IPoint = { x: mouseX, y: mouseY };
    let normalDx = 0, normalDy = 0;

    for (const w of state.walls) {
        const l2 = Math.pow(w.x2 - w.x1, 2) + Math.pow(w.y2 - w.y1, 2);
        let t = 0;
        if (l2 !== 0) {
            t = Math.max(0, Math.min(1, ((mouseX - w.x1) * (w.x2 - w.x1) + (mouseY - w.y1) * (w.y2 - w.y1)) / l2));
        }
        const ptX = w.x1 + t * (w.x2 - w.x1);
        const ptY = w.y1 + t * (w.y2 - w.y1);
        const dist = Math.hypot(mouseX - ptX, mouseY - ptY);
        if (dist < minDist) {
            minDist = dist;
            bestPt = { x: ptX, y: ptY };
            let nx = -(w.y2 - w.y1);
            let ny =  (w.x2 - w.x1);
            const len = Math.hypot(nx, ny);
            nx /= len; ny /= len;
            const dot = (mouseX - ptX) * nx + (mouseY - ptY) * ny;
            if (dot < 0) { nx = -nx; ny = -ny; }
            normalDx = nx; normalDy = ny;
        }
    }
    if (minDist < 30 / state.scale) {
        return { x: bestPt.x + normalDx * 5, y: bestPt.y + normalDy * 5 };
    }
    return { x: mouseX, y: mouseY };
}

export function findObjectAtPos(x: number, y: number): ISelectedObject | null {
    let bestMatch: ISelectedObject | null = null;
    let minDist = Infinity;
    let bestIsSelected = false;

    const check = (dist: number, obj: ISelectedObject, threshold: number) => {
        if (dist <= threshold) {
            const isSelected = state.selectedObjects.some(so => so.type === obj.type && so.index === obj.index);
            if (isSelected && !bestIsSelected) {
                minDist = dist; bestMatch = obj; bestIsSelected = true;
            } else if (isSelected === bestIsSelected && dist < minDist) {
                minDist = dist; bestMatch = obj;
            }
        }
    };

    const threshold = 15 / state.scale;

    for (let i = 0; i < state.walls.length; i++) {
        check(Math.hypot(state.walls[i].x1 - x, state.walls[i].y1 - y), { type: 'wall', index: i, handle: 'p1' }, threshold);
        check(Math.hypot(state.walls[i].x2 - x, state.walls[i].y2 - y), { type: 'wall', index: i, handle: 'p2' }, threshold);
    }
    for (let i = 0; i < state.zones.length; i++) {
        const z = state.zones[i];
        check(Math.hypot(z.x - x,           z.y - y),             { type: 'zone', index: i, handle: 'tl' }, threshold);
        check(Math.hypot(z.x + z.width - x, z.y - y),             { type: 'zone', index: i, handle: 'tr' }, threshold);
        check(Math.hypot(z.x - x,           z.y + z.height - y),  { type: 'zone', index: i, handle: 'bl' }, threshold);
        check(Math.hypot(z.x + z.width - x, z.y + z.height - y),  { type: 'zone', index: i, handle: 'br' }, threshold);
    }

    if (bestMatch) return bestMatch;

    for (let i = 0; i < state.placedCameras.length; i++) {
        check(Math.hypot(state.placedCameras[i].x - x, state.placedCameras[i].y - y), { type: 'camera', index: i, handle: 'center' }, threshold);
    }
    for (let i = 0; i < state.walls.length; i++) {
        check(
            distToSegment({ x, y }, { x: state.walls[i].x1, y: state.walls[i].y1 }, { x: state.walls[i].x2, y: state.walls[i].y2 }),
            { type: 'wall', index: i, handle: 'center' },
            10 / state.scale,
        );
    }
    for (let i = 0; i < state.zones.length; i++) {
        const z = state.zones[i];
        if (x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height) {
            const cx = z.x + z.width / 2, cy = z.y + z.height / 2;
            check(Math.hypot(cx - x, cy - y), { type: 'zone', index: i, handle: 'center' }, Infinity);
        }
    }

    return bestMatch;
}

export function updateHover(): void {
    if (state.currentMode === 'erase' || state.currentMode === 'none') {
        state.hoveredObj = findObjectAtPos(state.lastMousePos.x, state.lastMousePos.y);
        if (state.currentMode === 'none' && state.hoveredObj && !state.isDraggingObj) {
            const h = state.hoveredObj.handle;
            if (h === 'tl' || h === 'br')        canvas.style.cursor = 'nwse-resize';
            else if (h === 'tr' || h === 'bl')   canvas.style.cursor = 'nesw-resize';
            else if (h === 'p1' || h === 'p2')   canvas.style.cursor = 'crosshair';
            else                                  canvas.style.cursor = 'grab';
        } else if (state.currentMode === 'none' && !state.isDraggingObj) {
            canvas.style.cursor = 'default';
        }
    } else {
        state.hoveredObj = null;
    }
}

export function calculateEditInteraction(e: MouseEvent, basePoint: IPoint | null): IPoint {
    const pos = getMousePos(e);
    let x = pos.worldX;
    let y = pos.worldY;

    if (state.isShiftPressed && basePoint) {
        const dx = x - basePoint.x, dy = y - basePoint.y;
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
        const dist  = Math.hypot(dx, dy);
        return { x: basePoint.x + Math.cos(angle) * dist, y: basePoint.y + Math.sin(angle) * dist };
    }

    let snapRadius = 15 / state.scale;
    let snapPt: IPoint | null = null;
    for (const w of state.walls) {
        for (const p of [{ x: w.x1, y: w.y1 } as IPoint, { x: w.x2, y: w.y2 } as IPoint]) {
            const d = Math.hypot(x - p.x, y - p.y);
            if (d < snapRadius) { snapRadius = d; snapPt = p; }
        }
    }
    if (snapPt !== null) { x = snapPt.x; y = snapPt.y; }
    return { x, y };
}

export function calculateInteraction(e: MouseEvent, basePoint: IPoint | null = null): IPoint {
    const pos = getMousePos(e);
    const mx = pos.worldX;
    const my = pos.worldY;
    let x = mx, y = my;
    state.snapPoint = null;
    state.guideX    = null;
    state.guideY    = null;

    if (state.isShiftPressed && basePoint) {
        const dx = x - basePoint.x, dy = y - basePoint.y;
        const angle = Math.round(Math.atan2(dy, dx) / (Math.PI / 12)) * (Math.PI / 12);
        const dist  = Math.hypot(dx, dy);
        return { x: basePoint.x + Math.cos(angle) * dist, y: basePoint.y + Math.sin(angle) * dist };
    }

    const allPoints: IPoint[] = [];
    state.walls.forEach(w => {
        allPoints.push({ x: w.x1, y: w.y1 });
        allPoints.push({ x: w.x2, y: w.y2 });
        allPoints.push({ x: (w.x1 + w.x2) / 2, y: (w.y1 + w.y2) / 2 });
    });
    state.zones.forEach(z => {
        allPoints.push({ x: z.x, y: z.y }); // tl
        allPoints.push({ x: z.x + z.width, y: z.y }); // tr
        allPoints.push({ x: z.x, y: z.y + z.height }); // bl
        allPoints.push({ x: z.x + z.width, y: z.y + z.height }); // br
        allPoints.push({ x: z.x + z.width / 2, y: z.y + z.height / 2 }); // center
    });
    state.placedCameras.forEach(cam => {
        allPoints.push({ x: cam.x, y: cam.y });
    });

    let snapRadius = 15 / state.scale;
    let hoveredPoint: IPoint | null = null;
    state.snapPoint = null;
    for (const p of allPoints) {
        const d = Math.hypot(mx - p.x, my - p.y);
        if (d < snapRadius) { snapRadius = d; hoveredPoint = p; state.snapPoint = p; }
    }

    if (hoveredPoint) {
        const exists = state.trackingPoints.some(tp => tp.x === hoveredPoint!.x && tp.y === hoveredPoint!.y);
        if (!exists) {
            state.trackingPoints.push(hoveredPoint);
            if (state.trackingPoints.length > 4) {
                state.trackingPoints.shift();
            }
        }
    }

    const guidePoints = [...state.trackingPoints];
    if (basePoint) {
        if (!guidePoints.some(p => p.x === basePoint.x && p.y === basePoint.y)) {
            guidePoints.push(basePoint);
        }
    }

    const localRadius = 200 / state.scale;
    for (const p of allPoints) {
        const d = Math.hypot(mx - p.x, my - p.y);
        if (d < localRadius) {
            if (!guidePoints.some(gp => gp.x === p.x && gp.y === p.y)) {
                guidePoints.push(p);
            }
        }
    }

    if (!state.isShiftPressed) {
        const alignThreshold = 10 / state.scale;

        let bestDx = alignThreshold;
        let gx: { x: number } | null = null;
        let snapX = mx;
        for (const p of guidePoints) {
            const d = Math.abs(mx - p.x);
            if (d < bestDx) { bestDx = d; gx = p; snapX = p.x; }
        }
        if (gx) { x = snapX; state.guideX = gx; }

        let bestDy = alignThreshold;
        let gy: { y: number } | null = null;
        let snapY = my;
        for (const p of guidePoints) {
            const d = Math.abs(my - p.y);
            if (d < bestDy) { bestDy = d; gy = p; snapY = p.y; }
        }
        if (gy) { y = snapY; state.guideY = gy; }
    }

    const resolvedSnap = state.snapPoint;
    if (resolvedSnap !== null) { x = resolvedSnap.x; y = resolvedSnap.y; }
    return { x, y };
}

export function calculateDrawInteraction(e: MouseEvent): IPoint {
    return calculateInteraction(e, state.isDrawing && state.startPoint ? state.startPoint : null);
}

export function isPointInside(x: number, y: number): boolean {
    let inside = false;
    for (const w of state.walls) {
        const xi = w.x1, yi = w.y1, xj = w.x2, yj = w.y2;
        const intersect = ((yi > y) !== (yj > y)) && (x < (xj - xi) * (y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export function calculateCoverage(): ICoverageResult {
    if (state.walls.length === 0) return { percentage: 0, score: 0 };

    const step = 25;
    let totalPoints = 0;
    let visiblePoints = 0;
    let aiScore = 0;

    const blockingLines: IWall[] = [];
    state.walls.forEach(w => { if (w.type !== 'window') blockingLines.push(w); });
    state.zones.forEach(z => {
        if (z.type === 'obstacle') {
            blockingLines.push({ x1: z.x,          y1: z.y,          x2: z.x + z.width, y2: z.y,          type: 'wall' });
            blockingLines.push({ x1: z.x + z.width, y1: z.y,          x2: z.x + z.width, y2: z.y + z.height, type: 'wall' });
            blockingLines.push({ x1: z.x + z.width, y1: z.y + z.height, x2: z.x,          y2: z.y + z.height, type: 'wall' });
            blockingLines.push({ x1: z.x,           y1: z.y + z.height, x2: z.x,          y2: z.y,          type: 'wall' });
        }
    });

    const minX = Math.min(...state.walls.map(w => Math.min(w.x1, w.x2)));
    const maxX = Math.max(...state.walls.map(w => Math.max(w.x1, w.x2)));
    const minY = Math.min(...state.walls.map(w => Math.min(w.y1, w.y2)));
    const maxY = Math.max(...state.walls.map(w => Math.max(w.y1, w.y2)));

    for (let x = minX; x <= maxX; x += step) {
        for (let y = minY; y <= maxY; y += step) {
            if (!isPointInside(x, y)) continue;
            totalPoints++;
            let pointVisible = false;
            let bestDoriLevel = 4;

            for (const cam of state.placedCameras) {
                const distToPoint = Math.hypot(x - cam.x, y - cam.y);
                if (distToPoint <= (cam.range ?? 4000)) {
                    let angleToPt = Math.atan2(y - cam.y, x - cam.x) * 180 / Math.PI;
                    if (angleToPt < 0) angleToPt += 360;
                    const diff = Math.abs((angleToPt - cam.angle + 180 + 360) % 360 - 180);

                    if (diff <= (cam.fov ?? 90) / 2) {
                        const ray = { x: cam.x, y: cam.y, dx: x - cam.x, dy: y - cam.y };
                        let hitWall = false;

                        for (const line of blockingLines) {
                            const pt = getIntersection(ray, line);
                            if (pt) {
                                const distToWall = Math.hypot(pt.x - cam.x, pt.y - cam.y);
                                if (distToWall < distToPoint - 2) { hitWall = true; break; }
                            }
                        }

                        if (!hitWall) {
                            pointVisible = true;
                            const dori = cam.dori ?? ([cam.range * 0.1, cam.range * 0.2, cam.range * 0.5, cam.range] as [number,number,number,number]);
                            if      (distToPoint <= dori[0]) bestDoriLevel = Math.min(bestDoriLevel, 0);
                            else if (distToPoint <= dori[1]) bestDoriLevel = Math.min(bestDoriLevel, 1);
                            else if (distToPoint <= dori[2]) bestDoriLevel = Math.min(bestDoriLevel, 2);
                            else                             bestDoriLevel = Math.min(bestDoriLevel, 3);
                        }
                    }
                }
            }

            if (pointVisible) {
                visiblePoints++;
                let pointValue = 1;
                let isNearDoor = false;

                for (const w of state.walls) {
                    if (w.type === 'door') {
                        const distToDoor = distToSegment({ x, y }, { x: w.x1, y: w.y1 }, { x: w.x2, y: w.y2 });
                        if (distToDoor < 150) { isNearDoor = true; break; }
                    }
                }

                if (isNearDoor) {
                    if      (bestDoriLevel === 0) pointValue += 500;
                    else if (bestDoriLevel === 1) pointValue += 100;
                    else if (bestDoriLevel === 2) pointValue += 20;
                    else                          pointValue += 5;
                } else {
                    if      (bestDoriLevel === 0) pointValue += 3;
                    else if (bestDoriLevel === 1) pointValue += 2;
                }

                // AI ZONES (STREFY) MULTIPLIER
                for (const z of state.zones) {
                    if (x >= z.x && x <= z.x + z.width && y >= z.y && y <= z.y + z.height) {
                        if (z.type === 'poi_high') pointValue *= 15;
                        else if (z.type === 'poi_med') pointValue *= 4;
                        else if (z.type === 'poi_none') pointValue = 0;
                    }
                }

                aiScore += pointValue;
            }
        }
    }

    const scorePercent = totalPoints > 0 ? Math.round((visiblePoints / totalPoints) * 100) : 0;
    const coverageDisplay = document.getElementById('val-coverage');
    if (coverageDisplay) coverageDisplay.innerText = String(scorePercent);

    return { percentage: scorePercent, score: aiScore };
}

// Pomocnik: zmień tryb (wywoływany z app.ts i eksportowany dla wygody)
// Właściwa implementacja jest w app.ts — tutaj tylko stub, nadpisywany przez rejestrację
let _setModeCallback: ((mode: AppMode) => void) | null = null;
export function registerSetModeCallback(fn: (mode: AppMode) => void): void {
    _setModeCallback = fn;
}
export function callSetMode(mode: AppMode): void {
    _setModeCallback?.(mode);
}
