import React, { useMemo, useRef, useState } from "react";
import { normalizeGraph2DProps } from "../types";

export interface Graph2DWidgetProps {
  width: number;
  height: number;
  rawProps?: Record<string, unknown>;
  interactive?: boolean;
}

function roundToStep(value: number, min: number, max: number, step: number): number {
  const clamped = Math.max(min, Math.min(max, value));
  const steps = Math.round((clamped - min) / step);
  const snapped = min + steps * step;
  return Number(Math.max(min, Math.min(max, snapped)).toFixed(4));
}

export const Graph2DWidget: React.FC<Graph2DWidgetProps> = ({
  width,
  height,
  rawProps,
  interactive = true,
}) => {
  const spec = useMemo(() => normalizeGraph2DProps(rawProps), [rawProps]);
  const [seriesValues, setSeriesValues] = useState<Array<Array<number | null>>>(() =>
    spec.series.map((s) => [...s.values]),
  );
  const [overlayBar, setOverlayBar] = useState(spec.chartType === "overlay_compare");
  const [activePoint, setActivePoint] = useState<{ seriesIdx: number; colIdx: number } | null>(null);

  const svgRef = useRef<SVGSVGElement>(null);
  const draggingRef = useRef<{ seriesIdx: number; colIdx: number } | null>(null);

  // Sync if props change from editor
  const propsSignature = JSON.stringify(spec.series.map((s) => s.values));
  const lastSigRef = useRef(propsSignature);
  if (lastSigRef.current !== propsSignature) {
    lastSigRef.current = propsSignature;
    setSeriesValues(spec.series.map((s) => [...s.values]));
  }

  const hasWave = Boolean(spec.yAxis.waveBreak);
  const padLeft = 64;
  const padRight = 22;
  const padTop = spec.title ? 36 : 22;
  const padBottom = 42;
  const waveHeight = hasWave ? 18 : 0;

  const plotLeft = padLeft;
  const plotRight = Math.max(plotLeft + 80, width - padRight);
  const plotTop = padTop;
  const plotBottom = Math.max(plotTop + 60, height - padBottom - waveHeight);
  const plotWidth = plotRight - plotLeft;
  const plotHeight = plotBottom - plotTop;

  const { min, max, majorStep, minorStep } = spec.yAxis;
  const valueRange = Math.max(0.0001, max - min);

  const valueToY = (val: number): number => {
    const ratio = (val - min) / valueRange;
    return plotBottom - ratio * plotHeight;
  };

  const yToValue = (y: number): number => {
    const ratio = (plotBottom - y) / plotHeight;
    return roundToStep(min + ratio * valueRange, min, max, minorStep);
  };

  const categories = spec.xAxis.categories;
  const colStep = plotWidth / Math.max(1, categories.length);
  const colCenterX = (idx: number): number => plotLeft + colStep * (idx + 0.5);

  const minorTicks = useMemo(() => {
    const ticks: number[] = [];
    const count = Math.min(120, Math.round(valueRange / minorStep));
    for (let i = 0; i <= count; i++) {
      const val = Number((min + i * minorStep).toFixed(4));
      if (val <= max + 1e-6) ticks.push(val);
    }
    return ticks;
  }, [min, max, minorStep, valueRange]);

  const isMajorTick = (val: number): boolean => {
    const rem = Math.abs(((val - min) / majorStep) - Math.round((val - min) / majorStep));
    return rem < 0.01;
  };

  const updatePointFromClientY = (seriesIdx: number, colIdx: number, clientY: number) => {
    const svg = svgRef.current;
    if (!svg) return;
    const rect = svg.getBoundingClientRect();
    if (rect.height <= 0) return;
    const svgY = ((clientY - rect.top) / rect.height) * height;
    const nextVal = yToValue(svgY);
    setSeriesValues((prev) =>
      prev.map((row, si) =>
        si === seriesIdx ? row.map((v, ci) => (ci === colIdx ? nextVal : v)) : row,
      ),
    );
  };

  const handleColumnPointerDown = (colIdx: number, e: React.PointerEvent<SVGRectElement>) => {
    if (!interactive) return;
    const editableIdx = spec.series.findIndex((s) => s.editable !== false);
    if (editableIdx < 0) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    draggingRef.current = { seriesIdx: editableIdx, colIdx };
    setActivePoint({ seriesIdx: editableIdx, colIdx });
    updatePointFromClientY(editableIdx, colIdx, e.clientY);
  };

  const handleColumnPointerMove = (e: React.PointerEvent<SVGRectElement>) => {
    if (!interactive || !draggingRef.current) return;
    e.stopPropagation();
    updatePointFromClientY(draggingRef.current.seriesIdx, draggingRef.current.colIdx, e.clientY);
  };

  const handleColumnPointerUp = (e: React.PointerEvent<SVGRectElement>) => {
    if (!draggingRef.current) return;
    e.stopPropagation();
    draggingRef.current = null;
  };

  const handleReset = () => {
    setSeriesValues(spec.series.map((s) => [...s.values]));
    setOverlayBar(spec.chartType === "overlay_compare");
    setActivePoint(null);
  };

  const wavePath = (yOffset: number): string => {
    const segs = 4;
    const segW = (plotRight - 10) / segs;
    let d = `M 10 ${yOffset}`;
    for (let i = 0; i < segs; i++) {
      const x0 = 10 + i * segW;
      const xMid = x0 + segW / 2;
      const x1 = x0 + segW;
      d += ` Q ${x0 + segW * 0.25} ${yOffset - 4}, ${xMid} ${yOffset} T ${x1} ${yOffset}`;
    }
    return d;
  };

  return (
    <div
      data-testid="graph-2d-widget"
      style={{
        position: "relative",
        width: "100%",
        height: "100%",
        borderRadius: 10,
        border: "1px solid #cbd5e1",
        background: "#ffffff",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      <svg
        ref={svgRef}
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height="100%"
        style={{ display: "block", touchAction: "none" }}
      >
        {/* Title */}
        {spec.title && (
          <text
            x={width / 2}
            y={20}
            textAnchor="middle"
            fontSize={13}
            fontWeight={700}
            fill="#0f172a"
          >
            {spec.title}
          </text>
        )}

        {/* Textbook green axis headers */}
        <rect x={10} y={plotTop} width={plotLeft - 10} height={plotBottom - plotTop + waveHeight} fill="#d1fae5" stroke="#64748b" strokeWidth={1} />
        <rect x={plotLeft} y={plotBottom + waveHeight} width={plotWidth} height={padBottom - 10} fill="#d1fae5" stroke="#64748b" strokeWidth={1} />
        <rect x={10} y={plotBottom + waveHeight} width={plotLeft - 10} height={padBottom - 10} fill="#d1fae5" stroke="#64748b" strokeWidth={1} />
        <line x1={10} y1={plotBottom + waveHeight + (padBottom - 10)} x2={plotLeft} y2={plotBottom + waveHeight} stroke="#64748b" strokeWidth={0.9} />
        <text x={24} y={plotBottom + waveHeight + 13} fontSize={10} fill="#1e293b" fontWeight={600}>
          {spec.yAxis.label}
        </text>
        <text x={plotLeft - 14} y={plotBottom + waveHeight + padBottom - 15} fontSize={10} fill="#1e293b" fontWeight={600} textAnchor="end">
          {spec.xAxis.label}
        </text>
        {spec.yAxis.unit && (
          <text x={16} y={plotTop + 14} fontSize={10} fill="#334155">
            ({spec.yAxis.unit})
          </text>
        )}

        {/* Plot grid background */}
        <rect x={plotLeft} y={plotTop} width={plotWidth} height={plotBottom - plotTop + waveHeight} fill="#ffffff" stroke="#64748b" strokeWidth={1} />

        {/* Horizontal gridlines & Y labels */}
        {minorTicks.map((val) => {
          const y = valueToY(val);
          const major = isMajorTick(val);
          return (
            <g key={val}>
              <line
                x1={plotLeft}
                y1={y}
                x2={plotRight}
                y2={y}
                stroke={major ? "#64748b" : "#cbd5e1"}
                strokeWidth={major ? 1.1 : 0.7}
              />
              {major && (
                <text
                  x={plotLeft - 6}
                  y={y}
                  textAnchor="end"
                  dominantBaseline="central"
                  fontSize={10}
                  fill="#0f172a"
                  fontWeight={600}
                >
                  {val}
                </text>
              )}
            </g>
          );
        })}

        {/* Vertical category gridlines & X labels */}
        {categories.map((cat, idx) => {
          const cx = colCenterX(idx);
          return (
            <g key={`${cat}-${idx}`}>
              <line
                x1={cx}
                y1={plotTop}
                x2={cx}
                y2={plotBottom + waveHeight}
                stroke="#94a3b8"
                strokeWidth={0.85}
              />
              <text
                x={cx}
                y={plotBottom + waveHeight + (padBottom - 10) / 2}
                textAnchor="middle"
                dominantBaseline="central"
                fontSize={11}
                fill="#0f172a"
                fontWeight={600}
              >
                {cat}
              </text>
            </g>
          );
        })}

        {/* Wave break (물결선) */}
        {hasWave && (
          <g data-testid="graph-wave-break">
            <rect
              x={10}
              y={plotBottom + 2}
              width={plotRight - 10}
              height={waveHeight - 4}
              fill="#ffffff"
            />
            <path d={wavePath(plotBottom + 5)} fill="none" stroke="#475569" strokeWidth={1.1} />
            <path d={wavePath(plotBottom + waveHeight - 5)} fill="none" stroke="#475569" strokeWidth={1.1} />
            <text
              x={plotLeft - 6}
              y={plotBottom + waveHeight - 2}
              textAnchor="end"
              fontSize={9}
              fill="#0f172a"
            >
              0
            </text>
          </g>
        )}

        {/* Series Rendering (Bar / Line / Overlay) */}
        {spec.series.map((s, si) => {
          const vals = seriesValues[si] ?? s.values;
          const showBars = s.type === "bar" || spec.chartType === "bar" || overlayBar;
          const showLine = s.type === "line" || spec.chartType === "line" || spec.chartType === "overlay_compare";
          const barW = Math.min(28, colStep * 0.44);

          const pts = vals
            .map((v, ci) => (v !== null ? { ci, x: colCenterX(ci), y: valueToY(v), v } : null))
            .filter((p): p is { ci: number; x: number; y: number; v: number } => p !== null);

          return (
            <g key={s.id}>
              {showBars &&
                pts.map((p) => (
                  <rect
                    key={`bar-${p.ci}`}
                    data-testid={`graph-bar-${si}-${p.ci}`}
                    x={p.x - barW / 2}
                    y={p.y}
                    width={barW}
                    height={Math.max(2, plotBottom - p.y)}
                    fill={overlayBar ? "#fdba74" : s.color}
                    fillOpacity={overlayBar ? 0.45 : 0.72}
                    stroke={overlayBar ? "#ea580c" : s.color}
                    strokeWidth={1.2}
                  />
                ))}

              {showLine && pts.length >= 2 && (
                <polyline
                  data-testid={`graph-line-${si}`}
                  fill="none"
                  stroke={s.color}
                  strokeWidth={2.2}
                  points={pts.map((p) => `${p.x},${p.y}`).join(" ")}
                />
              )}

              {showLine &&
                pts.map((p) => {
                  const isActive = activePoint?.seriesIdx === si && activePoint?.colIdx === p.ci;
                  return (
                    <g key={`pt-${p.ci}`}>
                      <circle
                        data-testid={`graph-point-${si}-${p.ci}`}
                        cx={p.x}
                        cy={p.y}
                        r={isActive ? 6 : 4}
                        fill={isActive ? "#2563eb" : "#0f172a"}
                        stroke="#ffffff"
                        strokeWidth={1.5}
                      />
                      {isActive && (
                        <text
                          x={p.x}
                          y={p.y - 10}
                          textAnchor="middle"
                          fontSize={10}
                          fontWeight={700}
                          fill="#1d4ed8"
                        >
                          {p.v}
                        </text>
                      )}
                    </g>
                  );
                })}
            </g>
          );
        })}

        {/* Interactive Column Hit Strips for Dragging/Plotting */}
        {interactive &&
          categories.map((_, colIdx) => (
            <rect
              key={`hit-${colIdx}`}
              data-testid={`graph-col-hit-${colIdx}`}
              x={plotLeft + colIdx * colStep}
              y={plotTop}
              width={colStep}
              height={plotHeight}
              fill="transparent"
              style={{ cursor: "ns-resize" }}
              onPointerDown={(e) => handleColumnPointerDown(colIdx, e)}
              onPointerMove={handleColumnPointerMove}
              onPointerUp={handleColumnPointerUp}
              onPointerCancel={handleColumnPointerUp}
            />
          ))}
      </svg>

      {/* Top-right HUD Controls */}
      {interactive && (
        <div
          style={{
            position: "absolute",
            top: 5,
            right: 6,
            display: "flex",
            gap: 4,
          }}
        >
          {spec.allowOverlayDrag && (
            <button
              type="button"
              data-testid="graph-overlay-toggle"
              onClick={() => setOverlayBar((v) => !v)}
              style={{
                padding: "2px 7px",
                borderRadius: 6,
                border: overlayBar ? "1px solid #ea580c" : "1px solid #cbd5e1",
                background: overlayBar ? "#ffedd5" : "#ffffff",
                color: overlayBar ? "#c2410c" : "#334155",
                fontSize: 10,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {overlayBar ? "막대 숨기기" : "막대 겹치기"}
            </button>
          )}
          <button
            type="button"
            data-testid="graph-reset-btn"
            onClick={handleReset}
            style={{
              padding: "2px 7px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
              color: "#334155",
              fontSize: 10,
              fontWeight: 600,
              cursor: "pointer",
            }}
          >
            초기화
          </button>
        </div>
      )}
    </div>
  );
};
