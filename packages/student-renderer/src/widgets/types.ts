export type InteractiveWidgetKind =
  | "protractor_2d"
  | "graph_2d"
  | "voxel_3d"
  | "solid_3d";

export type InteractiveWidgetMode = "sandbox" | "graded";

export interface ProtractorLineSpec {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export interface ProtractorToolSpec {
  initialX: number;
  initialY: number;
  initialAngle: number;
  radius: number;
  opacity?: number;
}

export interface ProtractorWidgetProps {
  baseLine: ProtractorLineSpec;
  showBaseLine?: boolean;
  anchorPoint?: { x: number; y: number };
  protractor: ProtractorToolSpec;
  allowDrawPerpendicular?: boolean;
  snapToleranceDeg?: number;
  snapTolerancePx?: number;
}

export interface GraphWidgetProps {
  chartType: "bar" | "line" | "overlay_compare";
  title?: string;
  xAxis: { label: string; categories: string[] };
  yAxis: {
    label: string;
    unit?: string;
    min: number;
    max: number;
    majorStep: number;
    minorStep: number;
    waveBreak?: { from: number; to: number };
  };
  series: Array<{
    id: string;
    type: "bar" | "line";
    color: string;
    values: Array<number | null>;
    editable?: boolean;
  }>;
  allowOverlayDrag?: boolean;
}

export interface Voxel3DWidgetProps {
  baseBlocks: Array<[number, number, number]>;
  gridCols?: number;
  gridRows?: number;
  maxLayers?: number;
  blockColor?: string;
  extraBlocksLimit?: number;
  compareShapes?: Array<{
    label: string;
    blocks: Array<[number, number, number]>;
  }>;
  cameraPreset?: "isometric" | "top" | "front" | "side";
  showViewButtons?: boolean;
  showProjectionGrid?: boolean;
  allowOverlayCompare?: boolean;
}

export interface Solid3DItemSpec {
  id: string;
  label?: string;
  shape: "cuboid" | "cube" | "cylinder" | "prism" | "slanted_prism";
  dimensions: { w: number; d: number; h: number; unit?: string };
  position?: { x: number; y: number; z: number };
  color?: string;
  showDimensions?: boolean;
  showHiddenEdges?: boolean;
}

export interface Solid3DWidgetProps {
  solids: Solid3DItemSpec[];
  allowOverlayCompare?: boolean;
  allowUnitCubeFill?: boolean;
  allowUnfoldNet?: boolean;
}

export interface InteractiveWidgetSpec {
  kind: InteractiveWidgetKind;
  version?: number;
  mode?: InteractiveWidgetMode;
  props?: Record<string, unknown>;
  interactions?: Record<string, unknown>;
  evaluation?: Record<string, unknown> | null;
}

export function defaultProtractorProps(width = 420, height = 280): ProtractorWidgetProps {
  const cx = Math.round(width * 0.5);
  const cy = Math.round(height * 0.72);
  const dx = Math.round(width * 0.38);
  const dy = Math.round(height * 0.14);
  return {
    baseLine: {
      x1: cx - dx,
      y1: cy + dy,
      x2: cx + dx,
      y2: cy - dy,
    },
    showBaseLine: false,
    anchorPoint: { x: cx, y: cy },
    protractor: {
      initialX: cx,
      initialY: cy,
      initialAngle: 0,
      radius: Math.max(60, Math.min(130, Math.round(Math.min(width, height) * 0.36))),
      opacity: 0.78,
    },
    allowDrawPerpendicular: true,
    snapToleranceDeg: 4,
    snapTolerancePx: 14,
  };
}

export function normalizeProtractorProps(
  raw: Record<string, unknown> | undefined,
  width: number,
  height: number,
): ProtractorWidgetProps {
  const fallback = defaultProtractorProps(width, height);
  if (!raw || typeof raw !== "object") return fallback;

  const num = (v: unknown, fb: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fb;

  const rawLine = (raw.baseLine && typeof raw.baseLine === "object"
    ? raw.baseLine
    : {}) as Record<string, unknown>;
  const rawAnchor = (raw.anchorPoint && typeof raw.anchorPoint === "object"
    ? raw.anchorPoint
    : null) as Record<string, unknown> | null;
  const rawTool = (raw.protractor && typeof raw.protractor === "object"
    ? raw.protractor
    : {}) as Record<string, unknown>;

  const baseLine: ProtractorLineSpec = {
    x1: num(rawLine.x1, fallback.baseLine.x1),
    y1: num(rawLine.y1, fallback.baseLine.y1),
    x2: num(rawLine.x2, fallback.baseLine.x2),
    y2: num(rawLine.y2, fallback.baseLine.y2),
  };

  const anchorPoint = rawAnchor
    ? {
        x: num(rawAnchor.x, (baseLine.x1 + baseLine.x2) / 2),
        y: num(rawAnchor.y, (baseLine.y1 + baseLine.y2) / 2),
      }
    : {
        x: (baseLine.x1 + baseLine.x2) / 2,
        y: (baseLine.y1 + baseLine.y2) / 2,
      };

  return {
    baseLine,
    showBaseLine:
      typeof raw.showBaseLine === "boolean"
        ? raw.showBaseLine
        : fallback.showBaseLine ?? false,
    anchorPoint,
    protractor: {
      initialX: num(rawTool.initialX, fallback.protractor.initialX),
      initialY: num(rawTool.initialY, fallback.protractor.initialY),
      initialAngle: num(rawTool.initialAngle, fallback.protractor.initialAngle),
      radius: Math.max(40, num(rawTool.radius, fallback.protractor.radius)),
      opacity: Math.max(0.25, Math.min(1, num(rawTool.opacity, fallback.protractor.opacity ?? 0.78))),
    },
    allowDrawPerpendicular:
      typeof raw.allowDrawPerpendicular === "boolean"
        ? raw.allowDrawPerpendicular
        : fallback.allowDrawPerpendicular,
    snapToleranceDeg: num(raw.snapToleranceDeg, fallback.snapToleranceDeg ?? 4),
    snapTolerancePx: num(raw.snapTolerancePx, fallback.snapTolerancePx ?? 14),
  };
}

export function defaultVoxel3DProps(): Voxel3DWidgetProps {
  return {
    baseBlocks: [
      [0, 0, 0],
      [0, 1, 0],
      [0, 0, 1],
      [1, 0, 1],
    ],
    extraBlocksLimit: 1,
    cameraPreset: "isometric",
    showViewButtons: true,
    showProjectionGrid: true,
    allowOverlayCompare: true,
  };
}

export function normalizeVoxel3DProps(raw: Record<string, unknown> | undefined): Voxel3DWidgetProps {
  const fallback = defaultVoxel3DProps();
  if (!raw || typeof raw !== "object") return fallback;

  const parseBlocks = (input: unknown): Array<[number, number, number]> => {
    if (!Array.isArray(input)) return [];
    const result: Array<[number, number, number]> = [];
    for (const item of input) {
      if (
        Array.isArray(item) &&
        item.length >= 3 &&
        typeof item[0] === "number" &&
        typeof item[1] === "number" &&
        typeof item[2] === "number"
      ) {
        result.push([Math.round(item[0]), Math.round(item[1]), Math.round(item[2])]);
      }
    }
    return result;
  };

  const baseBlocks = parseBlocks(raw.baseBlocks);
  const compareShapes = Array.isArray(raw.compareShapes)
    ? raw.compareShapes
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
        .map((s, idx) => ({
          label: typeof s.label === "string" && s.label.trim() ? s.label : String(idx + 1),
          blocks: parseBlocks(s.blocks),
        }))
        .filter((s) => s.blocks.length > 0)
    : undefined;

  const clampGrid = (v: unknown, fb: number, min: number, max: number) =>
    typeof v === "number" && Number.isFinite(v) ? Math.max(min, Math.min(max, Math.trunc(v))) : fb;

  const resolvedBlocks = baseBlocks.length > 0 ? baseBlocks : fallback.baseBlocks;
  const maxBlockX = Math.max(0, ...resolvedBlocks.map((b) => b[0]));
  const maxBlockY = Math.max(0, ...resolvedBlocks.map((b) => b[1]));
  const maxBlockZ = Math.max(0, ...resolvedBlocks.map((b) => b[2]));

  return {
    baseBlocks: resolvedBlocks,
    gridCols: clampGrid(raw.gridCols, Math.max(3, maxBlockX + 1), 2, 6),
    gridRows: clampGrid(raw.gridRows, Math.max(3, maxBlockZ + 1), 2, 6),
    maxLayers: clampGrid(raw.maxLayers, Math.max(3, maxBlockY + 1), 1, 6),
    blockColor: typeof raw.blockColor === "string" && raw.blockColor.trim() ? raw.blockColor : "#f3be7a",
    extraBlocksLimit:
      typeof raw.extraBlocksLimit === "number" && Number.isFinite(raw.extraBlocksLimit)
        ? Math.max(0, Math.min(20, Math.trunc(raw.extraBlocksLimit)))
        : fallback.extraBlocksLimit,
    compareShapes,
    cameraPreset:
      raw.cameraPreset === "top" || raw.cameraPreset === "front" || raw.cameraPreset === "side"
        ? raw.cameraPreset
        : "isometric",
    showViewButtons: typeof raw.showViewButtons === "boolean" ? raw.showViewButtons : true,
    showProjectionGrid: typeof raw.showProjectionGrid === "boolean" ? raw.showProjectionGrid : true,
    allowOverlayCompare: typeof raw.allowOverlayCompare === "boolean" ? raw.allowOverlayCompare : true,
  };
}

export function defaultSolid3DProps(): Solid3DWidgetProps {
  return {
    solids: [
      {
        id: "solid_ga",
        label: "가",
        shape: "cuboid",
        dimensions: { w: 3, d: 2, h: 5, unit: "cm" },
        color: "#7dd3fc",
        showDimensions: true,
        showHiddenEdges: true,
      },
      {
        id: "solid_na",
        label: "나",
        shape: "cuboid",
        dimensions: { w: 3, d: 2, h: 3, unit: "cm" },
        color: "#fdba74",
        showDimensions: true,
        showHiddenEdges: true,
      },
    ],
    allowOverlayCompare: true,
    allowUnitCubeFill: true,
    allowUnfoldNet: false,
  };
}

export function normalizeSolid3DProps(raw: Record<string, unknown> | undefined): Solid3DWidgetProps {
  const fallback = defaultSolid3DProps();
  if (!raw || typeof raw !== "object") return fallback;

  const num = (v: unknown, fb: number) =>
    typeof v === "number" && Number.isFinite(v) && v > 0 ? v : fb;

  const validShapes = new Set(["cuboid", "cube", "cylinder", "prism", "slanted_prism"]);
  const solids: Solid3DItemSpec[] = Array.isArray(raw.solids)
    ? raw.solids
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
        .map((s, idx) => {
          const dims = (s.dimensions && typeof s.dimensions === "object" ? s.dimensions : {}) as Record<string, unknown>;
          const rawPos = (s.position && typeof s.position === "object" ? s.position : null) as Record<string, unknown> | null;
          const posNum = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : 0);
          const shape = typeof s.shape === "string" && validShapes.has(s.shape)
            ? (s.shape as Solid3DItemSpec["shape"])
            : "cuboid";
          const w = num(dims.w, 3);
          const d = shape === "cube" ? w : shape === "cylinder" || shape === "prism" ? w : num(dims.d, 2);
          const h = shape === "cube" ? w : num(dims.h, 3);
          return {
            id: typeof s.id === "string" && s.id ? s.id : `solid_${idx + 1}`,
            label: typeof s.label === "string" ? s.label : undefined,
            shape,
            dimensions: {
              w,
              d,
              h,
              unit: typeof dims.unit === "string" ? dims.unit : "cm",
            },
            position: rawPos
              ? { x: posNum(rawPos.x), y: posNum(rawPos.y), z: posNum(rawPos.z) }
              : { x: 0, y: 0, z: 0 },
            color: typeof s.color === "string" ? s.color : idx % 2 === 0 ? "#7dd3fc" : "#fdba74",
            showDimensions: typeof s.showDimensions === "boolean" ? s.showDimensions : true,
            showHiddenEdges: typeof s.showHiddenEdges === "boolean" ? s.showHiddenEdges : true,
          };
        })
    : [];

  return {
    solids: solids.length > 0 ? solids : fallback.solids,
    allowOverlayCompare: typeof raw.allowOverlayCompare === "boolean" ? raw.allowOverlayCompare : true,
    allowUnitCubeFill: typeof raw.allowUnitCubeFill === "boolean" ? raw.allowUnitCubeFill : true,
    allowUnfoldNet: typeof raw.allowUnfoldNet === "boolean" ? raw.allowUnfoldNet : false,
  };
}

export function defaultGraph2DProps(): GraphWidgetProps {
  return {
    chartType: "line",
    title: "100m 달리기 기록",
    xAxis: { label: "대회", categories: ["1차", "2차", "3차", "4차"] },
    yAxis: {
      label: "기록",
      unit: "초",
      min: 17,
      max: 20,
      majorStep: 1,
      minorStep: 0.2,
      waveBreak: { from: 0, to: 16.6 },
    },
    series: [
      {
        id: "record_line",
        type: "line",
        color: "#db2777",
        values: [19.2, 18.4, 17.8, 17.4],
        editable: true,
      },
    ],
    allowOverlayDrag: true,
  };
}

export function normalizeGraph2DProps(raw: Record<string, unknown> | undefined): GraphWidgetProps {
  const fallback = defaultGraph2DProps();
  if (!raw || typeof raw !== "object") return fallback;

  const num = (v: unknown, fb: number) =>
    typeof v === "number" && Number.isFinite(v) ? v : fb;

  const chartType =
    raw.chartType === "bar" || raw.chartType === "line" || raw.chartType === "overlay_compare"
      ? raw.chartType
      : fallback.chartType;

  const rawX = (raw.xAxis && typeof raw.xAxis === "object" ? raw.xAxis : {}) as Record<string, unknown>;
  const rawY = (raw.yAxis && typeof raw.yAxis === "object" ? raw.yAxis : {}) as Record<string, unknown>;
  const categories = Array.isArray(rawX.categories) && rawX.categories.length > 0
    ? rawX.categories.map((c) => String(c))
    : fallback.xAxis.categories;

  const rawWave = rawY.waveBreak && typeof rawY.waveBreak === "object"
    ? (rawY.waveBreak as Record<string, unknown>)
    : null;

  const waveBreak = rawWave
    ? { from: num(rawWave.from, 0), to: num(rawWave.to, num(rawY.min, fallback.yAxis.min)) }
    : raw.yAxis !== undefined
      ? undefined
      : fallback.yAxis.waveBreak;

  const min = num(rawY.min, fallback.yAxis.min);
  const max = Math.max(min + 0.1, num(rawY.max, fallback.yAxis.max));
  const majorStep = Math.max(0.1, num(rawY.majorStep, fallback.yAxis.majorStep));
  const minorStep = Math.max(0.05, Math.min(majorStep, num(rawY.minorStep, fallback.yAxis.minorStep)));

  const series = Array.isArray(raw.series) && raw.series.length > 0
    ? raw.series
        .filter((s): s is Record<string, unknown> => Boolean(s && typeof s === "object"))
        .map((s, idx) => ({
          id: typeof s.id === "string" && s.id ? s.id : `series_${idx + 1}`,
          type: (s.type === "bar" ? "bar" : "line") as "bar" | "line",
          color: typeof s.color === "string" && s.color ? s.color : idx === 0 ? "#db2777" : "#f59e0b",
          values: categories.map((_, ci) => {
            const val = Array.isArray(s.values) ? s.values[ci] : null;
            return typeof val === "number" && Number.isFinite(val) ? val : null;
          }),
          editable: typeof s.editable === "boolean" ? s.editable : true,
        }))
    : fallback.series;

  return {
    chartType,
    title: typeof raw.title === "string" ? raw.title : fallback.title,
    xAxis: {
      label: typeof rawX.label === "string" ? rawX.label : fallback.xAxis.label,
      categories,
    },
    yAxis: {
      label: typeof rawY.label === "string" ? rawY.label : fallback.yAxis.label,
      unit: typeof rawY.unit === "string" ? rawY.unit : fallback.yAxis.unit,
      min,
      max,
      majorStep,
      minorStep,
      waveBreak,
    },
    series,
    allowOverlayDrag: typeof raw.allowOverlayDrag === "boolean" ? raw.allowOverlayDrag : true,
  };
}
