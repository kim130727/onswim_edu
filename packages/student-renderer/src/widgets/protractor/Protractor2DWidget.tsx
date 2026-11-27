import React, { useMemo, useRef, useState } from "react";
import { normalizeProtractorProps } from "../types";

export interface Protractor2DWidgetProps {
  width: number;
  height: number;
  rawProps?: Record<string, unknown>;
  interactive?: boolean;
}

interface Pose {
  x: number;
  y: number;
  angle: number; // degrees, 0 = horizontal baseline facing upward semicircle
}

function normalizeAngleDeg(deg: number): number {
  let a = deg % 360;
  if (a > 180) a -= 360;
  if (a <= -180) a += 360;
  return a;
}

function shortestAngleDiffDeg(a: number, b: number): number {
  return normalizeAngleDeg(a - b);
}

export const Protractor2DWidget: React.FC<Protractor2DWidgetProps> = ({
  width,
  height,
  rawProps,
  interactive = true,
}) => {
  const spec = useMemo(
    () => normalizeProtractorProps(rawProps, width, height),
    [rawProps, width, height],
  );

  const initialPose: Pose = useMemo(
    () => ({
      x: spec.protractor.initialX,
      y: spec.protractor.initialY,
      angle: spec.protractor.initialAngle,
    }),
    [spec.protractor.initialX, spec.protractor.initialY, spec.protractor.initialAngle],
  );

  const [pose, setPose] = useState<Pose>(initialPose);
  const [drawnLines, setDrawnLines] = useState<Array<{ x1: number; y1: number; x2: number; y2: number; isPerpendicular: boolean }>>([]);
  const [snappedCenter, setSnappedCenter] = useState(false);
  const [snappedAngle, setSnappedAngle] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const dragModeRef = useRef<"none" | "move" | "rotate">("none");
  const dragOffsetRef = useRef<{ dx: number; dy: number; startAngle: number; pointerStartAngle: number }>({
    dx: 0,
    dy: 0,
    startAngle: 0,
    pointerStartAngle: 0,
  });

  const baseLineAngle = useMemo(() => {
    const { x1, y1, x2, y2 } = spec.baseLine;
    return normalizeAngleDeg((Math.atan2(y2 - y1, x2 - x1) * 180) / Math.PI);
  }, [spec.baseLine]);

  const toSvgPoint = (clientX: number, clientY: number): { x: number; y: number } => {
    const svg = svgRef.current;
    if (!svg) return { x: 0, y: 0 };
    const rect = svg.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return { x: 0, y: 0 };
    return {
      x: ((clientX - rect.left) / rect.width) * width,
      y: ((clientY - rect.top) / rect.height) * height,
    };
  };

  const applySnapping = (nextX: number, nextY: number, nextAngle: number): { pose: Pose; centerHit: boolean; angleHit: boolean } => {
    let x = Math.max(16, Math.min(width - 16, nextX));
    let y = Math.max(16, Math.min(height - 16, nextY));
    let angle = normalizeAngleDeg(nextAngle);
    let centerHit = false;
    let angleHit = false;

    const tolPx = spec.snapTolerancePx ?? 14;
    if (spec.showBaseLine && spec.anchorPoint) {
      const dist = Math.hypot(x - spec.anchorPoint.x, y - spec.anchorPoint.y);
      if (dist <= tolPx) {
        x = spec.anchorPoint.x;
        y = spec.anchorPoint.y;
        centerHit = true;
      }
    }

    if (spec.showBaseLine) {
      const tolDeg = spec.snapToleranceDeg ?? 4;
      const diff0 = Math.abs(shortestAngleDiffDeg(angle, baseLineAngle));
      const diff180 = Math.abs(shortestAngleDiffDeg(angle, baseLineAngle + 180));
      if (diff0 <= tolDeg) {
        angle = baseLineAngle;
        angleHit = true;
      } else if (diff180 <= tolDeg) {
        angle = normalizeAngleDeg(baseLineAngle + 180);
        angleHit = true;
      }
    }

    return { pose: { x, y, angle }, centerHit, angleHit };
  };

  const handleMovePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (!interactive) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toSvgPoint(e.clientX, e.clientY);
    dragModeRef.current = "move";
    dragOffsetRef.current = {
      dx: pose.x - pt.x,
      dy: pose.y - pt.y,
      startAngle: pose.angle,
      pointerStartAngle: 0,
    };
  };

  const handleRotatePointerDown = (e: React.PointerEvent<SVGGElement>) => {
    if (!interactive) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    const pt = toSvgPoint(e.clientX, e.clientY);
    const pointerAngle = (Math.atan2(pt.y - pose.y, pt.x - pose.x) * 180) / Math.PI;
    dragModeRef.current = "rotate";
    dragOffsetRef.current = {
      dx: 0,
      dy: 0,
      startAngle: pose.angle,
      pointerStartAngle: pointerAngle,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<SVGElement>) => {
    if (!interactive || dragModeRef.current === "none") return;
    e.stopPropagation();
    const pt = toSvgPoint(e.clientX, e.clientY);
    if (dragModeRef.current === "move") {
      const snapped = applySnapping(
        pt.x + dragOffsetRef.current.dx,
        pt.y + dragOffsetRef.current.dy,
        pose.angle,
      );
      setPose(snapped.pose);
      setSnappedCenter(snapped.centerHit);
      setSnappedAngle(snapped.angleHit);
    } else if (dragModeRef.current === "rotate") {
      const pointerAngle = (Math.atan2(pt.y - pose.y, pt.x - pose.x) * 180) / Math.PI;
      const delta = pointerAngle - dragOffsetRef.current.pointerStartAngle;
      const snapped = applySnapping(
        pose.x,
        pose.y,
        dragOffsetRef.current.startAngle + delta,
      );
      setPose(snapped.pose);
      setSnappedCenter(snapped.centerHit);
      setSnappedAngle(snapped.angleHit);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<SVGElement>) => {
    if (dragModeRef.current === "none") return;
    e.stopPropagation();
    dragModeRef.current = "none";
  };

  const handleDraw90Line = () => {
    if (!interactive || !spec.allowDrawPerpendicular) return;
    const rad = ((pose.angle - 90) * Math.PI) / 180;
    const len = spec.protractor.radius * 1.28;
    const x2 = pose.x + Math.cos(rad) * len;
    const y2 = pose.y + Math.sin(rad) * len;
    const isPerpendicular = snappedCenter && snappedAngle;
    setDrawnLines([{ x1: pose.x, y1: pose.y, x2, y2, isPerpendicular }]);
  };

  const handleReset = () => {
    setPose(initialPose);
    setDrawnLines([]);
    setSnappedCenter(false);
    setSnappedAngle(false);
  };

  const radius = spec.protractor.radius;
  const innerRadius = radius * 0.3;
  const opacity = spec.protractor.opacity ?? 0.78;
  const ticks = useMemo(() => {
    const items: Array<{ deg: number; major: boolean; mid: boolean }> = [];
    for (let deg = 0; deg <= 180; deg += 5) {
      items.push({ deg, major: deg % 10 === 0, mid: deg % 10 === 5 });
    }
    return items;
  }, []);

  const isAligned = snappedCenter && snappedAngle;

  return (
    <div
      data-testid="protractor-2d-widget"
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
        {/* Optional Base line & Anchor point */}
        {spec.showBaseLine && (
          <>
            <line
              x1={spec.baseLine.x1}
              y1={spec.baseLine.y1}
              x2={spec.baseLine.x2}
              y2={spec.baseLine.y2}
              stroke="#1e293b"
              strokeWidth={2.2}
              strokeLinecap="round"
            />
            {spec.anchorPoint && (
              <g>
                <circle
                  cx={spec.anchorPoint.x}
                  cy={spec.anchorPoint.y}
                  r={snappedCenter ? 7 : 4.5}
                  fill={snappedCenter ? "#10b981" : "#0f172a"}
                  fillOpacity={snappedCenter ? 0.35 : 1}
                  stroke={snappedCenter ? "#059669" : "none"}
                  strokeWidth={1.5}
                />
                {snappedCenter && (
                  <circle
                    cx={spec.anchorPoint.x}
                    cy={spec.anchorPoint.y}
                    r={3}
                    fill="#059669"
                  />
                )}
              </g>
            )}
          </>
        )}

        {/* Drawn perpendicular lines */}
        {drawnLines.map((line, i) => (
          <line
            key={i}
            data-testid="protractor-drawn-line"
            x1={line.x1}
            y1={line.y1}
            x2={line.x2}
            y2={line.y2}
            stroke={line.isPerpendicular ? "#059669" : "#2563eb"}
            strokeWidth={2.2}
            strokeLinecap="round"
          />
        ))}

        {/* Movable & Rotatable Protractor */}
        <g
          data-testid="protractor-tool"
          transform={`translate(${pose.x}, ${pose.y}) rotate(${pose.angle})`}
          opacity={opacity}
        >
          {/* Semi-circle body */}
          <g
            style={{ cursor: interactive ? "grab" : "default" }}
            onPointerDown={handleMovePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
          >
            <path
              d={`M ${-radius} 0 A ${radius} ${radius} 0 0 1 ${radius} 0 Z`}
              fill={isAligned ? "#dcfce7" : "#e0f2fe"}
              stroke={isAligned ? "#059669" : "#0284c7"}
              strokeWidth={2}
            />
            <path
              d={`M ${-innerRadius} 0 A ${innerRadius} ${innerRadius} 0 0 1 ${innerRadius} 0 Z`}
              fill="#ffffff"
              fillOpacity={0.75}
              stroke={isAligned ? "#059669" : "#38bdf8"}
              strokeWidth={1.2}
            />
            {/* Baseline */}
            <line
              x1={-radius}
              y1={0}
              x2={radius}
              y2={0}
              stroke={isAligned ? "#059669" : "#0284c7"}
              strokeWidth={1.8}
            />
            {/* Center crosshair */}
            <line x1={-8} y1={0} x2={8} y2={0} stroke="#0369a1" strokeWidth={1.4} />
            <line x1={0} y1={-8} x2={0} y2={4} stroke="#0369a1" strokeWidth={1.4} />
            <circle cx={0} cy={0} r={2.5} fill="#0369a1" />

            {/* Tick marks & 10-degree labels */}
            {ticks.map(({ deg, major }) => {
              const rad = (deg * Math.PI) / 180;
              const cos = Math.cos(rad);
              const sin = Math.sin(rad);
              const outerX = -cos * radius;
              const outerY = -sin * radius;
              const tickLen = deg === 90 ? 14 : major ? 10 : 6;
              const innerX = -cos * (radius - tickLen);
              const innerY = -sin * (radius - tickLen);
              const labelR = radius - 18;
              const labelX = -cos * labelR;
              const labelY = -sin * labelR;
              return (
                <g key={deg}>
                  <line
                    x1={outerX}
                    y1={outerY}
                    x2={innerX}
                    y2={innerY}
                    stroke={deg === 90 ? "#dc2626" : "#0284c7"}
                    strokeWidth={deg === 90 ? 1.8 : major ? 1.1 : 0.7}
                  />
                  {major && deg % 20 === 0 && (
                    <text
                      x={labelX}
                      y={labelY}
                      fontSize={Math.max(7, Math.round(radius * 0.085))}
                      fill={deg === 90 ? "#dc2626" : "#0369a1"}
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontWeight={deg === 90 ? 700 : 500}
                    >
                      {deg}
                    </text>
                  )}
                  {deg === 90 && (
                    <text
                      x={labelX}
                      y={labelY}
                      fontSize={Math.max(8, Math.round(radius * 0.095))}
                      fill="#dc2626"
                      textAnchor="middle"
                      dominantBaseline="central"
                      fontWeight={700}
                    >
                      90
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* Rotate Handle at top (90 deg) */}
          {interactive && (
            <g
              data-testid="protractor-rotate-handle"
              transform={`translate(0, ${-radius - 16})`}
              style={{ cursor: "ew-resize" }}
              onPointerDown={handleRotatePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerCancel={handlePointerUp}
            >
              <line x1={0} y1={16} x2={0} y2={0} stroke="#0284c7" strokeWidth={1.5} strokeDasharray="3 2" />
              <circle cx={0} cy={0} r={9} fill="#0284c7" stroke="#ffffff" strokeWidth={2} />
              <text
                x={0}
                y={0.5}
                fontSize={10}
                fill="#ffffff"
                textAnchor="middle"
                dominantBaseline="central"
                fontWeight={700}
              >
                ↻
              </text>
            </g>
          )}
        </g>
      </svg>

      {/* Compact HUD toolbar */}
      {interactive && (
        <div
          style={{
            position: "absolute",
            top: 6,
            right: 6,
            display: "flex",
            alignItems: "center",
            gap: 4,
            fontSize: 11,
          }}
        >
          {isAligned && (
            <span
              data-testid="protractor-aligned-badge"
              style={{
                padding: "2px 6px",
                borderRadius: 999,
                background: "#dcfce7",
                color: "#047857",
                fontWeight: 700,
                border: "1px solid #86efac",
              }}
            >
              밑금 일치
            </span>
          )}
          {spec.allowDrawPerpendicular && (
            <button
              type="button"
              data-testid="protractor-draw-btn"
              onClick={handleDraw90Line}
              style={{
                padding: "3px 8px",
                borderRadius: 6,
                border: "1px solid #0284c7",
                background: "#0284c7",
                color: "#ffffff",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              90° 수선 긋기
            </button>
          )}
          <button
            type="button"
            data-testid="protractor-reset-btn"
            onClick={handleReset}
            style={{
              padding: "3px 7px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#f8fafc",
              color: "#334155",
              fontSize: 11,
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
