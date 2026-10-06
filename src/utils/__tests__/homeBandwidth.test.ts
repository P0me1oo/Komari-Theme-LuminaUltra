import { describe, expect, it } from "vitest";
import { aggregateHomeBandwidth, bandwidthPath, bandwidthRange } from "@/utils/homeBandwidth";
import { RATE_UP_METRIC, RATE_DOWN_METRIC, type TrafficMetricSeries } from "@/utils/trafficStats";

const start = Date.parse("2026-10-06T00:00:00Z");
function series(client: string, metricKey: string, samples: [number, number | null][]): TrafficMetricSeries {
  return { client, metricKey, points: samples.map(([seconds, value]) => ({ time: new Date(start + seconds * 1000).toISOString(), value, count: 1 })) };
}

describe("首页一分钟带宽", () => {
  it("对齐错开的节点上报，区分上下行并排除隐藏节点", () => {
    const result = aggregateHomeBandwidth([
      series("a", RATE_UP_METRIC, [[0, 10], [2, 20]]),
      series("b", RATE_UP_METRIC, [[1, 30]]),
      series("a", RATE_DOWN_METRIC, [[0, 50]]),
      series("hidden", RATE_UP_METRIC, [[0, 999]]),
    ], ["a", "b"], start, start + 3000);
    expect(result.map((p) => p.up)).toEqual([10, 45, 50, 50]);
    expect(result.map((p) => p.down)).toEqual([50, 50, 50, 50]);
  });

  it("不补造打开页面前的样本，零速率有效，超过五秒的旧读数留空", () => {
    const result = aggregateHomeBandwidth([series("a", RATE_UP_METRIC, [[2, 0]])], ["a"], start, start + 60_000);
    expect(result).toHaveLength(61);
    expect(result[0].up).toBeNull();
    expect(result[2].up).toBe(0);
    expect(result[7].up).toBe(0);
    expect(result[8].up).toBeNull();
    expect(result[60].up).toBeNull();
  });

  it("忽略窗口外样本和无效速率，缺失值立即中断旧读数", () => {
    const result = aggregateHomeBandwidth([series("a", RATE_UP_METRIC, [[-1, 200], [1, 10], [2, null], [3, -1], [4, 8], [61, 200]])], ["a"], start, start + 5000);
    expect(result.map((p) => p.up)).toEqual([null, 10, null, null, 8, 8]);
    const path = bandwidthPath(result, "up", 10);
    expect(path.match(/M/g)).toHaveLength(2);
    expect(path).not.toContain("NaN");
  });

  it("十秒采样之间连续连线，不再每五秒截断", () => {
    const result = aggregateHomeBandwidth([series("a", RATE_UP_METRIC, [[0, 10], [10, 30], [20, 10], [30, 20]])], ["a"], start, start + 30_000);
    expect(result[5].up).toBe(20);
    expect(result[15].up).toBe(20);
    expect(result.every((point) => point.up != null)).toBe(true);
    expect(bandwidthPath(result, "up", 30).match(/M/g)).toHaveLength(1);
  });

  it("正常两秒采样中出现长时间断档仍然留空", () => {
    const result = aggregateHomeBandwidth([series("a", RATE_UP_METRIC, [[0, 10], [2, 30], [4, 10], [40, 20], [42, 10]])], ["a"], start, start + 45_000);
    expect(result[9].up).toBe(10);
    expect(result[10].up).toBeNull();
    expect(result[40].up).toBe(20);
  });

  it("两条线共用动态纵轴，平滑线经过样本且不越过端点数值", () => {
    const points = [100, 102, 101, 103].map((up, time) => ({ time, up, down: up + 1 }));
    const [min, max] = bandwidthRange(points);
    expect(min).toBeGreaterThan(90);
    expect(max).toBeGreaterThan(104);
    const path = bandwidthPath(points, "up", max, min);
    expect(path.match(/C/g)).toHaveLength(3);
    const coordinates = [...path.matchAll(/([\d.]+),([\d.]+)/g)].map((match) => Number(match[2]));
    expect(coordinates.every((value) => value >= 5 && value <= 39)).toBe(true);
    expect(bandwidthPath([{ time: 0, up: 0, down: 0 }], "up", 1)).not.toContain("NaN");
  });
});
