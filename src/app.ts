// ==========================================
// app.ts — Punkt wejścia (eventy DOM, inicjalizacja)
// ==========================================

import type { IWall, ICamera, IZone, AppMode } from './types';
import {
    canvas, state, PIXELS_PER_METER,
    saveState, undo, redo,
    getMousePos, getSnappedCameraPosition,
    calculateDrawInteraction, calculateEditInteraction,
    calculateInteraction, findObjectAtPos, updateHover,
    saveToLocalStorage, distToSegment,
    registerDrawCallback, registerSetModeCallback,
    registerUpdateTreeCallback, splitWallIfIntersecting, validateDoorWindowPlacement,
} from './state';
import { draw, resizeCanvas } from './render';
import { loadCameraDatabase } from './cameras';
import { API } from './api';
import { runBruteForceOptimization } from './algo_brute';
import { stopOptimization } from './algo_heuristic';

// Rejestrujemy draw() i setMode() w state.ts (przerywa cykliczny import)
registerDrawCallback(draw);
registerSetModeCallback(setMode);
registerUpdateTreeCallback(updateProjectTree);

// --- REFERENCJE DO ELEMENTÓW DOM ---
const btnDraw         = document.getElementById('btn-draw')!;
const btnErase        = document.getElementById('btn-erase')!;
const btnNewProject   = document.getElementById('btn-new-project')!;
const btnOptimize     = document.getElementById('btn-optimize')!;
const btnSimulate     = document.getElementById('btn-simulate')!;
const btnDrawObstacle = document.getElementById('btn-draw-obstacle')!;
const btnDrawZone     = document.getElementById('btn-draw-zone')!;
const btnBgEdit       = document.getElementById('btn-bg-edit')!;
const btnCalibrate    = document.getElementById('btn-calibrate')!;
const btnBgUpload     = document.getElementById('bg-upload-trigger')!;
const btnBgDelete     = document.getElementById('btn-bg-delete')!;
const btnCameraManager= document.getElementById('btn-camera-manager')!;
const btnToggleTree   = document.getElementById('btn-toggle-tree')!;
const btnUndo         = document.getElementById('btn-undo')!;
const btnRedo         = document.getElementById('btn-redo')!;

const selectCamera    = document.getElementById('camera-select') as HTMLSelectElement;
const selectWallType  = document.getElementById('wall-type-select') as HTMLSelectElement;
const selectZoneType  = document.getElementById('zone-type-select') as HTMLSelectElement;
const bgOpacity       = document.getElementById('bg-opacity') as HTMLInputElement;
const bgOpacityVal    = document.getElementById('bg-opacity-val')!;
const bgUploadInput   = document.getElementById('bg-upload') as HTMLInputElement;
const statusBar       = document.getElementById('status-bar')!;
const valLength       = document.getElementById('val-length')!;
const valAngle        = document.getElementById('val-angle')!;
const inputLength     = document.getElementById('input-length') as HTMLInputElement;

// Grupa wymiarów stref (tworzona dynamicznie, jak w oryginale)
const zoneInputGroup = document.createElement('span');
zoneInputGroup.id = 'zone-input-group';
zoneInputGroup.style.display = 'none';
zoneInputGroup.innerHTML = `
    <span style="margin-left: 20px; font-weight: bold; color: #38bdf8;">Wymiary:</span>
    <label style="margin-left: 10px;">X (m): <input type="number" id="input-zone-w" step="0.01" style="width: 70px; background: #334155; color: white; border: 1px solid #475569; padding: 2px 5px; border-radius: 4px;"></label>
    <label style="margin-left: 10px;">Y (m): <input type="number" id="input-zone-h" step="0.01" style="width: 70px; background: #334155; color: white; border: 1px solid #475569; padding: 2px 5px; border-radius: 4px;"></label>
    <span style="font-size: 11px; color: #94a3b8; margin-left: 5px;">(Zatwierdź Enterem)</span>
`;
statusBar.appendChild(zoneInputGroup);

const inputZoneW = document.getElementById('input-zone-w') as HTMLInputElement;
const inputZoneH = document.getElementById('input-zone-h') as HTMLInputElement;

// --- TRYB APLIKACJI ---

function setMode(mode: AppMode): void {
    if (state.currentMode === mode) mode = 'none';
    state.currentMode = mode;
    if (mode !== 'none') state.lastActiveTool = mode;

    document.querySelectorAll<HTMLElement>('.ribbon-btn-large, .ribbon-btn-small').forEach(btn => {
        btn.classList.remove('active');
    });

    const btnMap: Record<string, string> = {
        draw:          'btn-draw',
        simulate:      'btn-simulate',
        'draw-obstacle': 'btn-draw-obstacle',
        'draw-zone':   'btn-draw-zone',
        erase:         'btn-erase',
        'bg-edit':     'btn-bg-edit',
    };

    if (mode !== 'none' && btnMap[mode]) {
        document.getElementById(btnMap[mode])?.classList.add('active');
    }

    const canvasEl = document.getElementById('mapCanvas');
    if (canvasEl) canvasEl.style.cursor = mode === 'none' ? 'default' : 'crosshair';

    state.selectedObjects = [];
    resetDrawingState();
    updateHover();
    draw();
}

function resetDrawingState(): void {
    state.isDrawing    = false;
    state.startPoint   = null;
    state.currentPoint = null;
    state.guideX       = null;
    state.guideY       = null;
    state.snapPoint    = null;
    statusBar.style.display = 'none';
    draw();
}

function cloneSelectedObjects(): void {
    const newSelection: typeof state.selectedObjects = [];
    state.selectedObjects.forEach(sel => {
        if (sel.type === 'wall') {
            state.walls.push({ ...state.walls[sel.index] });
            newSelection.push({ type: 'wall', index: state.walls.length - 1 });
        } else if (sel.type === 'camera') {
            const c = state.placedCameras[sel.index];
            state.placedCameras.push({ ...c, dori: [...c.dori] });
            newSelection.push({ type: 'camera', index: state.placedCameras.length - 1 });
        } else if (sel.type === 'zone') {
            state.zones.push({ ...state.zones[sel.index] });
            newSelection.push({ type: 'zone', index: state.zones.length - 1 });
        }
    });
    state.selectedObjects = newSelection;
}

// --- PASEK STATUSU ---

function syncStatusBarWithSelection(): void {
    // Priorytet ma edytowany obiekt (uchwyt), a nie zaznaczenie
    let objectForStatus: { type: 'wall' | 'zone', index: number } | null = null;
    if (state.activeHandle && (state.activeHandle.type === 'wall' || state.activeHandle.type === 'zone')) {
        objectForStatus = state.activeHandle as { type: 'wall' | 'zone', index: number };
    } else if (state.selectedObjects.length === 1 && state.currentMode === 'none') {
        const sel = state.selectedObjects[0];
        if (sel.type === 'wall' || sel.type === 'zone') {
            objectForStatus = sel as { type: 'wall' | 'zone', index: number };
        }
    }

    if (objectForStatus) {
        statusBar.style.display = 'flex';

        if (objectForStatus.type === 'wall') {
            const w  = state.walls[objectForStatus.index];
            const dx = w.x2 - w.x1, dy = w.y2 - w.y1;
            const len = (Math.hypot(dx, dy) / PIXELS_PER_METER).toFixed(2);
            let ang = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
            if (ang < 0) ang += 360;
            Array.from(statusBar.children).forEach(c => { if ((c as HTMLElement).id !== 'zone-input-group') (c as HTMLElement).style.display = ''; });
            zoneInputGroup.style.display = 'none';
            inputLength.value = len;
            valLength.innerText = len;
            valAngle.innerText  = String(ang);
        } else if (objectForStatus.type === 'zone') {
            const z = state.zones[objectForStatus.index];
            Array.from(statusBar.children).forEach(c => { if ((c as HTMLElement).id !== 'zone-input-group') (c as HTMLElement).style.display = 'none'; });
            zoneInputGroup.style.display = 'inline-block';
            (document.getElementById('input-zone-w') as HTMLInputElement).value = (z.width  / PIXELS_PER_METER).toFixed(2);
            (document.getElementById('input-zone-h') as HTMLInputElement).value = (z.height / PIXELS_PER_METER).toFixed(2);
        }
    } else if (!state.isDrawing && !state.activeHandle) {
        statusBar.style.display = 'none';
    }
}

