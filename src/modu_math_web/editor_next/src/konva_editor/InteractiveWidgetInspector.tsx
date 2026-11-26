import { useState } from "react";
import {
  defaultGraph2DProps,
  defaultProtractorProps,
  defaultSolid3DProps,
  defaultVoxel3DProps,
  normalizeGraph2DProps,
  normalizeProtractorProps,
  normalizeSolid3DProps,
  normalizeVoxel3DProps,
  type InteractiveWidgetSpec,
  type Solid3DItemSpec,
} from "@modu/student-renderer";
import type { InteractiveWidgetShape } from "../types/editorShape";

interface InteractiveWidgetInspectorProps {
  shape: InteractiveWidgetShape;
  onChangeWidget: (next: InteractiveWidgetSpec) => void;
}

export function InteractiveWidgetInspector({
  shape,
  onChangeWidget,
}: InteractiveWidgetInspectorProps) {
  const { widget } = shape;

  const updateProps = (nextProps: Record<string, unknown>) => {
    onChangeWidget({
      ...widget,
      props: nextProps,
    });
  };

  if (widget.kind === "voxel_3d") {
    return (
      <Voxel3DEditor
        rawProps={widget.props}
        onChange={updateProps}
      />
    );
  }

  if (widget.kind === "solid_3d") {
    return (
      <Solid3DEditor
        rawProps={widget.props}
        onChange={updateProps}
      />
    );
  }

  if (widget.kind === "graph_2d") {
    return (
      <Graph2DEditor
        rawProps={widget.props}
        onChange={updateProps}
      />
    );
  }

  if (widget.kind === "protractor_2d") {
    return (
      <Protractor2DEditor
        width={shape.width}
        height={shape.height}
        rawProps={widget.props}
        onChange={updateProps}
      />
    );
  }

  return null;
}

function Voxel3DEditor({
  rawProps,
  onChange,
}: {
  rawProps?: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const spec = normalizeVoxel3DProps(rawProps);
  const [layer, setLayer] = useState(0);

  const blockSet = new Set(spec.baseBlocks.map(([x, y, z]) => `${x},${y},${z}`));

  const toggleCell = (x: number, z: number) => {
    const key = `${x},${layer},${z}`;
    const nextBlocks = blockSet.has(key)
      ? spec.baseBlocks.filter(([bx, by, bz]) => `${bx},${by},${bz}` !== key)
      : [...spec.baseBlocks, [x, layer, z] as [number, number, number]];
    onChange({
      ...spec,
      baseBlocks: nextBlocks.length > 0 ? nextBlocks : [[0, 0, 0]],
    });
  };

  return (
    <div className="konva-field-wide" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
        <span style={{ fontSize: 12, fontWeight: 600 }}>층별 쌓기나무 편집 (총 {spec.baseBlocks.length}개)</span>
        <div style={{ display: "flex", gap: 4 }}>
          {[0, 1, 2].map((lv) => (
            <button
              key={lv}
              type="button"
              onClick={() => setLayer(lv)}
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                border: layer === lv ? "1px solid #0284c7" : "1px solid #cbd5e1",
                background: layer === lv ? "#0284c7" : "#ffffff",
                color: layer === lv ? "#ffffff" : "#334155",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {lv + 1}층
            </button>
          ))}
        </div>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 32px)",
          gap: 4,
          justifyContent: "center",
          padding: 8,
          borderRadius: 8,
          background: "#f8fafc",
          border: "1px solid #e2e8f0",
        }}
      >
        {[0, 1, 2].flatMap((z) =>
          [0, 1, 2].map((x) => {
            const active = blockSet.has(`${x},${layer},${z}`);
            return (
              <button
                key={`${x}-${z}`}
                type="button"
                aria-pressed={active}
                onClick={() => toggleCell(x, z)}
                style={{
                  width: 32,
                  height: 32,
                  borderRadius: 6,
                  border: active ? "1.5px solid #b45309" : "1px dashed #94a3b8",
                  background: active ? "#f3be7a" : "#ffffff",
                  color: active ? "#78350f" : "#94a3b8",
                  fontSize: 11,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {active ? "■" : "+"}
              </button>
            );
          }),
        )}
      </div>

      <label className="konva-field">
        <span>학생 추가 가능 블록 수</span>
        <input
          type="number"
          min={0}
          max={5}
          value={spec.extraBlocksLimit ?? 0}
          onChange={(e) =>
            onChange({ ...spec, extraBlocksLimit: Math.max(0, Number(e.target.value) || 0) })
          }
        />
      </label>

      <label className="konva-checkbox-field">
        <input
          type="checkbox"
          checked={spec.showProjectionGrid !== false}
          onChange={(e) => onChange({ ...spec, showProjectionGrid: e.target.checked })}
        />
        <span>위·앞·옆 투영도 표시</span>
      </label>

      <button
        type="button"
        onClick={() => onChange(defaultVoxel3DProps() as unknown as Record<string, unknown>)}
        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}
      >
        기본 쌓기나무로 초기화
      </button>
    </div>
  );
}

