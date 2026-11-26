import React, { useEffect, useMemo, useRef, useState } from "react";
import * as THREE from "three";
import { normalizeVoxel3DProps } from "../types";
import {
  addTextbookLighting,
  applyCameraOrbit,
  CAMERA_PRESET_ANGLES,
  createOrthoCamera,
  createOutlinedMesh,
  createTextbookRenderer,
  disposeGroup,
  type CameraPreset,
  type SphericalAngles,
} from "./textbookScene";
import {
  areVoxelShapesCongruent,
  computeVoxelProjections,
  dedupeVoxels,
  voxelKey,
  type VoxelCoord,
} from "./voxelMath";

export interface Voxel3DWidgetProps {
  width: number;
  height: number;
  rawProps?: Record<string, unknown>;
  interactive?: boolean;
}

function ProjectionMiniGrid({
  title,
  grid,
  color,
  badgeBg,
}: {
  title: string;
  grid: boolean[][];
  color: string;
  badgeBg: string;
}) {
  const rows = grid.length;
  const cols = grid[0]?.length ?? 0;
  return (
    <div
      data-testid={`voxel-projection-${title}`}
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
      }}
    >
      <span
        style={{
          fontSize: 10,
          fontWeight: 700,
          padding: "1px 6px",
          borderRadius: 4,
          background: badgeBg,
          color: "#1e293b",
        }}
      >
        {title}
      </span>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: `repeat(${cols}, 14px)`,
          gridTemplateRows: `repeat(${rows}, 14px)`,
          border: "1px dashed #93c5fd",
          background: "#ffffff",
        }}
      >
        {grid.flatMap((row, r) =>
          row.map((filled, c) => (
            <div
              key={`${r}-${c}`}
              style={{
                width: 14,
                height: 14,
                boxSizing: "border-box",
                border: filled ? "1px solid #0284c7" : "0.5px dashed #cbd5e1",
                background: filled ? color : "transparent",
              }}
            />
          )),
        )}
      </div>
    </div>
  );
}