// --- DRZEWKO PROJEKTU ---

function toggleTree(): void {
    const sidebar = document.getElementById('project-sidebar');
    if (sidebar) {
        sidebar.classList.toggle('closed');
        if (!sidebar.classList.contains('closed')) updateProjectTree();
    }
}

function updateProjectTree(): void {
    const sidebar = document.getElementById('project-sidebar');
    if (sidebar?.classList.contains('closed')) return;

    const tree = document.getElementById('project-tree');
    if (!tree) return;
    tree.innerHTML = '';

    if (state.placedCameras.length === 0) {
        tree.innerHTML = '<div class="info-text">Brak kamer w projekcie.</div>';
        return;
    }

    state.placedCameras.forEach((cam, index) => {
        if (!cam.displayMode) cam.displayMode = 'compact';
        if (!cam.name)        cam.name        = `Kamera ${index + 1}`;

        const isSelected = state.selectedObjects.some(o => o.type === 'camera' && o.index === index);
        const item = document.createElement('div');
        item.className = `tree-item ${isSelected ? 'active-item' : ''}`;

        item.onclick = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            if (['INPUT', 'SELECT', 'OPTION'].includes(target.tagName)) return;
            window.selectObjectFromTree('camera', index);
        };

        item.innerHTML = `
            <div class="tree-item-header" style="display: flex; align-items: center; margin-bottom: 2px;">
                <span class="ribbon-icon" style="font-size: 14px; margin-right: 5px;">🎥</span>
                <input type="text" value="${cam.name}" class="tree-name-input" onchange="updateCameraName(${index}, this.value)">
            </div>
            <div style="color: #94a3b8; font-size: 10px; margin-bottom: 8px;">${state.cameraModels[cam.modelId ?? '']?.name ?? 'Custom'}</div>
            <select class="tree-select" onchange="updateCameraMode(${index}, this.value)">
                <option value="all"     ${cam.displayMode === 'all'     ? 'selected' : ''}>Pełne DORI</option>
                <option value="compact" ${cam.displayMode === 'compact' ? 'selected' : ''}>Poglądowy (1.5m)</option>
                <option value="hidden"  ${cam.displayMode === 'hidden'  ? 'selected' : ''}>Ukryta</option>
            </select>
        `;
        tree.appendChild(item);
    });
}

// Funkcje globalnie dostępne dla dynamicznych onclick w szablonach HTML
window.selectObjectFromTree = function (type: string, index: number): void {
    setMode('none');
    state.selectedObjects = [{ type: type as 'wall' | 'camera' | 'zone', index }];
    updateProjectTree();
    syncStatusBarWithSelection();
    draw();
};

window.updateCameraName = function (index: number, newName: string): void {
    if (state.placedCameras[index]) {
        saveState();
        state.placedCameras[index].name = newName;
        saveToLocalStorage();
    }
};

window.updateCameraMode = function (index: number, mode: string): void {
    if (state.placedCameras[index]) {
        saveState();
        state.placedCameras[index].displayMode = mode as ICamera['displayMode'];
        saveToLocalStorage();
        draw();
    }
};

// --- MAGAZYN KAMER ---

function initCameraSelect(): void {
    const sel = document.getElementById('camera-select') as HTMLSelectElement;
    if (!sel) return;
    sel.innerHTML = '';

    state.favoriteCameras.forEach(id => {
        if (state.cameraModels[id]) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.innerText = '⭐ ' + state.cameraModels[id].name;
            opt.style.color = '#f59e0b';
            sel.appendChild(opt);
        }
    });

    if (state.favoriteCameras.length > 0) {
        const separator = document.createElement('option');
        separator.disabled = true;
        separator.innerText = '──────────';
        sel.appendChild(separator);
    }

    for (const [id, model] of Object.entries(state.cameraModels)) {
        if (!state.favoriteCameras.includes(id)) {
            const opt = document.createElement('option');
            opt.value = id;
            opt.innerText = model.name;
            sel.appendChild(opt);
        }
    }

    sel.value = state.selectedCameraModel;
    sel.onchange = (e: Event) => {
        state.selectedCameraModel = (e.target as HTMLSelectElement).value;
        draw();
    };
}

function openCameraManager(): void {
    (document.getElementById('camera-modal') as HTMLElement).style.display = 'flex';
    renderDatabaseList();
}

function closeCameraManager(): void {
    (document.getElementById('camera-modal') as HTMLElement).style.display = 'none';
}

function renderDatabaseList(): void {
    const listEl = document.getElementById('camera-database-list')!;
    listEl.innerHTML = '';

    const favIds   = Object.keys(state.cameraModels).filter(id =>  state.favoriteCameras.includes(id));
    const otherIds = Object.keys(state.cameraModels).filter(id => !state.favoriteCameras.includes(id));

    const renderItem = (id: string, model: typeof state.cameraModels[string], isFav: boolean) => {
        const item = document.createElement('div');
        item.className = 'db-list-item';

        let actions: string;
        if (model.isDefault) {
            actions = `<span style="color: #64748b; font-size: 10px; min-width: 50px; text-align: right;">Domyślna</span>`;
        } else {
            actions = `
                <div style="display:flex; gap: 5px;">
                    <button onclick="editCustomCamera('${id}')" class="btn-edit-small" title="Edytuj">✏️</button>
                    <button onclick="deleteCustomCamera('${id}')" class="btn-delete-small" title="Usuń">🗑️</button>
                </div>
            `;
        }

        const starBtn = `<button onclick="toggleFavorite('${id}')" class="btn-star ${isFav ? 'active' : ''}" title="Dodaj do ulubionych">${isFav ? '⭐' : '☆'}</button>`;

        item.innerHTML = `
            <div style="display: flex; align-items: center; gap: 12px;">
                ${starBtn}
                <div>
                    <strong style="${isFav ? 'color: #f59e0b;' : ''}">${model.name}</strong><br>
                    <span style="font-size: 11px; color: #94a3b8;">FOV: ${model.fov}°, Max: ${model.range / 100}m</span>
                </div>
            </div>
            ${actions}
        `;
        listEl.appendChild(item);
    };

    if (favIds.length > 0) {
        const header = document.createElement('div');
        header.innerHTML = '<strong style="color:#f59e0b; font-size: 11px; text-transform: uppercase;">Ulubione Modele</strong>';
        header.style.marginBottom = '5px';
        listEl.appendChild(header);
        favIds.forEach(id => renderItem(id, state.cameraModels[id], true));
        const sep = document.createElement('hr');
        sep.style.cssText = 'border: none; border-top: 1px dashed #334155; margin: 15px 0 10px 0;';
        listEl.appendChild(sep);
    }

    const header2 = document.createElement('div');
    header2.innerHTML = '<strong style="color:#64748b; font-size: 11px; text-transform: uppercase;">Pozostałe Modele</strong>';
    header2.style.marginBottom = '5px';
    listEl.appendChild(header2);
    otherIds.forEach(id => renderItem(id, state.cameraModels[id], false));
}

