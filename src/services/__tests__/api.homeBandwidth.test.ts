import { afterEach, beforeEach, expect, it, vi } from "vitest";

const { call, RpcError } = vi.hoisted(() => ({
  call: vi.fn(), RpcError: class extends Error { code = -32601; },
}));
vi.mock("@/services/rpc2Client", () => ({ getRpc2Client: () => ({ call }), RpcResponseError: RpcError }));

beforeEach(() => { vi.resetModules(); call.mockReset(); });
afterEach(() => { vi.useRealTimers(); });

it("一次查询可见节点的原始带宽，时间范围精确为六十秒", async () => {
  call.mockResolvedValue({ series: [] });
  const { getHomeBandwidthHistory } = await import("@/services/api");
  const result = await getHomeBandwidthHistory(["a", "b"]);
  expect(result.end - result.start).toBe(60_000);
  expect(call).toHaveBeenCalledWith("public:queryMetrics", expect.objectContaining({
    entity_ids: ["a", "b"], metric_keys: ["net.out.rate", "net.in.rate"], downsample: false,
    start: new Date(result.start).toISOString(), end: new Date(result.end).toISOString(),
  }), expect.anything());
});

it("旧版接口按时间范围获取记录，过滤不可见节点且不将缺失下载值当成零", async () => {
  call.mockImplementation((method: string) => method === "public:queryMetrics"
    ? Promise.reject(new RpcError("Method not found"))
    : Promise.resolve({ records: {
      a: [{ client: "a", time: "2026-10-06T00:00:00Z", net_out: 20 }],
      hidden: [{ client: "hidden", time: "2026-10-06T00:00:00Z", net_out: 999 }],
    } }));
  const { getHomeBandwidthHistory } = await import("@/services/api");
  const result = await getHomeBandwidthHistory(["a"]);
  expect(result.series).toHaveLength(2);
  expect(result.series[0].points[0].value).toBe(20);
  expect(result.series[1].points[0].value).toBeNull();
  expect(call).toHaveBeenCalledWith("common:getRecords", expect.objectContaining({
    start: new Date(result.start).toISOString(), end: new Date(result.end).toISOString(), load_type: "network",
  }), expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

it("取消请求不再触发兼容查询，空节点列表不发请求", async () => {
  const controller = new AbortController();
  controller.abort();
  call.mockRejectedValue(new Error("已取消"));
  const { getHomeBandwidthHistory } = await import("@/services/api");
  await expect(getHomeBandwidthHistory(["a"], { signal: controller.signal })).rejects.toThrow();
  expect(call.mock.calls.some(([method]) => method === "common:getRecords")).toBe(false);
  call.mockClear();
  expect((await getHomeBandwidthHistory([])).series).toEqual([]);
  expect(call).not.toHaveBeenCalled();
});

it("存储历史只有一个点时改用后端保存的最近一分钟实时上报", async () => {
  const now = Date.now();
  const time = (seconds: number) => new Date(now - seconds * 1000).toISOString();
  call.mockImplementation((method: string) => {
    if (method === "common:getNodeRecentStatus") return Promise.resolve({ records: Array.from({ length: 30 }, (_, index) => ({ time: time(index * 2 + 1), net_out: index * 10, net_in: index * 20 })) });
    return Promise.resolve({ series: [
      { entity_id: "a", metric_key: "net.out.rate", interval_seconds: 60, points: [{ time: time(40), value: 8 }] },
      { entity_id: "a", metric_key: "net.in.rate", interval_seconds: 60, points: [{ time: time(40), value: 9 }] },
    ] });
  });
  const { getHomeBandwidthHistory } = await import("@/services/api");
  const result = await getHomeBandwidthHistory(["a"]);
  expect(result.series.map((s) => s.points.length)).toEqual([30, 30]);
  expect(call).toHaveBeenCalledWith("common:getNodeRecentStatus", { uuid: "a" }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
});

it("已有历史立即交给页面，四十个慢节点也不能累加整轮等待时间", async () => {
  const { getHomeBandwidthHistory } = await import("@/services/api");
  vi.useFakeTimers();
  const now = Date.now();
  const progress = vi.fn();
  call.mockImplementation((method: string) => method === "common:getNodeRecentStatus"
    ? new Promise(() => {})
    : Promise.resolve({ series: [{ entity_id: "0", metric_key: "net.out.rate", points: [{ time: new Date(now - 10_000).toISOString(), value: 20 }] }] }));
  let finished = false;
  const request = getHomeBandwidthHistory(Array.from({ length: 40 }, (_, i) => String(i)), { onProgress: progress })
    .then((value) => { finished = true; return value; });
  await vi.advanceTimersByTimeAsync(1);
  expect(progress).toHaveBeenCalledTimes(1);
  expect(progress.mock.calls[0][0].series[0].points[0].value).toBe(20);
  expect(finished).toBe(false);
  await vi.advanceTimersByTimeAsync(7999);
  expect(finished).toBe(true);
  expect((await request).series[0].points[0].value).toBe(20);
  const count = call.mock.calls.length;
  await vi.advanceTimersByTimeAsync(10_000);
  expect(call).toHaveBeenCalledTimes(count);
  expect(progress).toHaveBeenCalledTimes(1);
});

it("所有接口都无响应时整轮八秒结束，不再启动新一轮兼容请求", async () => {
  const { getHomeBandwidthHistory } = await import("@/services/api");
  vi.useFakeTimers();
  call.mockImplementation(() => new Promise(() => {}));
  const result = getHomeBandwidthHistory(["a"]).catch((error) => error);
  await vi.advanceTimersByTimeAsync(8000);
  expect(await result).toBeInstanceOf(Error);
  expect(call.mock.calls.some(([method]) => method === "common:getRecords")).toBe(false);
});

it("离开页面会取消补取，不会在取消后继续提交进度", async () => {
  const { getHomeBandwidthHistory } = await import("@/services/api");
  vi.useFakeTimers();
  call.mockImplementation((method: string) => method === "common:getNodeRecentStatus" ? new Promise(() => {}) : Promise.resolve({ series: [] }));
  const controller = new AbortController();
  const progress = vi.fn();
  const result = getHomeBandwidthHistory(["a"], { signal: controller.signal, onProgress: progress }).catch((error) => error);
  await vi.advanceTimersByTimeAsync(1);
  controller.abort();
  expect(await result).toBeInstanceOf(Error);
  await vi.advanceTimersByTimeAsync(10_000);
  expect(progress).not.toHaveBeenCalled();
});
