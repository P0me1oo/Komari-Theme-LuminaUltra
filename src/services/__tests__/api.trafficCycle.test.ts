import { beforeEach, describe, expect, it, vi } from "vitest";

const { call, MissingMethod } = vi.hoisted(() => ({ call: vi.fn(), MissingMethod: class extends Error {
  code = -32601;
} }));
vi.mock("@/services/rpc2Client", () => ({ getRpc2Client: () => ({ call }), RpcResponseError: MissingMethod }));

const start = Date.parse("2026-09-01T00:00:00Z");
const end = start + 3600_000;

beforeEach(() => { vi.resetModules(); call.mockReset(); vi.unstubAllGlobals(); });

describe("周期流量接口", () => {
  it("只查询增量并使用 sum，严格传入周期时间范围", async () => {
    call.mockImplementation(async (method, params) => {
      if (method === "public:queryMetrics" && !params.start) return {};
      return { start: new Date(start).toISOString(), end: new Date(end).toISOString(), series:
        ["traffic.up", "traffic.down"].map((metric_key) => ({ metric_key, entity_id: "node", interval_seconds: 60,
          points: [{ time: new Date(start).toISOString(), value: 120, count: 2 }] })) };
    });
    const { getCycleTrafficUsage } = await import("@/services/api");
    expect(await getCycleTrafficUsage("node", start, end)).toEqual({ up: 120, down: 120, hasSamples: true, approximate: false });
    expect(call).toHaveBeenLastCalledWith("public:queryMetrics", expect.objectContaining({
      start: new Date(start).toISOString(), end: new Date(end).toISOString(),
      entity_ids: ["node"], metric_keys: ["traffic.up", "traffic.down"], aggregation: "sum",
    }), expect.any(Object));
  });

  it("旧版读取全部网络计数并保留边界前的基准，重启后接续", async () => {
    call.mockImplementation(async (method) => {
      if (method === "public:queryMetrics") throw new MissingMethod();
      return { records: [
        { time: new Date(start - 1000).toISOString(), net_total_up: 1000, net_total_down: 2000 },
        { time: new Date(start).toISOString(), net_total_up: 1100, net_total_down: 2200 },
        { time: new Date(start + 60_000).toISOString(), net_total_up: 10, net_total_down: 20 },
        { time: new Date(end).toISOString(), net_total_up: 30, net_total_down: 40 },
      ] };
    });
    const { getCycleTrafficUsage } = await import("@/services/api");
    expect(await getCycleTrafficUsage("node", start, end)).toEqual({ up: 130, down: 240, hasSamples: true, approximate: false });
    expect(call).toHaveBeenLastCalledWith("common:getRecords", expect.objectContaining({ uuid: "node", load_type: "network", maxCount: -1 }), expect.any(Object));
  });

  it("RPC 失败后兼容 HTTP，并将历史不足标记为估算", async () => {
    call.mockRejectedValue(new MissingMethod());
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [
      { time: new Date(start + 60_000).toISOString(), net_total_up: 1000, net_total_down: 2000 },
      { time: new Date(end).toISOString(), net_total_up: 1020, net_total_down: 2030 },
    ] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    const { getCycleTrafficUsage } = await import("@/services/api");
    expect(await getCycleTrafficUsage("node", start, end)).toEqual({ up: 20, down: 30, hasSamples: true, approximate: true });
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining("load_type=network"), expect.any(Object));
  });

  it("全部接口失败时抛出错误，不伪造成功或已用流量", async () => {
    call.mockRejectedValue(new MissingMethod());
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network down")));
    const { getCycleTrafficUsage } = await import("@/services/api");
    await expect(getCycleTrafficUsage("node", start, end)).rejects.toThrow("network down");
  });

  it("离线节点使用 HTTP 回退时仍覆盖周期起点，不把窗口锚定在最后上报日", async () => {
    call.mockRejectedValue(new MissingMethod());
    const fetch = vi.fn().mockResolvedValue(new Response(JSON.stringify({ records: [] }), { status: 200 }));
    vi.stubGlobal("fetch", fetch);
    vi.spyOn(Date, "now").mockReturnValue(end + 48 * 3_600_000);
    try {
      const { getCycleTrafficUsage } = await import("@/services/api");
      await getCycleTrafficUsage("node", start, end);
      expect(fetch).toHaveBeenCalledWith(expect.stringContaining("hours=50"), expect.any(Object));
    } finally {
      vi.restoreAllMocks();
    }
  });
});