window.editCustomCamera = function (id: string): void {
    const model = state.cameraModels[id];
    if (!model || model.isDefault) return;
    state.editingCameraId = id;

    (document.getElementById('new-cam-name')   as HTMLInputElement).value = model.name;
    (document.getElementById('new-cam-fov')    as HTMLInputElement).value = String(model.fov);
    (document.getElementById('new-cam-range')  as HTMLInputElement).value = String(model.range / 100);
    (document.getElementById('new-cam-dori-i') as HTMLInputElement).value = String(model.dori[0] / 100);
    (document.getElementById('new-cam-dori-r') as HTMLInputElement).value = String(model.dori[1] / 100);
    (document.getElementById('new-cam-dori-o') as HTMLInputElement).value = String(model.dori[2] / 100);
    (document.getElementById('new-cam-type')   as HTMLSelectElement).value = model.type;

    const formTitle   = document.getElementById('form-title')!;
    const btnCancelEdit = document.getElementById('btn-cancel-edit') as HTMLElement;
    const btnSaveCam  = document.getElementById('btn-save-cam')!;
    formTitle.innerText   = '✏️ Edytujesz model';
    formTitle.style.color = '#3b82f6';
    btnCancelEdit.style.display = 'block';
    btnSaveCam.innerText  = '💾 Zapisz Zmiany';
    btnSaveCam.classList.add('btn-update-mode');
};

function cancelEdit(): void {
    state.editingCameraId = null;
    const formTitle    = document.getElementById('form-title')!;
    const btnCancelEdit = document.getElementById('btn-cancel-edit') as HTMLElement;
    const btnSaveCam   = document.getElementById('btn-save-cam')!;
    formTitle.innerText   = 'Dodaj Własną Kamerę';
    formTitle.style.color = '#38bdf8';
    btnCancelEdit.style.display = 'none';
    btnSaveCam.innerText  = '➕ Zapisz Model do Bazy';
    btnSaveCam.classList.remove('btn-update-mode');
    document.querySelectorAll<HTMLInputElement>('.form-grid input').forEach(inp => { inp.value = ''; });
}