function Solid3DEditor({
  rawProps,
  onChange,
}: {
  rawProps?: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const spec = normalizeSolid3DProps(rawProps);

  const updateSolid = (idx: number, patch: Partial<Solid3DItemSpec>) => {
    const nextSolids = spec.solids.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    onChange({ ...spec, solids: nextSolids });
  };

  const addSolid = () => {
    const labels = ["가", "나", "다", "라", "마", "바"];
    const nextIdx = spec.solids.length;
    const nextItem: Solid3DItemSpec = {
      id: `solid_${nextIdx + 1}`,
      label: labels[nextIdx] ?? String(nextIdx + 1),
      shape: "cuboid",
      dimensions: { w: 3, d: 2, h: 3, unit: "cm" },
      color: nextIdx % 2 === 0 ? "#7dd3fc" : "#fdba74",
      showDimensions: true,
      showHiddenEdges: true,
    };
    onChange({ ...spec, solids: [...spec.solids, nextItem] });
  };

  const removeSolid = (idx: number) => {
    if (spec.solids.length <= 1) return;
    onChange({ ...spec, solids: spec.solids.filter((_, i) => i !== idx) });
  };

  return (
    <div className="konva-field-wide" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {spec.solids.map((s, idx) => (
        <div
          key={s.id}
          style={{
            padding: 8,
            borderRadius: 8,
            border: "1px solid #e2e8f0",
            background: "#f8fafc",
            display: "flex",
            flexDirection: "column",
            gap: 6,
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <strong style={{ fontSize: 12 }}>도형 {s.label ?? idx + 1}</strong>
            {spec.solids.length > 1 && (
              <button type="button" onClick={() => removeSolid(idx)} style={{ fontSize: 11 }}>
                삭제
              </button>
            )}
          </div>
          <label className="konva-field">
            <span>종류</span>
            <select
              value={s.shape}
              onChange={(e) => updateSolid(idx, { shape: e.target.value as Solid3DItemSpec["shape"] })}
            >
              <option value="cuboid">직육면체</option>
              <option value="cube">정육면체</option>
              <option value="cylinder">원기둥</option>
              <option value="prism">삼각기둥</option>
              <option value="slanted_prism">경사 사각기둥</option>
            </select>
          </label>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 4 }}>
            <label className="konva-field">
              <span>가로</span>
              <input
                type="number"
                min={1}
                max={12}
                value={s.dimensions.w}
                onChange={(e) =>
                  updateSolid(idx, { dimensions: { ...s.dimensions, w: Math.max(1, Number(e.target.value) || 1) } })
                }
              />
            </label>
            <label className="konva-field">
              <span>세로</span>
              <input
                type="number"
                min={1}
                max={12}
                value={s.dimensions.d}
                onChange={(e) =>
                  updateSolid(idx, { dimensions: { ...s.dimensions, d: Math.max(1, Number(e.target.value) || 1) } })
                }
              />
            </label>
            <label className="konva-field">
              <span>높이</span>
              <input
                type="number"
                min={1}
                max={12}
                value={s.dimensions.h}
                onChange={(e) =>
                  updateSolid(idx, { dimensions: { ...s.dimensions, h: Math.max(1, Number(e.target.value) || 1) } })
                }
              />
            </label>
          </div>
        </div>
      ))}

      <button type="button" onClick={addSolid} style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}>
        + 입체도형 추가
      </button>

      <label className="konva-checkbox-field">
        <input
          type="checkbox"
          checked={spec.allowOverlayCompare !== false}
          onChange={(e) => onChange({ ...spec, allowOverlayCompare: e.target.checked })}
        />
        <span>겹쳐 비교하기 허용</span>
      </label>

      <label className="konva-checkbox-field">
        <input
          type="checkbox"
          checked={spec.allowUnitCubeFill !== false}
          onChange={(e) => onChange({ ...spec, allowUnitCubeFill: e.target.checked })}
        />
        <span>1cm³ 단위정육면체 채우기 허용</span>
      </label>

      <button
        type="button"
        onClick={() => onChange(defaultSolid3DProps() as unknown as Record<string, unknown>)}
        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}
      >
        기본 직육면체 세트로 초기화
      </button>
    </div>
  );
}

