import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { normalizeSolid3DProps, type Solid3DItemSpec } from "../types";
import {
  addTextbookLighting,
  applyCameraOrbit,
  CAMERA_PRESET_ANGLES,
  createOrthoCamera,
  createOutlinedMesh,
  createSlantedPrismGeometry,
  createTextbookRenderer,
  disposeGroup,
  updateOrthoCameraAspect,
  type CameraPreset,
  type SphericalAngles,
} from "./textbookScene";

export interface Solid3DWidgetProps {
  width: number;
  height: number;
  rawProps?: Record<string, unknown>;
  interactive?: boolean;
}

function buildSolidGeometry(item: Solid3DItemSpec): THREE.BufferGeometry {
  const { w, d, h } = item.dimensions;
  switch (item.shape) {
    case "cube": {
      const s = Math.max(w, d, h);
      return new THREE.BoxGeometry(s, s, s);
    }
    case "cylinder":
      return new THREE.CylinderGeometry(w / 2, w / 2, h, 32);
    case "prism":
      return new THREE.CylinderGeometry(w / 2, w / 2, h, 3);
    case "slanted_prism":
      return createSlantedPrismGeometry(w, h, d);
    case "cuboid":
    default:
      return new THREE.BoxGeometry(w, h, d);
  }
}