async function saveCustomCamera(): Promise<void> {
    const rawName = (document.getElementById('new-cam-name') as HTMLInputElement).value;
    const name    = rawName.replace(/[<>"{};/]/g, '').trim();
    const fov     = parseFloat((document.getElementById('new-cam-fov')    as HTMLInputElement).value);
    const range   = parseFloat((document.getElementById('new-cam-range')  as HTMLInputElement).value);
    const doriI   = parseFloat((document.getElementById('new-cam-dori-i') as HTMLInputElement).value);
    const doriR   = parseFloat((document.getElementById('new-cam-dori-r') as HTMLInputElement).value);
    const doriO   = parseFloat((document.getElementById('new-cam-dori-o') as HTMLInputElement).value);
    const type    = (document.getElementById('new-cam-type') as HTMLSelectElement).value as 'wall' | 'ceiling';

    if (!name) { alert('Nazwa zawierała niedozwolone znaki lub jest pusta.'); return; }
    if (isNaN(fov) || isNaN(range) || isNaN(doriI) || isNaN(doriR) || isNaN(doriO)) {
        alert('Wypełnij poprawnie wszystkie parametry liczbowe!'); return;
    }
    if (fov < 1 || fov > 360)       { alert('Kąt widzenia (FOV) musi wynosić od 1 do 360 stopni.'); return; }
    if (range < 1 || range > 5000)  { alert('Zasięg maksymalny musi wynosić od 1 do 5000 metrów.'); return; }
    if (doriI >= doriR || doriR >= doriO || doriO >= range) {
        alert('Błąd logiki: Wartości muszą rosnąć! (Identyfikacja < Rozpoznanie < Obserwacja < Zasięg)'); return;
    }

    const btnSaveCam = document.getElementById('btn-save-cam') as HTMLButtonElement;
    if (btnSaveCam) { btnSaveCam.innerText = '⏳ Przetwarzanie...'; btnSaveCam.disabled = true; btnSaveCam.style.opacity = '0.5'; }

    const camId  = state.editingCameraId ?? ('custom_' + Date.now());
    const newCam = {
        name, fov, range: range * 100,
        dori: [doriI * 100, doriR * 100, doriO * 100, range * 100] as [number, number, number, number],
        type,
    };

    await API.saveCustomCamera(camId, newCam);
    await loadCameraDatabase();

    if (state.editingCameraId) {
        state.placedCameras.forEach(c => {
            if (c.modelId === state.editingCameraId) {
                c.fov = newCam.fov; c.range = newCam.range;
                c.dori = [...newCam.dori]; c.type = newCam.type;
            }
        });
        saveToLocalStorage();
        draw();
    }

    renderDatabaseList();
    initCameraSelect();
    cancelEdit();
    if (btnSaveCam) { btnSaveCam.disabled = false; btnSaveCam.style.opacity = '1'; }
}

window.deleteCustomCamera = async function (id: string): Promise<void> {
    if (confirm('Usunąć ten model z bazy? Kamery tego typu już postawione na mapie zostaną zachowane, ale model zniknie z magazynu.')) {
        if (state.editingCameraId === id) cancelEdit();
        await API.deleteCustomCamera(id);
        await loadCameraDatabase();
        renderDatabaseList();
        initCameraSelect();
        if (state.selectedCameraModel === id) state.selectedCameraModel = 'cam_2_8mm';
        draw();
    }
};

window.toggleFavorite = async function (id: string): Promise<void> {
    try {
        await API.toggleFavoriteCamera(id);
        await loadCameraDatabase();
        renderDatabaseList();
        initCameraSelect();
        draw();
    } catch (error) {
        console.error('Błąd zmiany ulubionych:', error);
        alert('Nie udało się zapisać ulubionych. Spróbuj ponownie.');
    }
};

// Wymiary strefy — wpisanie z klawiatury
function applyExactZone(): void {
    const valW = inputZoneW.value.replace(/,/g, '.');
    const valH = inputZoneH.value.replace(/,/g, '.');
    const wMeters = parseFloat(valW), hMeters = parseFloat(valH);
    if (isNaN(wMeters) || isNaN(hMeters) || wMeters <= 0 || hMeters <= 0) return;

    const w = wMeters * PIXELS_PER_METER;
    const h = hMeters * PIXELS_PER_METER;

    if (state.isDrawing && (state.currentMode === 'draw-obstacle' || state.currentMode === 'draw-zone')) {
        const dirX = (state.currentPoint!.x >= state.startPoint!.x) ? 1 : -1;
        const dirY = (state.currentPoint!.y >= state.startPoint!.y) ? 1 : -1;
        const minX = state.startPoint!.x + (dirX === -1 ? -w : 0);
        const minY = state.startPoint!.y + (dirY === -1 ? -h : 0);
        const zType = (state.currentMode === 'draw-obstacle') ? 'obstacle' : (selectZoneType?.value ?? 'poi_high');
        saveState();
        state.zones.push({ x: minX, y: minY, width: w, height: h, type: zType as IZone['type'] });
        saveToLocalStorage();
        resetDrawingState();
    } else if (state.currentMode === 'none' && state.selectedObjects.length === 1 && state.selectedObjects[0].type === 'zone') {
        saveState();
        state.zones[state.selectedObjects[0].index].width  = w;
        state.zones[state.selectedObjects[0].index].height = h;
        saveToLocalStorage();
        draw();
    }
}

// Podkłady mapowe
function deleteSelectedBackground(): void {
    if (state.selectedImageId !== null) {
        if (confirm('Czy na pewno usunąć wybrane zdjęcie?')) {
            state.backgroundImages = state.backgroundImages.filter(i => i.id !== state.selectedImageId);
            state.hasBg = state.backgroundImages.length > 0;
            state.selectedImageId = null;
            btnCalibrate.style.display = 'none';
            draw();
        }
    } else {
        alert("Najpierw wejdź w 'Tryb Edycji Tła' i kliknij na zdjęcie, które chcesz usunąć.");
    }
}

function startCalibration(): void {
    if (state.selectedImageId !== null) {
        state.isCalibrating = true;
        btnCalibrate.classList.add('active');
        alert('Zaznacz odcinek na mapie trzymając LEWY przycisk myszy.');
    }
}

// =====================================================================
// ZDARZENIA CANVASA
// =====================================================================

canvas.addEventListener('mousedown', (e: MouseEvent) => {
    // Panning (środkowy przycisk lub Spacja + LPM)
    if (e.button === 1 || (e.button === 0 && state.isSpacePressed)) {
        state.isPanning = true;
        state.panStart  = { x: e.clientX - state.offsetX, y: e.clientY - state.offsetY };
        canvas.style.cursor = 'grabbing';
        return;
    }

    // Kalibracja
    if (state.isCalibrating && e.button === 0) {
        const wp = getMousePos(e);
        state.startPoint   = { x: wp.worldX, y: wp.worldY };
        state.currentPoint = { x: wp.worldX, y: wp.worldY };
        return;
    }

    // Tryb edycji tła
    if (state.currentMode === 'bg-edit' && e.button === 0 && state.backgroundImages.length > 0) {
        const wp = getMousePos(e);
        const x = wp.worldX, y = wp.worldY;
        const hSize = 8 / state.scale;

        if (state.selectedImageId !== null) {
            const img = state.backgroundImages.find(i => i.id === state.selectedImageId);
            if (img) {
                const sW = img.w * img.scale, sH = img.h * img.scale;
                const cx = img.x + sW / 2,    cy = img.y + sH / 2;
                const rad = -img.rotation * Math.PI / 180;
                const dx = x - cx, dy = y - cy;
                const rp = { x: dx * Math.cos(rad) - dy * Math.sin(rad) + cx, y: dx * Math.sin(rad) + dy * Math.cos(rad) + cy };

                if (Math.hypot(rp.x - cx, rp.y - (img.y - 25 / state.scale)) < hSize * 1.5) {
                    state.isRotatingBg = true; state.dragStartPos = { x, y }; state.bgInitialRotation = img.rotation; return;
                }
                const chk = (hx: number, hy: number, hn: string): boolean => {
                    if (Math.hypot(rp.x - hx, rp.y - hy) < hSize * 1.5) {
                        state.isResizingBg = true; state.resizeHandle = hn;
                        state.dragStartPos = { x, y }; state.bgInitialState = { ...img };
                        return true;
                    }
                    return false;
                };
                if (chk(img.x, img.y, 'tl') || chk(img.x + sW, img.y, 'tr') || chk(img.x, img.y + sH, 'bl') || chk(img.x + sW, img.y + sH, 'br')) return;
                if (rp.x > img.x && rp.x < img.x + sW && rp.y > img.y && rp.y < img.y + sH) {
                    state.isDraggingBg = true; state.dragStartPos = { x, y }; state.bgInitialOffset = { x: img.x, y: img.y };
                    canvas.style.cursor = 'grabbing'; return;
                }
            }
        }

        for (let i = state.backgroundImages.length - 1; i >= 0; i--) {
            const img = state.backgroundImages[i];
            const sW = img.w * img.scale, sH = img.h * img.scale;
            const cx = img.x + sW / 2, cy = img.y + sH / 2;
            const rad = -img.rotation * Math.PI / 180;
            const dx = x - cx, dy = y - cy;
            const rp = { x: dx * Math.cos(rad) - dy * Math.sin(rad) + cx, y: dx * Math.sin(rad) + dy * Math.cos(rad) + cy };
            if (rp.x > img.x && rp.x < img.x + sW && rp.y > img.y && rp.y < img.y + sH) {
                state.selectedImageId = img.id;
                btnBgEdit.classList.add('active');
                bgOpacity.value = String(img.opacity * 100);
                bgOpacityVal.innerText = `${img.opacity * 100}%`;
                btnCalibrate.style.display = 'inline-block';
                state.isDraggingBg = true; state.dragStartPos = { x, y }; state.bgInitialOffset = { x: img.x, y: img.y };
                canvas.style.cursor = 'grabbing'; draw(); return;
            }
        }
        state.selectedImageId = null;
        btnBgEdit.classList.remove('active');
        btnCalibrate.style.display = 'none';
        draw(); return;
    }

    if (e.button !== 0 || state.currentMode === 'bg-edit') return;

    const wp = getMousePos(e);
    const x = wp.worldX, y = wp.worldY;
    const hSize = 8 / state.scale;

    // USUWANIE
    if (state.currentMode === 'erase') {
        if (state.hoveredObj) {
            saveState();
            if      (state.hoveredObj.type === 'camera') state.placedCameras.splice(state.hoveredObj.index, 1);
            else if (state.hoveredObj.type === 'wall')   state.walls.splice(state.hoveredObj.index, 1);
            else if (state.hoveredObj.type === 'zone')   state.zones.splice(state.hoveredObj.index, 1);
            state.hoveredObj = null; updateHover(); saveToLocalStorage(); draw();
        }
        return;
    }

    // EDYCJA UCHWYTÓW
    if (state.currentMode === 'none') {
        for (const sel of state.selectedObjects) {
            if (sel.type === 'wall') {
                const w = state.walls[sel.index];
                if (Math.hypot(x - w.x1, y - w.y1) < hSize) { saveState(); state.activeHandle = { ...sel, node: 'p1' }; return; }
                if (Math.hypot(x - w.x2, y - w.y2) < hSize) { saveState(); state.activeHandle = { ...sel, node: 'p2' }; return; }
            } else if (sel.type === 'zone') {
                const z = state.zones[sel.index];
                if (Math.hypot(x - z.x,            y - z.y)            < hSize) { saveState(); state.activeHandle = { ...sel, node: 'tl' }; return; }
                if (Math.hypot(x - (z.x + z.width), y - z.y)            < hSize) { saveState(); state.activeHandle = { ...sel, node: 'tr' }; return; }
                if (Math.hypot(x - z.x,             y - (z.y + z.height)) < hSize) { saveState(); state.activeHandle = { ...sel, node: 'bl' }; return; }
                if (Math.hypot(x - (z.x + z.width), y - (z.y + z.height)) < hSize) { saveState(); state.activeHandle = { ...sel, node: 'br' }; return; }
            } else if (sel.type === 'camera') {
                const c = state.placedCameras[sel.index];
                const hx = c.x + Math.cos(c.angle * Math.PI / 180) * (20 / state.scale);
                const hy = c.y + Math.sin(c.angle * Math.PI / 180) * (20 / state.scale);
                if (Math.hypot(x - hx, y - hy) < hSize * 1.5) { saveState(); state.activeHandle = { ...sel, node: 'angle' }; return; }
            }
        }

        // KLIKNIĘCIE W OBIEKT
        let clickedObj: typeof state.selectedObjects[0] | null = null;
        let minRecord = 15 / state.scale;
        state.placedCameras.forEach((c, idx) => { if (Math.hypot(x - c.x, y - c.y) < 18 / state.scale) clickedObj = { type: 'camera', index: idx }; });
        if (!clickedObj) state.zones.forEach((z, idx) => { if (x > z.x && x < z.x + z.width && y > z.y && y < z.y + z.height) clickedObj = { type: 'zone', index: idx }; });
        if (!clickedObj) state.walls.forEach((w, idx) => {
            const l2 = Math.pow(w.x2 - w.x1, 2) + Math.pow(w.y2 - w.y1, 2);
            const t  = Math.max(0, Math.min(1, ((x - w.x1) * (w.x2 - w.x1) + (y - w.y1) * (w.y2 - w.y1)) / l2));
            const px = w.x1 + t * (w.x2 - w.x1), py = w.y1 + t * (w.y2 - w.y1);
            if (Math.hypot(x - px, y - py) < minRecord) { clickedObj = { type: 'wall', index: idx }; minRecord = Math.hypot(x - px, y - py); }
        });

        if (clickedObj) {
            const co = clickedObj as typeof state.selectedObjects[0];
            const wasAlreadySelected = state.selectedObjects.some(o => o.type === co.type && o.index === co.index);

            if (!wasAlreadySelected) {
                if (!state.isCtrlPressed) state.selectedObjects = [];
                state.selectedObjects.push(co);
                syncStatusBarWithSelection(); draw();
                if (!document.getElementById('project-sidebar')!.classList.contains('closed')) updateProjectTree();
                return; // Zapobiega przeciąganiu przy pierwszym kliknięciu (tylko zaznacza)
            }

            if (state.isAltPressed) cloneSelectedObjects();
            saveState();
            state.dragInitialState = state.selectedObjects.map(sel => {
                if (sel.type === 'wall')   return { ...state.walls[sel.index] };
                if (sel.type === 'camera') return { ...state.placedCameras[sel.index] };
                if (sel.type === 'zone')   return { ...state.zones[sel.index] };
                return null;
            });
            state.isDraggingObj = true;
            state.dragStartPos  = { x, y };
            syncStatusBarWithSelection(); draw();
            if (!document.getElementById('project-sidebar')!.classList.contains('closed')) updateProjectTree();
            return;
        }

        // MARQUEE
        state.selectedObjects = []; syncStatusBarWithSelection(); draw();
        state.isSelecting   = true;
        state.selectionStart = { x, y };
        state.currentPoint   = { x, y };
        if (!document.getElementById('project-sidebar')!.classList.contains('closed')) updateProjectTree();
        return;
    }

    // RYSOWANIE
    const pos = calculateDrawInteraction(e);
    if (state.currentMode === 'draw') {
        if (!state.isDrawing) {
            state.isDrawing = true; state.startPoint = pos; state.currentPoint = pos;
            statusBar.style.display = 'flex';
            Array.from(statusBar.children).forEach(c => { if ((c as HTMLElement).id !== 'zone-input-group') (c as HTMLElement).style.display = ''; });
            zoneInputGroup.style.display = 'none';
            inputLength.value = '';
            setTimeout(() => inputLength.focus(), 10);
        } else {
            if (Math.hypot(pos.x - state.startPoint!.x, pos.y - state.startPoint!.y) > 5 / state.scale) {
                const wallType = selectWallType?.value ?? 'wall';
                const newWall: IWall = { x1: state.startPoint!.x, y1: state.startPoint!.y, x2: pos.x, y2: pos.y, type: wallType as IWall['type'] };
                
                // Walidacja dla drzwi/okien - muszą być stawiane tylko na ścianach
                if (validateDoorWindowPlacement(newWall)) {
                    saveState();
                    splitWallIfIntersecting(newWall);
                    saveToLocalStorage();
                    state.startPoint = { ...pos };
                    inputLength.value = ''; inputLength.focus();
                } else {
                    // Blokada rysowania drzwi/okna w pustej przestrzeni
                    resetDrawingState();
                    if (wallType !== 'wall') {
                        alert('Drzwi i okna mogą być stawiane tylko na istniejących ścianach.');
                    }
                }
            }
        }
    } else if (state.currentMode === 'simulate') {
        if (state.placementStep === 'pos') {
            state.placementStep = 'angle';
        } else if (state.placementStep === 'angle') {
            const activeModel = state.cameraModels[state.selectedCameraModel];
            saveState();
            state.placedCameras.push({
                x: state.cameraPos.x, y: state.cameraPos.y, angle: state.cameraAngle,
                fov:  activeModel.fov,  range: activeModel.range,
                dori: activeModel.dori, modelId: state.selectedCameraModel,
                type: activeModel.type, displayMode: 'compact',
                name: `Kamera ${state.placedCameras.length + 1}`,
            });
            saveToLocalStorage();
            state.placementStep = 'pos';
        }
    } else if (state.currentMode === 'draw-obstacle' || state.currentMode === 'draw-zone') {
        if (!state.isDrawing) {
            state.isDrawing = true; state.startPoint = pos; state.currentPoint = pos;
            statusBar.style.display = 'flex';
            Array.from(statusBar.children).forEach(c => { if ((c as HTMLElement).id !== 'zone-input-group') (c as HTMLElement).style.display = 'none'; });
            zoneInputGroup.style.display = 'inline-block';
            inputZoneW.value = ''; inputZoneH.value = '';
            setTimeout(() => inputZoneW.focus(), 10);
        } else {
            saveState();
            const minX = Math.min(state.startPoint!.x, pos.x);
            const minY = Math.min(state.startPoint!.y, pos.y);
            const w    = Math.abs(pos.x - state.startPoint!.x);
            const h    = Math.abs(pos.y - state.startPoint!.y);
            const zType = (state.currentMode === 'draw-obstacle') ? 'obstacle' : (selectZoneType?.value ?? 'poi_high');
            if (w > 10 / state.scale && h > 10 / state.scale) {
                state.zones.push({ x: minX, y: minY, width: w, height: h, type: zType as IZone['type'] });
                saveToLocalStorage();
            }
            resetDrawingState();
        }
    }
    draw();
});

canvas.addEventListener('mousemove', (e: MouseEvent) => {
    if (state.isPanning) { state.offsetX = e.clientX - state.panStart.x; state.offsetY = e.clientY - state.panStart.y; draw(); return; }

    if (state.isCalibrating && state.startPoint) {
        const wp = getMousePos(e);
        state.currentPoint = { x: wp.worldX, y: wp.worldY };
        draw(); return;
    }

    if (state.currentMode === 'bg-edit' && state.selectedImageId !== null) {
        const wp = getMousePos(e);
        const x = wp.worldX, y = wp.worldY;
        const img = state.backgroundImages.find(i => i.id === state.selectedImageId);
        if (!img) return;

        if (state.isDraggingBg) {
            img.x = state.bgInitialOffset.x + (x - state.dragStartPos!.x);
            img.y = state.bgInitialOffset.y + (y - state.dragStartPos!.y);
            draw(); return;
        }
        if (state.isRotatingBg) {
            const cx = img.x + (img.w * img.scale) / 2, cy = img.y + (img.h * img.scale) / 2;
            const currentAngle = Math.atan2(y - cy, x - cx) * 180 / Math.PI;
            const startAngle   = Math.atan2(state.dragStartPos!.y - cy, state.dragStartPos!.x - cx) * 180 / Math.PI;
            let newRotation    = state.bgInitialRotation + (currentAngle - startAngle);
            if (state.isShiftPressed) newRotation = Math.round(newRotation / 15) * 15;
            img.rotation = newRotation; draw(); return;
        }
        if (state.isResizingBg && state.bgInitialState) {
            const cx = state.bgInitialState.x + (state.bgInitialState.w * state.bgInitialState.scale) / 2;
            const cy = state.bgInitialState.y + (state.bgInitialState.h * state.bgInitialState.scale) / 2;
            const initialDist = Math.hypot(state.dragStartPos!.x - cx, state.dragStartPos!.y - cy);
            const currentDist = Math.hypot(x - cx, y - cy);
            if (initialDist > 0) {
                const ratio = currentDist / initialDist;
                img.scale = Math.max(0.05, Math.min(20.0, state.bgInitialState.scale * ratio));
                img.x = cx - (img.w * img.scale) / 2;
                img.y = cy - (img.h * img.scale) / 2;
            }
            draw(); return;
        }
    }

    const pos    = calculateDrawInteraction(e);
    const wp     = getMousePos(e);
    state.currentPoint  = pos;
    state.lastMousePos  = { x: wp.worldX, y: wp.worldY };

    // Edycja uchwytów
    if (state.activeHandle) {
        if (state.activeHandle.type === 'wall') {
            const w = state.walls[state.activeHandle.index];
            const basePt = state.activeHandle.node === 'p1' ? { x: w.x2, y: w.y2 } : { x: w.x1, y: w.y1 };
            const pt = calculateEditInteraction(e, basePt);
            if (state.activeHandle.node === 'p1') { w.x1 = pt.x; w.y1 = pt.y; }
            if (state.activeHandle.node === 'p2') { w.x2 = pt.x; w.y2 = pt.y; }
        } else if (state.activeHandle.type === 'zone') {
            const pt = calculateEditInteraction(e, null);
            const z  = state.zones[state.activeHandle.index];
            if (state.activeHandle.node === 'tl') { z.width  += z.x - pt.x; z.height += z.y - pt.y; z.x = pt.x; z.y = pt.y; }
            if (state.activeHandle.node === 'tr') { z.width   = pt.x - z.x; z.height += z.y - pt.y; z.y = pt.y; }
            if (state.activeHandle.node === 'bl') { z.width  += z.x - pt.x; z.x = pt.x; z.height = pt.y - z.y; }
            if (state.activeHandle.node === 'br') { z.width   = pt.x - z.x; z.height = pt.y - z.y; }
        } else if (state.activeHandle.type === 'camera') {
            const pt = calculateEditInteraction(e, null);
            const c = state.placedCameras[state.activeHandle.index];
            let angle = Math.atan2(pt.y - c.y, pt.x - c.x) * 180 / Math.PI;
            if (state.isShiftPressed) angle = Math.round(angle / 15) * 15;
            if (angle < 0) angle += 360;
            c.angle = angle;
        }
        syncStatusBarWithSelection(); draw(); return;
    }

    // Przesuwanie grupowe
    if (state.isDraggingObj && state.dragStartPos) {
        const isSingle = state.selectedObjects.length === 1;
        const rawDx = wp.worldX - state.dragStartPos.x;
        const rawDy = wp.worldY - state.dragStartPos.y;

        let snappedDx = rawDx, snappedDy = rawDy;
        if (!state.isShiftPressed) {
            const gridSize = PIXELS_PER_METER / 10;
            snappedDx = Math.round(rawDx / gridSize) * gridSize;
            snappedDy = Math.round(rawDy / gridSize) * gridSize;
        }

        state.selectedObjects.forEach((obj, i) => {
            const init = state.dragInitialState[i];
            if (!init) return;
            const handle = obj.handle ?? 'center';

            if (isSingle && obj.type === 'camera') {
                const initCam = init as ICamera;
                const snapped = getSnappedCameraPosition(initCam.x + rawDx, initCam.y + rawDy);
                state.placedCameras[obj.index].x = snapped.x;
                state.placedCameras[obj.index].y = snapped.y;
            } else if (isSingle && obj.type === 'wall' && (handle === 'p1' || handle === 'p2')) {
                const initWall = init as IWall;
                let targetX = pos.x, targetY = pos.y;
                if (state.isShiftPressed) {
                    const rawX = wp.worldX, rawY = wp.worldY;
                    const anchorX = handle === 'p1' ? initWall.x2 : initWall.x1;
                    const anchorY = handle === 'p1' ? initWall.y2 : initWall.y1;
                    const angle = Math.round(Math.atan2(rawY - anchorY, rawX - anchorX) / (Math.PI / 12)) * (Math.PI / 12);
                    const dist  = Math.hypot(rawX - anchorX, rawY - anchorY);
                    targetX = anchorX + Math.cos(angle) * dist;
                    targetY = anchorY + Math.sin(angle) * dist;
                }
                if (handle === 'p1') { state.walls[obj.index].x1 = targetX; state.walls[obj.index].y1 = targetY; }
                if (handle === 'p2') { state.walls[obj.index].x2 = targetX; state.walls[obj.index].y2 = targetY; }
            } else if (isSingle && obj.type === 'zone' && handle !== 'center') {
                if (obj.type === 'zone') {
                    state.zones[obj.index].x = (init as IZone).x + snappedDx;
                    state.zones[obj.index].y = (init as IZone).y + snappedDy;
                }
            } else {
                if (obj.type === 'wall') {
                    const iw = init as IWall;
                    state.walls[obj.index].x1 = iw.x1 + snappedDx; state.walls[obj.index].y1 = iw.y1 + snappedDy;
                    state.walls[obj.index].x2 = iw.x2 + snappedDx; state.walls[obj.index].y2 = iw.y2 + snappedDy;
                } else if (obj.type === 'zone') {
                    state.zones[obj.index].x = (init as IZone).x + snappedDx;
                    state.zones[obj.index].y = (init as IZone).y + snappedDy;
                } else if (obj.type === 'camera') {
                    state.placedCameras[obj.index].x = (init as ICamera).x + snappedDx;
                    state.placedCameras[obj.index].y = (init as ICamera).y + snappedDy;
                }
            }
        });
        syncStatusBarWithSelection(); draw(); return;
    }

    if (state.isSelecting) { state.currentPoint = { x: wp.worldX, y: wp.worldY }; draw(); return; }

    updateHover();

    if (state.currentMode === 'draw' && state.isDrawing) {
        const dx = pos.x - state.startPoint!.x, dy = pos.y - state.startPoint!.y;
        valLength.innerText = (Math.hypot(dx, dy) / PIXELS_PER_METER).toFixed(2);
        let ang = Math.round(Math.atan2(dy, dx) * 180 / Math.PI);
        valAngle.innerText = String(ang < 0 ? ang + 360 : ang);
    }

    if (state.currentMode === 'simulate') {
        if (state.placementStep === 'pos') {
            state.cameraPos = getSnappedCameraPosition(pos.x, pos.y);
        } else if (state.placementStep === 'angle') {
            state.cameraAngle = Math.atan2(pos.y - state.cameraPos.y, pos.x - state.cameraPos.x) * 180 / Math.PI;
            if (state.cameraAngle < 0) state.cameraAngle += 360;
        }
    }
    draw();
});

window.addEventListener('mouseup', (e: MouseEvent) => {
    if (state.isPanning) { state.isPanning = false; canvas.style.cursor = state.isSpacePressed ? 'grab' : 'crosshair'; saveToLocalStorage(); }

    if (state.isDraggingBg || state.isRotatingBg || state.isResizingBg) {
        state.isDraggingBg = false; state.isRotatingBg = false; state.isResizingBg = false; state.resizeHandle = null;
        if (state.currentMode === 'bg-edit') canvas.style.cursor = 'crosshair';
        return;
    }

    if (state.isCalibrating && state.startPoint && state.currentPoint) {
        state.isCalibrating = false;
        const distPx = Math.hypot(state.currentPoint.x - state.startPoint.x, state.currentPoint.y - state.startPoint.y);
        state.startPoint = null; state.currentPoint = null; draw();

        if (distPx > 20 / state.scale && state.selectedImageId !== null) {
            const img = state.backgroundImages.find(i => i.id === state.selectedImageId);
            if (img) {
                const actualMeters = prompt('📐 KALIBRACJA SKALI:\nPodaj rzeczywistą długość narysowanego odcinka w metrach (np. 5.5):', '5');
                if (actualMeters !== null) {
                    const m = parseFloat(actualMeters.replace(',', '.'));
                    if (!isNaN(m) && m > 0) {
                        img.scale *= (m * PIXELS_PER_METER) / distPx;
                        alert('Skala zdjęcia dopasowana!');
                    }
                }
            }
        }
        btnCalibrate.classList.remove('active');
        return;
    }

    if (state.activeHandle || state.isDraggingObj) {
        state.activeHandle = null;
        state.isDraggingObj = false;
        saveToLocalStorage();
        syncStatusBarWithSelection();
        draw();
        return;
    }

    if (state.isSelecting) {
        state.isSelecting = false;
        if (!state.selectionStart || !state.currentPoint) return;

        const minX = Math.min(state.selectionStart.x, state.currentPoint.x);
        const maxX = Math.max(state.selectionStart.x, state.currentPoint.x);
        const minY = Math.min(state.selectionStart.y, state.currentPoint.y);
        const maxY = Math.max(state.selectionStart.y, state.currentPoint.y);

        const newSelection: typeof state.selectedObjects = [];
        state.placedCameras.forEach((cam, i) => { if (cam.x >= minX && cam.x <= maxX && cam.y >= minY && cam.y <= maxY) newSelection.push({ type: 'camera', index: i }); });
        state.walls.forEach((w, i) => {
            if ((w.x1 >= minX && w.x1 <= maxX && w.y1 >= minY && w.y1 <= maxY) ||
                (w.x2 >= minX && w.x2 <= maxX && w.y2 >= minY && w.y2 <= maxY)) newSelection.push({ type: 'wall', index: i });
        });
        state.zones.forEach((z, i) => {
            if (z.x < maxX && z.x + z.width > minX && z.y < maxY && z.y + z.height > minY) newSelection.push({ type: 'zone', index: i });
        });

        if (state.isCtrlPressed) {
            newSelection.forEach(ns => { if (!state.selectedObjects.find(so => so.type === ns.type && so.index === ns.index)) state.selectedObjects.push(ns); });
        } else {
            state.selectedObjects = newSelection;
        }
        state.selectionStart = null; draw();
        if (!document.getElementById('project-sidebar')!.classList.contains('closed')) updateProjectTree();
    }
});

canvas.addEventListener('contextmenu', (e: MouseEvent) => {
    e.preventDefault();
    if (state.currentMode === 'draw' && state.isDrawing) resetDrawingState();
    else if (state.currentMode === 'simulate') {
        if (state.placementStep === 'angle') {
            state.placementStep = 'pos';
        } else if (state.placementStep === 'pos') {
            setMode('none');
        }
    }
    draw();
});

canvas.addEventListener('wheel', (e: WheelEvent) => {
    e.preventDefault();
    const rect  = canvas.getBoundingClientRect();
    const mouseX = e.clientX - rect.left, mouseY = e.clientY - rect.top;
    const wheel  = e.deltaY < 0 ? 1 : -1;
    let newScale = state.scale * Math.exp(wheel * 0.1);
    newScale = Math.min(Math.max(0.1, newScale), 5);
    state.offsetX = mouseX - (mouseX - state.offsetX) * (newScale / state.scale);
    state.offsetY = mouseY - (mouseY - state.offsetY) * (newScale / state.scale);
    state.scale   = newScale;
    const wp = getMousePos(e as unknown as MouseEvent);
    state.lastMousePos = { x: wp.worldX, y: wp.worldY };
    updateHover(); draw(); saveToLocalStorage();
}, { passive: false });

// =====================================================================
// ZDARZENIA KLAWIATURY
// =====================================================================

window.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Shift')   { state.isShiftPressed = true; draw(); }
    if (e.key === 'Control') { state.isCtrlPressed  = true; updateHover(); draw(); }
    if (e.key === 'Alt')     { e.preventDefault(); state.isAltPressed = true; }

    const target = e.target as HTMLElement;
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') return;

    if (e.key === 'Escape') resetDrawingState();
    if (e.ctrlKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
    if (e.ctrlKey && (e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo(); }

    if (e.code === 'Space') {
        e.preventDefault();
        setMode(state.currentMode === 'none' ? state.lastActiveTool : 'none');
    }

    if ((e.key === 'Delete' || e.key === 'Backspace') && state.selectedObjects.length > 0) {
        saveState();
        const camsToDelete  = state.selectedObjects.filter(o => o.type === 'camera').map(o => o.index).sort((a, b) => b - a);
        const wallsToDelete = state.selectedObjects.filter(o => o.type === 'wall').map(o => o.index).sort((a, b) => b - a);
        const zonesToDelete = state.selectedObjects.filter(o => o.type === 'zone').map(o => o.index).sort((a, b) => b - a);
        camsToDelete.forEach(i  => state.placedCameras.splice(i, 1));
        wallsToDelete.forEach(i => state.walls.splice(i, 1));
        zonesToDelete.forEach(i => state.zones.splice(i, 1));
        state.selectedObjects = [];
        saveToLocalStorage(); updateHover(); draw();
    }
});

window.addEventListener('keyup', (e: KeyboardEvent) => {
    if (e.key === 'Alt')     state.isAltPressed  = false;
    if (e.key === 'Shift')   { state.isShiftPressed = false; draw(); }
    if (e.key === 'Control') { state.isCtrlPressed  = false; updateHover(); draw(); }
    if (e.code === 'Space')  state.isSpacePressed = false;
});

// =====================================================================
// ZDARZENIA WSTĄŻKI I RIBBONU
// =====================================================================

btnUndo.addEventListener('click', undo);
btnRedo.addEventListener('click', redo);
btnDraw.addEventListener('click',         () => setMode('draw'));
btnSimulate.addEventListener('click',     () => setMode('simulate'));
btnDrawObstacle.addEventListener('click', () => setMode('draw-obstacle'));
btnDrawZone.addEventListener('click',     () => setMode('draw-zone'));
btnErase.addEventListener('click',        () => setMode('erase'));
btnBgEdit.addEventListener('click',       () => setMode('bg-edit'));
btnCalibrate.addEventListener('click',    startCalibration);
btnBgUpload.addEventListener('click',     () => bgUploadInput.click());
btnBgDelete.addEventListener('click',     deleteSelectedBackground);
btnCameraManager.addEventListener('click', openCameraManager);
btnToggleTree.addEventListener('click',   toggleTree);

document.querySelector('.modal-close')?.addEventListener('click', closeCameraManager);
document.getElementById('btn-sidebar-close')?.addEventListener('click', toggleTree);
document.getElementById('btn-save-cam')!.addEventListener('click', saveCustomCamera);
document.getElementById('btn-cancel-edit')!.addEventListener('click', cancelEdit);

btnNewProject.addEventListener('click', () => {
    if (confirm('Czy na pewno chcesz usunąć cały projekt? Ta operacja jest nieodwracalna.')) {
        saveState();
        state.walls = []; state.placedCameras = []; state.zones = [];
        state.scale = 1.0; state.offsetX = 0; state.offsetY = 0;
        state.backgroundImages = []; state.selectedImageId = null; state.hasBg = false;
        btnBgEdit.classList.remove('active');
        btnCalibrate.style.display = 'none';
        saveToLocalStorage();
        setMode('none');
        updateProjectTree();
        draw();
    }
});

btnOptimize.addEventListener('click', () => {
    if (state.isOptimizing) {
        stopOptimization();
        btnOptimize.innerText = '✨ Optymalizuj Rozstawienie';
    } else {
        const count = prompt('Ile kamer optymalizować?', '3');
        if (count && !isNaN(Number(count))) {
            saveState();
            runBruteForceOptimization(parseInt(count));
            btnOptimize.innerText = '🛑 Zatrzymaj i Zapisz';
        }
    }
});

// Wpisanie długości ściany z klawiatury
inputLength.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
        const newLen = parseFloat(inputLength.value) * PIXELS_PER_METER;
        if (isNaN(newLen) || newLen <= 0) return;

        if (state.isDrawing && state.currentMode === 'draw') {
            const dx = state.currentPoint!.x - state.startPoint!.x;
            const dy = state.currentPoint!.y - state.startPoint!.y;
            let ang = Math.atan2(dy, dx);
            if (state.isShiftPressed) ang = Math.round(ang / (Math.PI / 12)) * (Math.PI / 12);
            const endX = state.startPoint!.x + Math.cos(ang) * newLen;
            const endY = state.startPoint!.y + Math.sin(ang) * newLen;
            const newWall: IWall = { x1: state.startPoint!.x, y1: state.startPoint!.y, x2: endX, y2: endY, type: selectWallType?.value as IWall['type'] ?? 'wall' };
            
            // Walidacja dla drzwi/okien - muszą być stawiane tylko na ścianach
            if (validateDoorWindowPlacement(newWall)) {
                saveState();
                splitWallIfIntersecting(newWall);
                saveToLocalStorage(); resetDrawingState();
            } else {
                // Blokada rysowania drzwi/okna w pustej przestrzeni
                if (newWall.type !== 'wall') {
                    alert('Drzwi i okna mogą być stawiane tylko na istniejących ścianach.');
                }
            }
        } else if (state.currentMode === 'none' && state.selectedObjects.length === 1 && state.selectedObjects[0].type === 'wall') {
            saveState();
            const w = state.walls[state.selectedObjects[0].index];
            const ang = Math.atan2(w.y2 - w.y1, w.x2 - w.x1);
            w.x2 = w.x1 + Math.cos(ang) * newLen;
            w.y2 = w.y1 + Math.sin(ang) * newLen;
            saveToLocalStorage(); syncStatusBarWithSelection(); draw();
        }
    }
    if (e.key === 'Alt') { e.preventDefault(); state.isAltPressed = true; }
});

