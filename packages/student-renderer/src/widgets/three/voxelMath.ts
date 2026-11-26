export type VoxelCoord = [number, number, number];

export interface VoxelProjections {
  top: boolean[][];
  front: boolean[][];
  side: boolean[][];
  heights: number[][];
}

export function voxelKey(coord: VoxelCoord): string {
  return `${coord[0]},${coord[1]},${coord[2]}`;
}

export function dedupeVoxels(blocks: VoxelCoord[]): VoxelCoord[] {
  const seen = new Set<string>();
  const out: VoxelCoord[] = [];
  for (const b of blocks) {
    const c: VoxelCoord = [Math.round(b[0]), Math.round(b[1]), Math.round(b[2])];
    const k = voxelKey(c);
    if (!seen.has(k)) {
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

/**
 * Computes orthographic 2D projection grids matching Korean elementary math conventions:
 * - top (위): rows = z (back -> front), cols = x (left -> right)
 * - front (앞): rows = y (top -> bottom), cols = x (left -> right)
 * - side (오른쪽 옆): rows = y (top -> bottom), cols = z (front -> back)
 */
export function computeVoxelProjections(rawBlocks: VoxelCoord[], minGridSize = 3): VoxelProjections {
  const blocks = dedupeVoxels(rawBlocks);
  if (blocks.length === 0) {
    const empty = Array.from({ length: minGridSize }, () => Array(minGridSize).fill(false));
    const zeros = Array.from({ length: minGridSize }, () => Array(minGridSize).fill(0));
    return { top: empty, front: empty, side: empty, heights: zeros };
  }

  const minX = Math.min(...blocks.map((b) => b[0]));
  const maxX = Math.max(...blocks.map((b) => b[0]));
  const minY = Math.min(0, ...blocks.map((b) => b[1]));
  const maxY = Math.max(...blocks.map((b) => b[1]));
  const minZ = Math.min(...blocks.map((b) => b[2]));
  const maxZ = Math.max(...blocks.map((b) => b[2]));

  const sizeX = Math.max(minGridSize, maxX - minX + 1);
  const sizeY = Math.max(minGridSize, maxY - minY + 1);
  const sizeZ = Math.max(minGridSize, maxZ - minZ + 1);

  const top = Array.from({ length: sizeZ }, () => Array<boolean>(sizeX).fill(false));
  const heights = Array.from({ length: sizeZ }, () => Array<number>(sizeX).fill(0));
  const front = Array.from({ length: sizeY }, () => Array<boolean>(sizeX).fill(false));
  const side = Array.from({ length: sizeY }, () => Array<boolean>(sizeZ).fill(false));

  for (const [x, y, z] of blocks) {
    const nx = x - minX;
    const ny = y - minY;
    const nz = z - minZ;

    top[nz][nx] = true;
    heights[nz][nx] += 1;

    const frontRow = sizeY - 1 - ny;
    front[frontRow][nx] = true;

    const sideCol = sizeZ - 1 - nz;
    side[frontRow][sideCol] = true;
  }

  return { top, front, side, heights };
}

function normalizeCanonical(blocks: VoxelCoord[]): string {
  if (blocks.length === 0) return "";
  const minX = Math.min(...blocks.map((b) => b[0]));
  const minY = Math.min(...blocks.map((b) => b[1]));
  const minZ = Math.min(...blocks.map((b) => b[2]));
  return blocks
    .map(([x, y, z]) => `${x - minX},${y - minY},${z - minZ}`)
    .sort()
    .join("|");
}

function rotateY90(blocks: VoxelCoord[]): VoxelCoord[] {
  return blocks.map(([x, y, z]) => [-z, y, x]);
}

/**
 * Checks whether two voxel clusters are congruent under translation and 90-degree Y-axis rotations.
 */
export function areVoxelShapesCongruent(a: VoxelCoord[], b: VoxelCoord[]): boolean {
  const cleanA = dedupeVoxels(a);
  const cleanB = dedupeVoxels(b);
  if (cleanA.length !== cleanB.length) return false;
  const target = normalizeCanonical(cleanA);
  let cur = cleanB;
  for (let i = 0; i < 4; i++) {
    if (normalizeCanonical(cur) === target) return true;
    cur = rotateY90(cur);
  }
  return false;
}