export const Solid3DWidget: React.FC<Solid3DWidgetProps> = ({
  rawProps,
  interactive = true,
}) => {
  const spec = useMemo(() => normalizeSolid3DProps(rawProps), [rawProps]);
  const [overlayMode, setOverlayMode] = useState(false);
  const [unitCubesOn, setUnitCubesOn] = useState(false);
  const [activePreset, setActivePreset] = useState<CameraPreset>("isometric");
  const [webglReady, setWebglReady] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const rootGroupRef = useRef<THREE.Group | null>(null);
  const anglesRef = useRef<SphericalAngles>({ ...CAMERA_PRESET_ANGLES.isometric });
  const targetAnglesRef = useRef<SphericalAngles | null>(null);
  const pointerDownRef = useRef<{ x: number; y: number; yaw: number; pitch: number } | null>(null);

  const cameraFraming = useMemo(() => {
    const gap = 1.8;
    const widths = spec.solids.map((s) => (s.shape === "cube" ? s.dimensions.w : s.dimensions.w));
    const totalSpanW = widths.reduce((sum, w) => sum + w, 0) + Math.max(0, widths.length - 1) * gap;
    let cursorX = -totalSpanW / 2;
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;

    spec.solids.forEach((s) => {
      const w = s.dimensions.w;
      const h = s.shape === "cube" ? w : s.dimensions.h;
      const d = s.shape === "cube" || s.shape === "cylinder" || s.shape === "prism" ? w : s.dimensions.d;
      const ox = s.position?.x ?? 0;
      const oy = s.position?.y ?? 0;
      const oz = s.position?.z ?? 0;
      const baseX = overlayMode ? w / 2 - 1.5 : cursorX + w / 2;
      const baseY = h / 2;
      const baseZ = overlayMode ? d / 2 - 1 : 0;
      const cx = baseX + (overlayMode ? 0 : ox);
      const cy = baseY + (overlayMode ? 0 : oy);
      const cz = baseZ + (overlayMode ? 0 : oz);
      cursorX += w + gap;

      minX = Math.min(minX, cx - w / 2);
      maxX = Math.max(maxX, cx + w / 2);
      minY = Math.min(minY, cy - h / 2);
      maxY = Math.max(maxY, cy + h / 2);
      minZ = Math.min(minZ, cz - d / 2);
      maxZ = Math.max(maxZ, cz + d / 2);
    });

    if (!Number.isFinite(minX)) {
      return { frustumSize: 10, target: new THREE.Vector3(0, 1.5, 0) };
    }

    const spanX = Math.max(2, maxX - minX);
    const spanY = Math.max(2, maxY - minY);
    const spanZ = Math.max(2, maxZ - minZ);
    const diag = Math.hypot(spanX, spanY, spanZ);
    const frustumSize = Math.max(spanY * 1.9, diag * 1.15, 6);
    const target = new THREE.Vector3((minX + maxX) / 2, (minY + maxY) / 2, (minZ + maxZ) / 2);
    return { frustumSize, target };
  }, [spec.solids, overlayMode]);

  const frustumSize = cameraFraming.frustumSize;
  const cameraTargetRef = useRef<THREE.Vector3>(cameraFraming.target);
  cameraTargetRef.current = cameraFraming.target;

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const w = Math.max(120, container.clientWidth || 360);
    const h = Math.max(120, container.clientHeight || 220);
    const renderer = createTextbookRenderer(canvas, w, h);
    if (!renderer) {
      setWebglReady(false);
      return;
    }

    const scene = new THREE.Scene();
    addTextbookLighting(scene);

    const rootGroup = new THREE.Group();
    scene.add(rootGroup);
    rootGroupRef.current = rootGroup;

    const camera = createOrthoCamera(w, h, frustumSize);
    applyCameraOrbit(camera, anglesRef.current, cameraTargetRef.current, 24);

    let rafId = 0;
    const animate = () => {
      rafId = requestAnimationFrame(animate);
      if (targetAnglesRef.current) {
        const cur = anglesRef.current;
        const tgt = targetAnglesRef.current;
        cur.yaw += (tgt.yaw - cur.yaw) * 0.18;
        cur.pitch += (tgt.pitch - cur.pitch) * 0.18;
        if (Math.abs(tgt.yaw - cur.yaw) < 0.004 && Math.abs(tgt.pitch - cur.pitch) < 0.004) {
          cur.yaw = tgt.yaw;
          cur.pitch = tgt.pitch;
          targetAnglesRef.current = null;
        }
      }
      updateOrthoCameraAspect(camera, container.clientWidth || w, container.clientHeight || h, frustumSize);
      applyCameraOrbit(camera, anglesRef.current, cameraTargetRef.current, 24);
      renderer.render(scene, camera);
    };
    animate();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        const nw = Math.max(120, container.clientWidth || 360);
        const nh = Math.max(120, container.clientHeight || 220);
        renderer.setSize(nw, nh, false);
        updateOrthoCameraAspect(camera, nw, nh, frustumSize);
      });
      ro.observe(container);
    }

    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      disposeGroup(rootGroup);
      renderer.dispose();
      rootGroupRef.current = null;
    };
  }, [frustumSize]);

  // Rebuild solid meshes when solids, overlayMode, or unitCubesOn changes
  useEffect(() => {
    const root = rootGroupRef.current;
    if (!root) return;
    disposeGroup(root);
    root.clear();

    const gap = 1.8;
    const totalW =
      spec.solids.reduce((sum, s) => sum + s.dimensions.w, 0) +
      Math.max(0, spec.solids.length - 1) * gap;
    let cursorX = -totalW / 2;

    spec.solids.forEach((item, idx) => {
      const geom = buildSolidGeometry(item);
      const opacity = overlayMode ? (idx === 0 ? 0.35 : 0.62) : unitCubesOn ? 0.22 : 0.88;
      const meshGroup = createOutlinedMesh(geom, {
        color: item.color ?? "#7dd3fc",
        opacity,
        edgeColor: "#1e293b",
        showHiddenEdges: item.showHiddenEdges !== false,
      });

      const w = item.dimensions.w;
      const h = item.shape === "cube" ? w : item.dimensions.h;
      const d = item.shape === "cube" || item.shape === "cylinder" || item.shape === "prism" ? w : item.dimensions.d;
      const ox = item.position?.x ?? 0;
      const oy = item.position?.y ?? 0;
      const oz = item.position?.z ?? 0;

      if (overlayMode) {
        // Align bottom-left-front corner of all solids for direct height/volume comparison
        meshGroup.position.set(w / 2 - 1.5, h / 2, d / 2 - 1);
      } else {
        meshGroup.position.set(cursorX + w / 2 + ox, h / 2 + oy, oz);
      }
      cursorX += w + gap;

      root.add(meshGroup);

      // Optional 1cm^3 unit cube fill for cuboids/cubes
      if (unitCubesOn && (item.shape === "cuboid" || item.shape === "cube")) {
        const cols = Math.min(8, Math.max(1, Math.round(w)));
        const rows = Math.min(8, Math.max(1, Math.round(h)));
        const deps = Math.min(8, Math.max(1, Math.round(d)));
        const unitGroup = new THREE.Group();
        const originX = meshGroup.position.x - w / 2 + 0.5;
        const originY = meshGroup.position.y - h / 2 + 0.5;
        const originZ = meshGroup.position.z - d / 2 + 0.5;
        for (let ix = 0; ix < cols; ix++) {
          for (let iy = 0; iy < rows; iy++) {
            for (let iz = 0; iz < deps; iz++) {
              const u = createOutlinedMesh(new THREE.BoxGeometry(0.94, 0.94, 0.94), {
                color: item.color ?? "#7dd3fc",
                opacity: 0.72,
                edgeColor: "#334155",
              });
              u.position.set(originX + ix, originY + iy, originZ + iz);
              unitGroup.add(u);
            }
          }
        }
        root.add(unitGroup);
      }
    });
  }, [spec.solids, overlayMode, unitCubesOn]);

  const handleSelectPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    targetAnglesRef.current = { ...CAMERA_PRESET_ANGLES[preset] };
  };

  const handleReset = () => {
    setOverlayMode(false);
    setUnitCubesOn(false);
    handleSelectPreset("isometric");
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive) return;
    e.stopPropagation();
    e.currentTarget.setPointerCapture(e.pointerId);
    targetAnglesRef.current = null;
    pointerDownRef.current = {
      x: e.clientX,
      y: e.clientY,
      yaw: anglesRef.current.yaw,
      pitch: anglesRef.current.pitch,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive || !pointerDownRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - pointerDownRef.current.x;
    const dy = e.clientY - pointerDownRef.current.y;
    anglesRef.current.yaw = pointerDownRef.current.yaw - dx * 0.01;
    anglesRef.current.pitch = Math.max(
      -Math.PI / 2 + 0.05,
      Math.min(Math.PI / 2 - 0.01, pointerDownRef.current.pitch + dy * 0.01),
    );
  };

  return (
    <div
      ref={containerRef}
      data-testid="solid-3d-widget"
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
      {webglReady ? (
        <canvas
          ref={canvasRef}
          data-testid="solid-3d-canvas"
          style={{ width: "100%", height: "100%", display: "block", cursor: interactive ? "grab" : "default" }}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={() => {
            pointerDownRef.current = null;
          }}
          onPointerCancel={() => {
            pointerDownRef.current = null;
          }}
        />
      ) : (
        <div
          data-testid="solid-3d-fallback"
          style={{
            width: "100%",
            height: "100%",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: 12,
            color: "#475569",
          }}
        >
          3D 입체도형 ({spec.solids.length}개)
        </div>
      )}

      {/* Top-left view presets */}
      {interactive && (
        <div style={{ position: "absolute", top: 6, left: 6, display: "flex", gap: 3 }}>
          {(
            [
              ["isometric", "입체"],
              ["top", "위"],
              ["front", "앞"],
              ["side", "옆"],
            ] as Array<[CameraPreset, string]>
          ).map(([preset, label]) => (
            <button
              key={preset}
              type="button"
              onClick={() => handleSelectPreset(preset)}
              style={{
                padding: "2px 7px",
                borderRadius: 6,
                border: activePreset === preset ? "1px solid #0284c7" : "1px solid #cbd5e1",
                background: activePreset === preset ? "#0284c7" : "#ffffff",
                color: activePreset === preset ? "#ffffff" : "#334155",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {label}
            </button>
          ))}
        </div>
      )}

      {/* Top-right compare / unit-cube / reset controls */}
      {interactive && (
        <div style={{ position: "absolute", top: 6, right: 6, display: "flex", gap: 4, flexWrap: "wrap" }}>
          {spec.allowOverlayCompare && spec.solids.length >= 2 && (
            <button
              type="button"
              data-testid="solid-overlay-btn"
              onClick={() => setOverlayMode((v) => !v)}
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                border: overlayMode ? "1px solid #7c3aed" : "1px solid #cbd5e1",
                background: overlayMode ? "#ede9fe" : "#ffffff",
                color: overlayMode ? "#6d28d9" : "#334155",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              {overlayMode ? "나란히 보기" : "겹쳐 비교하기"}
            </button>
          )}
          {spec.allowUnitCubeFill && (
            <button
              type="button"
              data-testid="solid-unit-cube-btn"
              onClick={() => setUnitCubesOn((v) => !v)}
              style={{
                padding: "2px 8px",
                borderRadius: 6,
                border: unitCubesOn ? "1px solid #0284c7" : "1px solid #cbd5e1",
                background: unitCubesOn ? "#e0f2fe" : "#ffffff",
                color: unitCubesOn ? "#0369a1" : "#334155",
                fontSize: 11,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              1cm³ 채우기
            </button>
          )}
          <button
            type="button"
            data-testid="solid-reset-btn"
            onClick={handleReset}
            style={{
              padding: "2px 7px",
              borderRadius: 6,
              border: "1px solid #cbd5e1",
              background: "#ffffff",
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

      {/* Bottom dimension badges */}
      <div
        style={{
          position: "absolute",
          bottom: 6,
          left: 6,
          right: 6,
          display: "flex",
          gap: 6,
          flexWrap: "wrap",
          pointerEvents: "none",
        }}
      >
        {spec.solids.map((s) =>
          s.showDimensions !== false ? (
            <span
              key={s.id}
              style={{
                padding: "2px 7px",
                borderRadius: 6,
                background: "rgba(255,255,255,0.92)",
                border: "1px solid #e2e8f0",
                fontSize: 11,
                fontWeight: 600,
                color: "#1e293b",
              }}
            >
              {s.label ? `${s.label}: ` : ""}
              {s.shape === "cube"
                ? `한 모서리 ${s.dimensions.w} ${s.dimensions.unit ?? "cm"}`
                : s.shape === "cylinder"
                  ? `지름 ${s.dimensions.w} · 높이 ${s.dimensions.h} ${s.dimensions.unit ?? "cm"}`
                  : s.shape === "prism"
                    ? `밑면 ${s.dimensions.w} · 높이 ${s.dimensions.h} ${s.dimensions.unit ?? "cm"}`
                    : `${s.dimensions.w}×${s.dimensions.d}×${s.dimensions.h} ${s.dimensions.unit ?? "cm"}`}
            </span>
          ) : null,
        )}
      </div>
    </div>
  );
};