inputZoneW.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') applyExactZone(); });
inputZoneH.addEventListener('keydown', (e: KeyboardEvent) => { if (e.key === 'Enter') applyExactZone(); });

// Opacity podkładu
bgOpacity.addEventListener('input', (e: Event) => {
    if (state.selectedImageId !== null) {
        const img = state.backgroundImages.find(i => i.id === state.selectedImageId);
        if (img) {
            img.opacity = Number((e.target as HTMLInputElement).value) / 100;
            bgOpacityVal.innerText = (e.target as HTMLInputElement).value + '%';
            draw();
        }
    }
});

// Wgrywanie pliku tła
bgUploadInput.addEventListener('change', function (e: Event) {
    const file = (e.target as HTMLInputElement).files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function (event: ProgressEvent<FileReader>) {
        const img = new Image();
        img.src = event.target!.result as string;
        img.onload = () => {
            const newBg = {
                id: 'bg_' + Date.now(), img: new Image(), src: event.target!.result as string, name: file.name,
                x: 100, y: 100, rotation: 0, scale: 1.0, opacity: 0.5,
                w: img.width, h: img.height,
            };
            newBg.img.src = event.target!.result as string;
            newBg.img.onload = () => {
                state.backgroundImages.push(newBg);
                state.hasBg = true;
                state.selectedImageId = newBg.id;
                btnBgEdit.classList.add('active');
                btnCalibrate.style.display = 'inline-block';
                bgOpacity.value = '50'; bgOpacityVal.innerText = '50%';
                setMode('bg-edit'); draw();
            };
        };
    };
    reader.readAsDataURL(file);
});

