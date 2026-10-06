import { RATE_DOWN_METRIC, RATE_UP_METRIC, type TrafficMetricSeries } from "@/utils/trafficStats";
import { inferHistoryIntervalSeconds } from "@/utils/historyRange";

export interface BandwidthPoint {
  time: number;
  up: number | null;
  down: number | null;
}

/** 按真实采样间隔连接相邻样本；不向首个样本之前补值，也不跨越异常长的断档。 */
export function aggregateHomeBandwidth(
  series: TrafficMetricSeries[], uuids: string[], start: number, end: number,
): BandwidthPoint[] {
  const visible = new Set(uuids);
  const sources = series.filter((item) => visible.has(item.client) &&
    (item.metricKey === RATE_UP_METRIC || item.metricKey === RATE_DOWN_METRIC))
    .map((item) => ({
      direction: item.metricKey === RATE_UP_METRIC ? "up" as const : "down" as const,
      maxGap: Math.max(5000, Math.min(60_000, (item.intervalSeconds || inferHistoryIntervalSeconds(item.points) || 2) * 1500)),
      points: item.points.map((point) => ({ time: Date.parse(point.time), value: point.value }))
        .filter((point) => Number.isFinite(point.time) && point.time >= start && point.time <= end)
        .sort((a, b) => a.time - b.time),
      index: -1,
    }));
  const result: BandwidthPoint[] = [];
  for (let time = start; time <= end; time += 1000) {
    const point: BandwidthPoint = { time, up: null, down: null };
    for (const source of sources) {
      while (source.index + 1 < source.points.length && source.points[source.index + 1].time <= time) source.index++;
      const sample = source.points[source.index];
      if (!sample || sample.value == null || !Number.isFinite(sample.value) || sample.value < 0) continue;
      const next = source.points[source.index + 1];
      let value = sample.value;
      if (next && next.time - sample.time <= source.maxGap && next.value != null && Number.isFinite(next.value) && next.value >= 0) {
        value += (next.value - value) * (time - sample.time) / (next.time - sample.time);
      } else if (time - sample.time > 5000) continue;
      point[source.direction] = (point[source.direction] ?? 0) + value;
    }
    result.push(point);
  }
  return result;
}

/** 两条趋势线共用动态纵轴，让较小波动也能看清；恒定速率显示水平线。 */
export function bandwidthRange(points: BandwidthPoint[]): [number, number] {
  const values = points.flatMap((point) => [point.up, point.down])
    .filter((value): value is number => value != null && Number.isFinite(value));
  if (values.length === 0) return [0, 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const padding = Math.max((max - min) * 0.1, max * 0.01, 1);
  return [Math.max(0, min - padding), max + padding];
}

/** 单调插值经过真实采样点，不制造峰值；缺失样本仍然断线。 */
export function bandwidthPath(points: BandwidthPoint[], direction: "up" | "down", max: number, min = 0): string {
  const segments: Array<Array<{ x: number; y: number }>> = [];
  let segment: Array<{ x: number; y: number }> = [];
  for (let index = 0; index < points.length; index++) {
    const value = points[index][direction];
    if (value == null) { segment = []; continue; }
    if (segment.length === 0) segments.push(segment);
    segment.push({ x: 2 + index / Math.max(1, points.length - 1) * 256, y: 39 - (value - min) / Math.max(1, max - min) * 34 });
  }
  const xy = (x: number, y: number) => `${x.toFixed(2)},${y.toFixed(2)}`;
  return segments.map((items) => {
    let path = `M${xy(items[0].x, items[0].y)}`;
    if (items.length === 1) return `${path}l0.01,0`;
    const slopes = items.slice(1).map((point, index) => (point.y - items[index].y) / (point.x - items[index].x));
    const tangents = items.map((_, index) => {
      if (index === 0) return slopes[0];
      if (index === items.length - 1) return slopes[index - 1];
      const before = slopes[index - 1], after = slopes[index];
      return before * after <= 0 ? 0 : 2 / (1 / before + 1 / after);
    });
    for (let index = 1; index < items.length; index++) {
      const a = items[index - 1], b = items[index], step = (b.x - a.x) / 3;
      path += ` C${xy(a.x + step, a.y + tangents[index - 1] * step)} ${xy(b.x - step, b.y - tangents[index] * step)} ${xy(b.x, b.y)}`;
    }
    return path;
  }).join(" ");
}
