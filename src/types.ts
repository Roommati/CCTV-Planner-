// ==========================================
// Centralne definicje typów i interfejsów
// ==========================================

// --- TYPY WYLICZENIOWE ---

export type WallType = 'wall' | 'door' | 'window';
export type MountType = 'wall' | 'ceiling';
export type ZoneType = 'obstacle' | 'poi_high' | 'poi_med' | 'poi_none';
export type DisplayMode = 'all' | 'compact' | 'identify' | 'recognize' | 'observe' | 'hidden';
export type AppMode = 'none' | 'draw' | 'draw-obstacle' | 'draw-zone' | 'simulate' | 'erase' | 'bg-edit' | 'draw-cable';
export type PlacementStep = 'pos' | 'angle';
export type HandleType = 'p1' | 'p2' | 'center' | 'tl' | 'tr' | 'bl' | 'br';

// --- STRUKTURY DANYCH PROJEKTU ---

export interface IPoint {
    x: number;
    y: number;
}

export interface IWall {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
    type: WallType;
}

export interface ICable {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

export interface ICamera {
    x: number;
    y: number;
    angle: number;
    fov: number;
    range: number;
    /** [identyfikacja, rozpoznanie, obserwacja, detekcja] — w pikselach */
    dori: [number, number, number, number];
    type: MountType;
    modelId?: string;
    displayMode?: DisplayMode;
    name?: string;
}

export interface IZone {
    x: number;
    y: number;
    width: number;
    height: number;
    type: ZoneType;
}

export interface ICameraModel {
    name: string;
    fov: number;
    range: number;
    dori: [number, number, number, number];
    type: MountType;
    isDefault?: boolean;
}

export interface IBackground {
    id: string;
    img: HTMLImageElement;
    src?: string;
    name: string;
    x: number;
    y: number;
    w: number;
    h: number;
    scale: number;
    opacity: number;
    rotation: number;
}

// --- STRUKTURY POMOCNICZE ---

export interface IRay {
    x: number;
    y: number;
    dx: number;
    dy: number;
}

export interface ISelectedObject {
    type: 'wall' | 'camera' | 'zone';
    index: number;
    handle?: HandleType | string;
    node?: string;
}

export interface IProjectState {
    walls: IWall[];
    cameras: ICamera[];
    zones: IZone[];
    backgrounds?: IBackground[];
    cables?: ICable[]; // Dodajemy kable jako opcjonalne dla wstecznej kompatybilności
    scale: number;
    offsetX: number;
    offsetY: number;
}

export interface ICoverageResult {
    percentage: number;
    score: number;
}

export interface IMousePos {
    worldX: number;
    worldY: number;
    screenX: number;
    screenY: number;
}

// --- STAN APLIKACJI ---

export interface IAppState {
    // Marquee selection
    selectedObjects: ISelectedObject[];
    isSelecting: boolean;
    selectionStart: IPoint | null;
    selectionCurrent: IPoint | null;

    // Drag
    isDraggingObj: boolean;
    dragStartPos: IPoint | null;
    dragInitialState: (IWall | ICamera | IZone | null)[];

    // Klawisze modyfikujące
    isAltPressed: boolean;
    isShiftPressed: boolean;
    isCtrlPressed: boolean;
    isSpacePressed: boolean;

    // Stan rysowania
    currentMode: AppMode;
    isDrawing: boolean;
    startPoint: IPoint | null;
    currentPoint: IPoint | null;
    snapPoint: IPoint | null;
    guideX: { x: number } | null;
    guideY: { y: number } | null;
    trackingPoints: IPoint[];
    isOptimizing: boolean;

    // Viewport
    scale: number;
    offsetX: number;
    offsetY: number;
    isPanning: boolean;
    panStart: IPoint;
    lastMousePos: IPoint;

    // Hover / placementStep
    hoveredObj: ISelectedObject | null;
    placementStep: PlacementStep;

    // Dane projektu
    walls: IWall[];
    placedCameras: ICamera[];
    zones: IZone[];
    cables: ICable[];

    // Duch kamery (tryb simulate)
    cameraPos: IPoint;
    cameraAngle: number;

    // Podkłady mapowe
    backgroundImages: IBackground[];
    selectedImageId: string | null;
    hasBg: boolean;
    isDraggingBg: boolean;
    isRotatingBg: boolean;
    isResizingBg: boolean;
    resizeHandle: string | null;
    isCalibrating: boolean;
    bgInitialRotation: number;
    bgInitialOffset: IPoint;
    bgInitialState: IBackground | null;

    // Historia (undo/redo)
    history: IProjectState[];
    redoHistory: IProjectState[];

    // Aktywny uchwyt (edycja wierzchołka)
    activeHandle: (ISelectedObject & { node: string }) | null;

    // Edycja modelu kamery w magazynie
    editingCameraId: string | null;

    // Baza kamer (przeniesiona z cameras.js)
    cameraModels: Record<string, ICameraModel>;
    selectedCameraModel: string;
    favoriteCameras: string[];

    // Pętla optymalizacji heurystycznej
    optimizationLoop: ReturnType<typeof setInterval> | null;

    // Ostatnie aktywne narzędzie (dla toggle przez Spację)
    lastActiveTool: AppMode;
}

// --- ROZSZERZENIE WINDOW dla dynamicznych onclick w szablonach HTML ---
declare global {
    interface Window {
        editCustomCamera: (id: string) => void;
        deleteCustomCamera: (id: string) => Promise<void>;
        toggleFavorite: (id: string) => Promise<void>;
        selectObjectFromTree: (type: string, index: number) => void;
        updateCameraName: (index: number, newName: string) => void;
        updateCameraMode: (index: number, mode: string) => void;
    }
}