// Zakładki ribbonu
const tabBtns   = document.querySelectorAll<HTMLElement>('.tab-btn');
const toolGroups= document.querySelectorAll<HTMLElement>('.tool-group');
tabBtns.forEach(btn => {
    btn.addEventListener('click', () => {
        tabBtns.forEach(b => b.classList.remove('active'));
        toolGroups.forEach(g => { g.style.display = 'none'; });
        btn.classList.add('active');
        const targetId = btn.getAttribute('data-tab');
        if (targetId) { const el = document.getElementById(targetId); if (el) el.style.display = 'block'; }
        setMode('none');
    });
});

// =====================================================================
// INICJALIZACJA APLIKACJI
// =====================================================================

async function initApp(): Promise<void> {
    await loadCameraDatabase();
    initCameraSelect();

    const savedBgsRaw = localStorage.getItem('cctv_backgrounds');
    if (savedBgsRaw) {
        const savedBgs = JSON.parse(savedBgsRaw);
        state.backgroundImages = savedBgs.map((bgData: any) => {
            const img = new Image();
            if (bgData.src) img.src = bgData.src;
            img.onload = () => draw();
            return { ...bgData, img };
        });
        state.hasBg = state.backgroundImages.length > 0;
    }

    setMode('none');
    resizeCanvas();
    draw();
}

initApp();
window.addEventListener('resize', resizeCanvas);
