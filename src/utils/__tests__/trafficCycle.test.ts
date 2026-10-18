import { describe, expect, it } from "vitest";
import { getTrafficCycle, getTrafficResetDisplay, normalizeTrafficResetTimezones, normalizeTrafficUtcOffset } from "@/utils/trafficReset";
import { summarizeCycleTrafficMetrics, summarizeCycleTrafficRecords, trafficCounterDelta } from "@/utils/trafficCycle";

const ms = (value: string) => Date.parse(value);
const options = { utcOffset: 8 };

describe("指定时区的流量周期", () => {
  it("北京时间重置日零点切换，与浏览器时区无关", () => {
    expect(getTrafficCycle(null, ms("2026-09-14T15:59:59Z"), 15, options)).toMatchObject({
      start: ms("2026-08-14T16:00:00Z"), next: ms("2026-09-14T16:00:00Z"),
    });
    expect(getTrafficCycle(null, ms("2026-09-14T16:00:00Z"), 15, options)).toMatchObject({
      start: ms("2026-09-14T16:00:00Z"), next: ms("2026-10-14T16:00:00Z"),
    });
    expect(getTrafficResetDisplay(null, ms("2026-09-14T16:00:00Z"), 15, { ...options, mode: "theme" })?.date).toBe("2026-10-15");
  });

  it("按服务器的负时区和半小时时区计算", () => {
    expect(getTrafficCycle(null, ms("2026-09-15T04:59:59Z"), 15, { utcOffset: -5 })?.next).toBe(ms("2026-09-15T05:00:00Z"));
    expect(getTrafficCycle(null, ms("2026-09-14T18:30:00Z"), 15, { utcOffset: 5.5 })?.start).toBe(ms("2026-09-14T18:30:00Z"));
    expect(getTrafficCycle("2026-09-14T17:00:00Z", ms("2026-09-12T00:00:00Z"), undefined, options)?.day).toBe(15);
  });

  it("31 日跨短月、闰年和跨年时保留原定日期", () => {
    expect(getTrafficCycle(null, ms("2026-02-27T16:00:00Z"), 31, options)).toMatchObject({
      start: ms("2026-02-27T16:00:00Z"), next: ms("2026-03-30T16:00:00Z"),
    });
    expect(getTrafficCycle(null, ms("2028-02-28T16:00:00Z"), 31, options)?.start).toBe(ms("2028-02-28T16:00:00Z"));
    expect(getTrafficCycle(null, ms("2026-12-31T17:00:00Z"), 1, options)?.next).toBe(ms("2027-01-31T16:00:00Z"));
  });

  it("节点规则优先于默认日，并可停用周期统计", () => {
    const now = ms("2026-09-10T00:00:00Z");
    expect(getTrafficCycle(null, now, 15, { ...options, defaultDay: 1 })?.day).toBe(15);
    expect(getTrafficCycle(null, now, undefined, { ...options, defaultDay: 1 })?.day).toBe(1);
    expect(getTrafficCycle(null, now, -1, { ...options, defaultDay: 1 })).toBeNull();
    expect(getTrafficCycle(null, now, undefined, { ...options, defaultDay: "none" })).toBeNull();
    expect(getTrafficCycle(null, now, undefined, options)).toBeNull();
    expect(getTrafficCycle(null, NaN, 15, options)).toBeNull();
  });

  it("过滤非法时区，保留合法的四分之一小时偏移", () => {
    expect(normalizeTrafficResetTimezones({ a: -5, b: 5.75, c: 14, bad: 15, blank: "", " ": 8 })).toEqual({ a: -5, b: 5.75, c: 14 });
    expect(normalizeTrafficUtcOffset(NaN)).toBe(8);
    expect(normalizeTrafficUtcOffset(-13)).toBe(8);
  });
});

describe("本周期流量汇总", () => {
  it("新接口按增量求和，不将重启后的增量再次相减", () => {
    const start = ms("2026-09-01T00:00:00Z");
    const series = ["traffic.up", "traffic.down"].map((metricKey) => ({
      client: "node", metricKey, intervalSeconds: 60,
      points: [100, 30, 40].map((value, index) => ({ time: new Date(start + index * 60_000).toISOString(), value, count: 1 })),
    }));
    expect(summarizeCycleTrafficMetrics(series, "node", start, start + 180_000)).toEqual({ up: 170, down: 170, approximate: false, hasSamples: true });
    expect(summarizeCycleTrafficMetrics(series, "other", start, start + 180_000).approximate).toBe(true);
    expect(summarizeCycleTrafficMetrics(series, "node", start - 3_600_000, start + 180_000).approximate).toBe(true);
  });

  it("旧计数器跨重启继续累加，边界之前的计数不会作为本期用量", () => {
    const samples = [{ time: 0, up: 1000, down: 2000 }, { time: 10, up: 1100, down: 2200 },
      { time: 20, up: 10, down: 20 }, { time: 30, up: 40, down: 70 }];
    expect(summarizeCycleTrafficRecords(samples, 10, 30)).toEqual({ up: 140, down: 270, approximate: false, hasSamples: true });
    expect(summarizeCycleTrafficRecords(samples, 20, 30)).toMatchObject({ up: 40, down: 70 });
  });

  it("记录不足只统计可证明的增量并标记估算", () => {
    expect(summarizeCycleTrafficRecords([{ time: 20, up: 1000, down: 2000 }, { time: 30, up: 1010, down: 2020 }], 0, 30))
      .toEqual({ up: 10, down: 20, approximate: true, hasSamples: true });
    expect(summarizeCycleTrafficRecords([], 0, 30)).toEqual({ up: 0, down: 0, approximate: true, hasSamples: false });
  });

  it("无序、重复、非法和未来记录不污染用量", () => {
    const samples = [{ time: 20, up: 110, down: 220 }, { time: 10, up: 100, down: 200 },
      { time: 20, up: 110, down: 220 }, { time: 30, up: 999, down: 999 }, { time: 15, up: NaN, down: 999 }];
    expect(summarizeCycleTrafficRecords(samples, 10, 20)).toEqual({ up: 10, down: 20, approximate: false, hasSamples: true });
  });

  it("巨量计数的小幅回落不注入 TB 级流量", () => {
    expect(trafficCounterDelta(1024 ** 4 - 1, 1024 ** 4)).toBe(0);
    expect(trafficCounterDelta(10, 1024 ** 4)).toBe(10);
    expect(trafficCounterDelta(NaN, 10)).toBe(0);
  });
});
