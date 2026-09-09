import { afterEach, describe, expect, it, vi } from "vitest";
import { NodeInfoSchema } from "@/types/komari";
import { sortHomeNodes } from "@/utils/homeSort";

const api = vi.hoisted(() => ({ getNodes: vi.fn(), getNodesLatestStatus: vi.fn() }));
vi.mock("@/services/api", () => api);

let release: (() => void) | undefined;
let unsubscribe: (() => void) | undefined;

afterEach(async () => {
  unsubscribe?.();
  release?.();
  await vi.advanceTimersByTimeAsync(0);
  vi.clearAllTimers();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("首页实时负载摘要", () => {
  it("只有 CPU 读数变化时也更新摘要与排序，读数不变时保留快照", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("window", {
      setTimeout: globalThis.setTimeout,
      clearTimeout: globalThis.clearTimeout,
      setInterval: globalThis.setInterval,
      clearInterval: globalThis.clearInterval,
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
    });
    api.getNodes.mockResolvedValue([
      NodeInfoSchema.parse({ uuid: "node-a", weight: 1 }),
      NodeInfoSchema.parse({ uuid: "node-b", weight: 2 }),
    ]);
    let cpuPct = 18;
    api.getNodesLatestStatus.mockImplementation(async () => ({
      "node-a": { online: true, cpu: cpuPct },
      "node-b": { online: true, cpu: 55 },
    }));
    const store = await import("@/services/wsStore");
    const onUpdate = vi.fn();
    unsubscribe = store.subscribeHomeNodeSummaries(onUpdate);
    release = store.retainStore();
    await vi.advanceTimersByTimeAsync(0);

    const context = {
      nameByUuid: new Map<string, string>(),
      priceByUuid: new Map<string, number | null>(),
      speedAvgByUuid: new Map<string, number>(),
      speedActive: new Set<string>(),
    };
    const before = store.getHomeNodeSummariesSnapshot();
    expect(before[0].cpuPct).toBe(18);
    expect(sortHomeNodes(before, "load", "desc", context).map((node) => node.uuid))
      .toEqual(["node-b", "node-a"]);

    onUpdate.mockClear();
    cpuPct = 91;
    await vi.advanceTimersByTimeAsync(2_000);
    const after = store.getHomeNodeSummariesSnapshot();
    expect(onUpdate).toHaveBeenCalled();
    expect(after).not.toBe(before);
    expect(after[0].cpuPct).toBe(91);
    expect(sortHomeNodes(after, "load", "desc", context).map((node) => node.uuid))
      .toEqual(["node-a", "node-b"]);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(store.getHomeNodeSummariesSnapshot()).toBe(after);
  });
});
