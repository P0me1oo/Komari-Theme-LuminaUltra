import { RATE_DOWN_METRIC, RATE_UP_METRIC, type TrafficMetricSeries } from "@/utils/trafficStats";

export interface BandwidthPoint {
  time: number;
  up: number | null;
  down: number | null;
}

/** 对齐各节点的上报时间；读数最多沿用 5 秒，不向首个样本之前补值。 */
export function aggregateHomeBandwidth(
  series: TrafficMetricSeries[], uuids: string[], start: number, end: number,
): BandwidthPoint[] {
  const visible = new Set(uuids);
  const sources = series.filter((item) => visible.has(item.client) &&
    (item.metricKey === RATE_UP_METRIC || item.metricKey === RATE_DOWN_METRIC))
    .map((item) => ({
      direction: item.metricKey === RATE_UP_METRIC ? "up" as const : "down" as const,
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
      if (!sample || time - sample.time > 5000 || sample.value == null || !Number.isFinite(sample.value) || sample.value < 0) continue;
      point[source.direction] = (point[source.direction] ?? 0) + sample.value;
    }
    result.push(point);
  }
  return result;
}

/** 缺失样本断开路径，零带宽保留为真实的零值。 */
export function bandwidthPath(points: BandwidthPoint[], direction: "up" | "down", max: number): string {
  let connected = false;
  return points.map((point, index) => {
    const value = point[direction];
    if (value == null) { connected = false; return ""; }
    const command = connected ? "L" : "M";
    connected = true;
    const x = 2 + index / Math.max(1, points.length - 1) * 256;
    const y = 40 - value / Math.max(1, max) * 36;
    // 极短线段让孤立样本也可见。
    return `${command}${x.toFixed(2)},${y.toFixed(2)}${command === "M" ? "l0.01,0" : ""}`;
  }).join(" ");
}
