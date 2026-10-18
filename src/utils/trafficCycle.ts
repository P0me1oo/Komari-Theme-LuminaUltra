import type { TrafficMetricSeries } from "@/utils/trafficStats";
import { TRAFFIC_DOWN_METRIC, TRAFFIC_UP_METRIC } from "@/utils/trafficStats";

export interface TrafficCounterSample {
  time: number;
  up: number;
  down: number;
}

export interface CycleTrafficUsage {
  up: number;
  down: number;
  approximate: boolean;
  hasSamples: boolean;
}

// 和 Komari 的重启识别保持一致，巨量计数的小幅回落不应被当作整个计数重新累加。
export function trafficCounterDelta(current: number, previous: number): number {
  if (!Number.isFinite(current) || !Number.isFinite(previous) || current < 0 || previous < 0) return 0;
  if (current >= previous) return current - previous;
  return current <= 64 * 1024 ** 3 ? current : 0;
}

/** 新接口返回已处理重启归零的增量，按 sum 汇总，不能再相减。 */
export function summarizeCycleTrafficMetrics(
  series: TrafficMetricSeries[], uuid: string, start: number, end: number,
): CycleTrafficUsage {
  const result: CycleTrafficUsage = { up: 0, down: 0, approximate: false, hasSamples: false };
  for (const [metric, field] of [[TRAFFIC_UP_METRIC, "up"], [TRAFFIC_DOWN_METRIC, "down"]] as const) {
    let first = Infinity;
    let tolerance = 60_000;
    for (const item of series) {
      if (item.client !== uuid || item.metricKey !== metric) continue;
      tolerance = Math.max(tolerance, (item.intervalSeconds ?? 0) * 1000);
      for (const point of item.points) {
        const time = Date.parse(point.time);
        const intervalMs = (item.intervalSeconds ?? 0) * 1000;
        if (!Number.isFinite(time) || (time < start && time + intervalMs <= start) || time > end || point.value == null ||
          !Number.isFinite(point.value) || point.value < 0 || !(point.count > 0)) continue;
        result[field] += point.value;
        if (time < start) result.approximate = true;
        first = Math.min(first, time);
        result.hasSamples = true;
      }
    }
    if (first === Infinity || first - start > tolerance) result.approximate = true;
  }
  return result;
}

/** 旧接口保留边界前的一条记录作为基准，计数归零后继续累加。 */
export function summarizeCycleTrafficRecords(
  samples: TrafficCounterSample[], start: number, end: number,
): CycleTrafficUsage {
  const result: CycleTrafficUsage = { up: 0, down: 0, approximate: false, hasSamples: false };
  const ordered = [...new Map(samples.filter((sample) => Number.isFinite(sample.time) && sample.time <= end &&
    Number.isFinite(sample.up) && sample.up >= 0 && Number.isFinite(sample.down) && sample.down >= 0)
    .map((sample) => [sample.time, sample])).values()].sort((left, right) => left.time - right.time);
  let previous: TrafficCounterSample | undefined;
  for (const sample of ordered) {
    if (sample.time < start) { previous = sample; continue; }
    result.hasSamples = true;
    if (previous) {
      result.up += trafficCounterDelta(sample.up, previous.up);
      result.down += trafficCounterDelta(sample.down, previous.down);
      if (previous.time < start && sample.time > start) result.approximate = true;
    } else if (sample.time > start) result.approximate = true;
    previous = sample;
  }
  if (!result.hasSamples) result.approximate = true;
  return result;
}
