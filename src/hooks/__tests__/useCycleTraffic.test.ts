import { describe, expect, it } from "vitest";
import { applyCycleTrafficUsage } from "@/hooks/useCycleTraffic";

describe("实时接续周期用量", () => {
  const data = { up: 300, down: 600, approximate: false, hasSamples: true,
    end: 1000, observedUp: 20, observedDown: 40 };

  it("按已观察增量接续，多次重启后也不丢掉上次查询后的用量", () => {
    const raw = { trafficUp: 15, trafficDown: 30, trafficObservedUp: 60, trafficObservedDown: 120 };
    expect(applyCycleTrafficUsage(raw, true, data)).toMatchObject({
      trafficUp: 340, trafficDown: 680, trafficApproximate: false, trafficPending: false,
    });
    expect(applyCycleTrafficUsage(raw, true, { ...data, up: 340, down: 680, observedUp: 60, observedDown: 120 }))
      .toMatchObject({ trafficUp: 340, trafficDown: 680 });
  });

  it("没有实时基准时不把首次取得的累计计数加成本周期增量", () => {
    const raw = { trafficUp: 1024 ** 4, trafficDown: 2 * 1024 ** 4, trafficObservedUp: 0, trafficObservedDown: 0 };
    expect(applyCycleTrafficUsage(raw, true, { ...data, observedUp: undefined, observedDown: undefined }))
      .toMatchObject({ trafficUp: 300, trafficDown: 600 });
  });

  it("新周期加载前显示零和估算标记，停用周期后恢复探针计数", () => {
    const raw = { trafficUp: 1000, trafficDown: 2000 };
    expect(applyCycleTrafficUsage(raw, true, undefined)).toMatchObject({
      trafficUp: 0, trafficDown: 0, trafficApproximate: true, trafficPending: true,
    });
    expect(applyCycleTrafficUsage(raw, false, data)).toBe(raw);
  });
});