function Graph2DEditor({
  rawProps,
  onChange,
}: {
  rawProps?: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const spec = normalizeGraph2DProps(rawProps);
  const firstSeries = spec.series[0];

  const updateValue = (colIdx: number, val: number) => {
    const nextSeries = spec.series.map((s, si) =>
      si === 0 ? { ...s, values: s.values.map((v, ci) => (ci === colIdx ? val : v)) } : s,
    );
    onChange({ ...spec, series: nextSeries });
  };

  return (
    <div className="konva-field-wide" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="konva-field">
        <span>그래프 제목</span>
        <input
          type="text"
          value={spec.title ?? ""}
          onChange={(e) => onChange({ ...spec, title: e.target.value })}
        />
      </label>

      <label className="konva-field">
        <span>그래프 유형</span>
        <select
          value={spec.chartType}
          onChange={(e) => onChange({ ...spec, chartType: e.target.value })}
        >
          <option value="line">꺾은선그래프</option>
          <option value="bar">막대그래프</option>
          <option value="overlay_compare">막대+꺾은선 겹쳐 비교</option>
        </select>
      </label>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
        <label className="konva-field">
          <span>Y축 최소</span>
          <input
            type="number"
            step="any"
            value={spec.yAxis.min}
            onChange={(e) => onChange({ ...spec, yAxis: { ...spec.yAxis, min: Number(e.target.value) || 0 } })}
          />
        </label>
        <label className="konva-field">
          <span>Y축 최대</span>
          <input
            type="number"
            step="any"
            value={spec.yAxis.max}
            onChange={(e) => onChange({ ...spec, yAxis: { ...spec.yAxis, max: Number(e.target.value) || 20 } })}
          />
        </label>
        <label className="konva-field">
          <span>큰 눈금</span>
          <input
            type="number"
            step="any"
            value={spec.yAxis.majorStep}
            onChange={(e) => onChange({ ...spec, yAxis: { ...spec.yAxis, majorStep: Math.max(0.1, Number(e.target.value) || 1) } })}
          />
        </label>
        <label className="konva-field">
          <span>작은 눈금</span>
          <input
            type="number"
            step="any"
            value={spec.yAxis.minorStep}
            onChange={(e) => onChange({ ...spec, yAxis: { ...spec.yAxis, minorStep: Math.max(0.05, Number(e.target.value) || 0.2) } })}
          />
        </label>
      </div>

      <label className="konva-checkbox-field">
        <input
          type="checkbox"
          checked={Boolean(spec.yAxis.waveBreak)}
          onChange={(e) =>
            onChange({
              ...spec,
              yAxis: {
                ...spec.yAxis,
                waveBreak: e.target.checked ? { from: 0, to: spec.yAxis.min } : undefined,
              },
            })
          }
        />
        <span>물결선(축 생략) 사용</span>
      </label>

      {firstSeries && (
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 4 }}>
          {spec.xAxis.categories.map((cat, idx) => (
            <label key={`${cat}-${idx}`} className="konva-field">
              <span>{cat} 값</span>
              <input
                type="number"
                step={spec.yAxis.minorStep}
                value={firstSeries.values[idx] ?? ""}
                onChange={(e) => updateValue(idx, Number(e.target.value))}
              />
            </label>
          ))}
        </div>
      )}

      <button
        type="button"
        onClick={() => onChange(defaultGraph2DProps() as unknown as Record<string, unknown>)}
        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}
      >
        기본 그래프로 초기화
      </button>
    </div>
  );
}

function Protractor2DEditor({
  width,
  height,
  rawProps,
  onChange,
}: {
  width: number;
  height: number;
  rawProps?: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}) {
  const spec = normalizeProtractorProps(rawProps, width, height);

  return (
    <div className="konva-field-wide" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <label className="konva-field">
        <span>각도기 반지름</span>
        <input
          type="number"
          min={40}
          max={180}
          value={spec.protractor.radius}
          onChange={(e) =>
            onChange({
              ...spec,
              protractor: { ...spec.protractor, radius: Math.max(40, Number(e.target.value) || 90) },
            })
          }
        />
      </label>

      <label className="konva-field">
        <span>초기 각도 (°)</span>
        <input
          type="number"
          min={-180}
          max={180}
          value={spec.protractor.initialAngle}
          onChange={(e) =>
            onChange({
              ...spec,
              protractor: { ...spec.protractor, initialAngle: Number(e.target.value) || 0 },
            })
          }
        />
      </label>

      <label className="konva-checkbox-field">
        <input
          type="checkbox"
          checked={spec.allowDrawPerpendicular !== false}
          onChange={(e) => onChange({ ...spec, allowDrawPerpendicular: e.target.checked })}
        />
        <span>90° 수선 긋기 버튼 표시</span>
      </label>

      <button
        type="button"
        onClick={() => onChange(defaultProtractorProps(width, height) as unknown as Record<string, unknown>)}
        style={{ fontSize: 11, padding: "4px 8px", borderRadius: 6, cursor: "pointer" }}
      >
        기본 각도기로 초기화
      </button>
    </div>
  );
}