export const Voxel3DWidget: React.FC<Voxel3DWidgetProps> = ({
  rawProps,
  interactive = true,
}) => {
  const spec = useMemo(() => normalizeVoxel3DProps(rawProps), [rawProps]);
  const [extraBlocks, setExtraBlocks] = useState<VoxelCoord[]>([]);
  const [activePreset, setActivePreset] = useState<CameraPreset>(spec.cameraPreset ?? "isometric");
  const [compareIdx, setCompareIdx] = useState<number | null>(null);
  const [webglReady, setWebglReady] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<HTMLDivElement>(null);

  const allBlocks = useMemo(
    () => dedupeVoxels([...spec.baseBlocks, ...extraBlocks]),
    [spec.baseBlocks, extraBlocks],
  );
  const projections = useMemo(() => computeVoxelProjections(allBlocks, 3), [allBlocks]);

  const compareShape =
    compareIdx !== null && spec.compareShapes ? spec.compareShapes[compareIdx] ?? null : null;
  const isCompareMatch = useMemo(() => {
    if (!compareShape) return false;
    return areVoxelShapesCongruent(allBlocks, compareShape.blocks);
  }, [allBlocks, compareShape]);

  // Mutable scene refs for smooth animation & raycasting
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.OrthographicCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const blockGroupRef = useRef<THREE.Group | null>(null);
  const ghostGroupRef = useRef<THREE.Group | null>(null);
  const anglesRef = useRef<SphericalAngles>({ ...CAMERA_PRESET_ANGLES[spec.cameraPreset ?? "isometric"] });
  const targetAnglesRef = useRef<SphericalAngles | null>(null);
  const centerRef = useRef<THREE.Vector3>(new THREE.Vector3(0, 0.5, 0));

  const pointerDownRef = useRef<{ x: number; y: number; yaw: number; pitch: number; moved: boolean } | null>(null);
  const extraLimitRef = useRef(spec.extraBlocksLimit ?? 0);
  extraLimitRef.current = spec.extraBlocksLimit ?? 0;
  const baseKeysRef = useRef(new Set(spec.baseBlocks.map(voxelKey)));
  baseKeysRef.current = new Set(spec.baseBlocks.map(voxelKey));

  // Initialize Three.js scene once
  useEffect(() => {
    const canvas = canvasRef.current;
    const container = viewportRef.current;
    if (!canvas || !container) return;

    const w = Math.max(120, container.clientWidth || 320);
    const h = Math.max(120, container.clientHeight || 220);
    const renderer = createTextbookRenderer(canvas, w, h);
    if (!renderer) {
      setWebglReady(false);
      return;
    }

    const scene = new THREE.Scene();
    addTextbookLighting(scene);

    const gridHelper = new THREE.GridHelper(6, 6, 0xcbd5e1, 0xe2e8f0);
    gridHelper.position.y = -0.5;
    scene.add(gridHelper);

    const blockGroup = new THREE.Group();
    const ghostGroup = new THREE.Group();
    scene.add(blockGroup);
    scene.add(ghostGroup);

    const camera = createOrthoCamera(w, h, 5.8);
    applyCameraOrbit(camera, anglesRef.current, centerRef.current);

    sceneRef.current = scene;
    cameraRef.current = camera;
    rendererRef.current = renderer;
    blockGroupRef.current = blockGroup;
    ghostGroupRef.current = ghostGroup;

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
      applyCameraOrbit(camera, anglesRef.current, centerRef.current);
      renderer.render(scene, camera);
    };
    animate();

    let ro: ResizeObserver | null = null;
    if (typeof ResizeObserver !== "undefined") {
      ro = new ResizeObserver(() => {
        const nw = Math.max(120, container.clientWidth || 320);
        const nh = Math.max(120, container.clientHeight || 220);
        renderer.setSize(nw, nh, false);
        updateCamera(camera, nw, nh);
      });
      ro.observe(container);
    }

    return () => {
      cancelAnimationFrame(rafId);
      ro?.disconnect();
      disposeGroup(blockGroup);
      disposeGroup(ghostGroup);
      renderer.dispose();
      sceneRef.current = null;
      cameraRef.current = null;
      rendererRef.current = null;
      blockGroupRef.current = null;
      ghostGroupRef.current = null;
    };
  }, []);

  // Rebuild voxel meshes whenever blocks or ghost compare shape change
  useEffect(() => {
    const blockGroup = blockGroupRef.current;
    const ghostGroup = ghostGroupRef.current;
    if (!blockGroup || !ghostGroup) return;

    disposeGroup(blockGroup);
    blockGroup.clear();
    disposeGroup(ghostGroup);
    ghostGroup.clear();

    const baseSet = new Set(spec.baseBlocks.map(voxelKey));
    const xs = allBlocks.map((b) => b[0]);
    const ys = allBlocks.map((b) => b[1]);
    const zs = allBlocks.map((b) => b[2]);
    const cx = xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0;
    const cy = ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0;
    const cz = zs.length ? (Math.min(...zs) + Math.max(...zs)) / 2 : 0;
    centerRef.current.set(cx, cy, cz);

    for (const coord of allBlocks) {
      const isExtra = !baseSet.has(voxelKey(coord));
      const boxGeom = new THREE.BoxGeometry(0.98, 0.98, 0.98);
      const cube = createOutlinedMesh(boxGeom, {
        color: isExtra ? "#38bdf8" : "#f3be7a",
        edgeColor: isExtra ? "#0369a1" : "#92400e",
      });
      cube.position.set(coord[0], coord[1], coord[2]);
      cube.traverse((child) => {
        if (child instanceof THREE.Mesh) {
          child.userData = { coord, isExtra };
        }
      });
      blockGroup.add(cube);
    }

    if (compareShape) {
      for (const coord of compareShape.blocks) {
        const ghostGeom = new THREE.BoxGeometry(1.01, 1.01, 1.01);
        const ghostCube = createOutlinedMesh(ghostGeom, {
          color: "#a855f7",
          opacity: 0.32,
          edgeColor: "#7e22ce",
          showHiddenEdges: true,
        });
        ghostCube.position.set(coord[0], coord[1], coord[2]);
        ghostGroup.add(ghostCube);
      }
    }
  }, [allBlocks, spec.baseBlocks, compareShape]);

  const handleSelectPreset = (preset: CameraPreset) => {
    setActivePreset(preset);
    targetAnglesRef.current = { ...CAMERA_PRESET_ANGLES[preset] };
  };

  const handleReset = () => {
    setExtraBlocks([]);
    setCompareIdx(null);
    handleSelectPreset(spec.cameraPreset ?? "isometric");
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
      moved: false,
    };
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!interactive || !pointerDownRef.current) return;
    e.stopPropagation();
    const dx = e.clientX - pointerDownRef.current.x;
    const dy = e.clientY - pointerDownRef.current.y;
    if (Math.hypot(dx, dy) > 5) {
      pointerDownRef.current.moved = true;
    }
    anglesRef.current.yaw = pointerDownRef.current.yaw - dx * 0.01;
    anglesRef.current.pitch = Math.max(
      -Math.PI / 2 + 0.05,
      Math.min(Math.PI / 2 - 0.01, pointerDownRef.current.pitch + dy * 0.01),
    );
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const start = pointerDownRef.current;
    pointerDownRef.current = null;
    if (!interactive || !start || start.moved) return;
    if (extraLimitRef.current <= 0) return;

    // Raycast click on cube face to attach/detach an extra wooden block
    const canvas = canvasRef.current;
    const camera = cameraRef.current;
    const blockGroup = blockGroupRef.current;
    if (!canvas || !camera || !blockGroup) return;

    const rect = canvas.getBoundingClientRect();
    const ndc = new THREE.Vector2(
      ((e.clientX - rect.left) / rect.width) * 2 - 1,
      -((e.clientY - rect.top) / rect.height) * 2 + 1,
    );
    const raycaster = new THREE.Raycaster();
    raycaster.setFromCamera(ndc, camera);

    const meshes: THREE.Object3D[] = [];
    blockGroup.traverse((obj) => {
      if (obj instanceof THREE.Mesh) meshes.push(obj);
    });
    const hits = raycaster.intersectObjects(meshes, false);
    if (hits.length === 0) return;

    const hit = hits[0];
    const data = hit.object.userData as { coord?: VoxelCoord; isExtra?: boolean };
    if (!data.coord) return;

    if (data.isExtra) {
      const targetKey = voxelKey(data.coord);
      setExtraBlocks((prev) => prev.filter((c) => voxelKey(c) !== targetKey));
      return;
    }

    if (!hit.face) return;
    const n = hit.face.normal;
    const nextCoord: VoxelCoord = [
      data.coord[0] + Math.round(n.x),
      data.coord[1] + Math.round(n.y),
      data.coord[2] + Math.round(n.z),
    ];
    if (nextCoord[1] < 0) return; // keep above floor

    const nextKey = voxelKey(nextCoord);
    if (baseKeysRef.current.has(nextKey)) return;

    setExtraBlocks((prev) => {
      if (prev.some((c) => voxelKey(c) === nextKey)) return prev;
      if (prev.length >= extraLimitRef.current) {
        return [...prev.slice(1), nextCoord];
      }
      return [...prev, nextCoord];
    });
  };

  const presetLabels: Array<[CameraPreset, string]> = [
    ["isometric", "입체"],
    ["top", "위"],
    ["front", "앞"],
    ["side", "옆"],
  ];

  return (
    <div
      data-testid="voxel-3d-widget"
      style={{
        display: "flex",
        width: "100%",
        height: "100%",
        borderRadius: 10,
        border: "1px solid #cbd5e1",
        background: "#f8fafc",
        overflow: "hidden",
        touchAction: "none",
        userSelect: "none",
      }}
    >
      {/* 3D Viewport */}
      <div
        ref={viewportRef}
        style={{
          position: "relative",
          flex: 1,
          minWidth: 0,
          height: "100%",
        }}
      >
        {webglReady ? (
          <canvas
            ref={canvasRef}
            data-testid="voxel-3d-canvas"
            style={{ width: "100%", height: "100%", display: "block", cursor: interactive ? "grab" : "default" }}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={() => {
              pointerDownRef.current = null;
            }}
          />
        ) : (
          <div
            data-testid="voxel-3d-fallback"
            style={{
              width: "100%",
              height: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontSize: 12,
              color: "#475569",
              padding: 8,
              textAlign: "center",
            }}
          >
            3D 쌓기나무 ({allBlocks.length}개)
          </div>
        )}

        {/* Top-left View Snap HUD */}
        {spec.showViewButtons && interactive && (
          <div
            style={{
              position: "absolute",
              top: 6,
              left: 6,
              display: "flex",
              gap: 3,
              flexWrap: "wrap",
            }}
          >
            {presetLabels.map(([preset, label]) => (
              <button
                key={preset}
                type="button"
                data-testid={`voxel-view-${preset}`}
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

        {/* Top-right Reset + Extra block count */}
        {interactive && (
          <div
            style={{
              position: "absolute",
              top: 6,
              right: 6,
              display: "flex",
              alignItems: "center",
              gap: 4,
            }}
          >
            {(spec.extraBlocksLimit ?? 0) > 0 && (
              <span
                data-testid="voxel-extra-count"
                style={{
                  padding: "2px 6px",
                  borderRadius: 999,
                  background: "#e0f2fe",
                  color: "#0369a1",
                  fontSize: 10,
                  fontWeight: 700,
                }}
              >
                추가 {extraBlocks.length}/{spec.extraBlocksLimit}
              </span>
            )}
            <button
              type="button"
              data-testid="voxel-reset-btn"
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

        {/* Bottom Compare Overlay Bar */}
        {spec.allowOverlayCompare && spec.compareShapes && spec.compareShapes.length > 0 && interactive && (
          <div
            style={{
              position: "absolute",
              bottom: 6,
              left: 6,
              right: 6,
              display: "flex",
              alignItems: "center",
              gap: 4,
              flexWrap: "wrap",
            }}
          >
            {spec.compareShapes.map((shape, idx) => (
              <button
                key={shape.label}
                type="button"
                data-testid={`voxel-compare-${idx}`}
                onClick={() => setCompareIdx(compareIdx === idx ? null : idx)}
                style={{
                  padding: "2px 7px",
                  borderRadius: 6,
                  border: compareIdx === idx ? "1px solid #7e22ce" : "1px solid #cbd5e1",
                  background: compareIdx === idx ? "#f3e8ff" : "#ffffff",
                  color: compareIdx === idx ? "#6b21a8" : "#334155",
                  fontSize: 11,
                  fontWeight: 600,
                  cursor: "pointer",
                }}
              >
                {shape.label} 겹치기
              </button>
            ))}
            {isCompareMatch && (
              <span
                data-testid="voxel-compare-match"
                style={{
                  padding: "2px 7px",
                  borderRadius: 999,
                  background: "#dcfce7",
                  color: "#047857",
                  fontSize: 11,
                  fontWeight: 700,
                }}
              >
                모양 일치!
              </span>
            )}
          </div>
        )}
      </div>

      {/* Right-side live 2D projections (위 / 앞 / 옆) */}
      {spec.showProjectionGrid && (
        <div
          data-testid="voxel-projections-panel"
          style={{
            width: 82,
            borderLeft: "1px solid #e2e8f0",
            background: "#ffffff",
            padding: "6px 4px",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "space-around",
            gap: 4,
            overflowY: "auto",
          }}
        >
          <ProjectionMiniGrid title="위" grid={projections.top} color="#fcd34d" badgeBg="#bbf7d0" />
          <ProjectionMiniGrid title="앞" grid={projections.front} color="#93c5fd" badgeBg="#fde68a" />
          <ProjectionMiniGrid title="옆" grid={projections.side} color="#93c5fd" badgeBg="#fbcfe8" />
        </div>
      )}
    </div>
  );
};

function updateCamera(camera: THREE.OrthographicCamera, w: number, h: number): void {
  const aspect = Math.max(1, w) / Math.max(1, h);
  const frustum = 5.8;
  camera.left = (-frustum * aspect) / 2;
  camera.right = (frustum * aspect) / 2;
  camera.top = frustum / 2;
  camera.bottom = -frustum / 2;
  camera.updateProjectionMatrix();
}
