import * as THREE from "three";

export type CameraPreset = "isometric" | "top" | "front" | "side";

export interface SphericalAngles {
  yaw: number;   // radians around Y axis
  pitch: number; // radians from XZ plane
}

export const CAMERA_PRESET_ANGLES: Record<CameraPreset, SphericalAngles> = {
  isometric: { yaw: Math.PI / 4, pitch: Math.atan(1 / Math.SQRT2) },
  top: { yaw: 0, pitch: Math.PI / 2 - 0.001 },
  front: { yaw: 0, pitch: 0.001 },
  side: { yaw: Math.PI / 2, pitch: 0.001 },
};

export function createTextbookRenderer(canvas: HTMLCanvasElement, width: number, height: number): THREE.WebGLRenderer | null {
  try {
    const renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: true,
      alpha: true,
      powerPreference: "low-power",
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(Math.max(1, width), Math.max(1, height), false);
    return renderer;
  } catch {
    return null;
  }
}

export function createOrthoCamera(width: number, height: number, frustumSize = 6.5): THREE.OrthographicCamera {
  const aspect = Math.max(1, width) / Math.max(1, height);
  const camera = new THREE.OrthographicCamera(
    (-frustumSize * aspect) / 2,
    (frustumSize * aspect) / 2,
    frustumSize / 2,
    -frustumSize / 2,
    -50,
    50,
  );
  return camera;
}

export function updateOrthoCameraAspect(camera: THREE.OrthographicCamera, width: number, height: number, frustumSize = 6.5): void {
  const aspect = Math.max(1, width) / Math.max(1, height);
  camera.left = (-frustumSize * aspect) / 2;
  camera.right = (frustumSize * aspect) / 2;
  camera.top = frustumSize / 2;
  camera.bottom = -frustumSize / 2;
  camera.updateProjectionMatrix();
}

export function applyCameraOrbit(
  camera: THREE.OrthographicCamera,
  angles: SphericalAngles,
  target = new THREE.Vector3(0, 0, 0),
  distance = 14,
): void {
  const cosPitch = Math.cos(angles.pitch);
  const x = target.x + distance * cosPitch * Math.sin(angles.yaw);
  const y = target.y + distance * Math.sin(angles.pitch);
  const z = target.z + distance * cosPitch * Math.cos(angles.yaw);
  camera.position.set(x, y, z);
  camera.lookAt(target);
}

export function addTextbookLighting(scene: THREE.Scene): void {
  const ambient = new THREE.AmbientLight(0xffffff, 0.78);
  scene.add(ambient);

  const keyLight = new THREE.DirectionalLight(0xffffff, 0.52);
  keyLight.position.set(6, 12, 8);
  scene.add(keyLight);

  const fillLight = new THREE.DirectionalLight(0xfff7ed, 0.28);
  fillLight.position.set(-8, 4, -6);
  scene.add(fillLight);
}

export function createOutlinedMesh(
  geometry: THREE.BufferGeometry,
  options: {
    color: string;
    opacity?: number;
    edgeColor?: string;
    showHiddenEdges?: boolean;
  },
): THREE.Group {
  const group = new THREE.Group();
  const isTranslucent = (options.opacity ?? 1) < 0.99;

  const material = new THREE.MeshLambertMaterial({
    color: new THREE.Color(options.color),
    transparent: isTranslucent,
    opacity: options.opacity ?? 1,
    polygonOffset: true,
    polygonOffsetFactor: 1,
    polygonOffsetUnits: 1,
    depthWrite: !isTranslucent,
  });

  const mesh = new THREE.Mesh(geometry, material);
  group.add(mesh);

  const edgesGeom = new THREE.EdgesGeometry(geometry, 18);
  const solidEdges = new THREE.LineSegments(
    edgesGeom,
    new THREE.LineBasicMaterial({
      color: new THREE.Color(options.edgeColor ?? "#334155"),
      transparent: isTranslucent,
      opacity: isTranslucent ? 0.7 : 0.95,
    }),
  );
  group.add(solidEdges);

  if (options.showHiddenEdges) {
    const hiddenEdges = new THREE.LineSegments(
      edgesGeom,
      new THREE.LineDashedMaterial({
        color: new THREE.Color(options.edgeColor ?? "#475569"),
        dashSize: 0.14,
        gapSize: 0.1,
        transparent: true,
        opacity: 0.32,
        depthTest: false,
      }),
    );
    hiddenEdges.computeLineDistances();
    hiddenEdges.renderOrder = 2;
    group.add(hiddenEdges);
  }

  return group;
}

export function createSlantedPrismGeometry(w: number, h: number, d: number): THREE.BufferGeometry {
  // Trapezoidal prism like "바" in S3_초등_5_002919.png
  const shape = new THREE.Shape();
  shape.moveTo(-w / 2, -h / 2);
  shape.lineTo(w / 2, -h / 2);
  shape.lineTo(w / 2, h / 2);
  shape.lineTo(-w * 0.1, h / 2);
  shape.closePath();

  const geom = new THREE.ExtrudeGeometry(shape, {
    depth: d,
    bevelEnabled: false,
  });
  geom.translate(0, 0, -d / 2);
  return geom;
}

export function disposeGroup(group: THREE.Object3D): void {
  group.traverse((obj) => {
    if (obj instanceof THREE.Mesh || obj instanceof THREE.LineSegments) {
      obj.geometry?.dispose();
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.dispose());
      } else {
        obj.material?.dispose();
      }
    }
  });
}
