import { Box3, Vector3 } from 'three';

const sampleBudget = 18_000;

function quantile(sorted, fraction) {
  return sorted[Math.floor((sorted.length - 1) * fraction)];
}

export function findSplatFocus(object, rotationX) {
  const source = object.extSplats ?? object.packedSplats;
  if (!source?.numSplats) return null;

  const points = [];
  const stride = Math.ceil(source.numSplats / sampleBudget);
  for (let index = 0; index < source.numSplats; index += stride) {
    const { center, opacity } = source.getSplat(index);
    if (opacity < 0.12 || ![center.x, center.y, center.z].every(Number.isFinite)) continue;
    points.push([center.x, center.y, center.z]);
  }
  if (points.length < 128) return null;

  // Prefer a compact region in the middle when a scan also covers a much wider setting.
  const lateral = Math.abs(Math.sin(rotationX)) > 0.5 ? 1 : 2;
  const median = (axis) => quantile(points.map((point) => point[axis]).sort((a, b) => a - b), 0.5);
  const x = median(0);
  const side = median(lateral);
  for (const point of points) point.push((point[0] - x) ** 2 + (point[lateral] - side) ** 2);
  points.sort((a, b) => a[3] - b[3]);
  const coreEnd = Math.max(31, Math.floor((points.length - 1) * 0.10));
  const compact = points[coreEnd][3] < points[Math.floor((points.length - 1) * 0.60)][3] * 0.24 ** 2;
  const region = compact ? points.slice(0, coreEnd + 1) : points;
  const trim = compact ? 0.05 : 0.02;
  const axes = [0, 1, 2].map((axis) => region.map((point) => point[axis]).sort((a, b) => a - b));
  const min = new Vector3(...axes.map((values) => quantile(values, trim)));
  const max = new Vector3(...axes.map((values) => quantile(values, 1 - trim)));
  return min.distanceToSquared(max) > 0 ? new Box3(min, max) : null;
}
