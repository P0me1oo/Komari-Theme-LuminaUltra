import { createRequire } from "node:module";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getNetworkConfig, NetworkResultsSchema, networkDetectionMessage, routeLabel,
  runNetworkDetection, saveNetworkConfig, type NetworkConfig, type NetworkRoute,
} from "../networkInfo";

const require = createRequire(import.meta.url);
const core = require("../../../network-plugin/core.cjs");
const { testConfig } = require("../../../network-plugin/tests/fixtures.cjs");

function route(carrier: NetworkRoute["carrier"], asns: string[]): NetworkRoute {
  return {
    region: "广东", carrier, family: 4, address: "example.com:80", status: "partial",
    checked_at: "2026-09-27T00:00:00Z", networks: asns.map((asn) => ({ asn, name: asn })),
    asns, reached: false, error: null, running: false, stale: false,
  };
}

const config: NetworkConfig = {
  enabled: true, ip_enabled: true, guest_visible: false, show_home: true, show_details: true,
  ip_source: "ipinfo", ip_guest_visible: false, show_asn: true, show_organization: true, show_ip_type: true,
  all_nodes: false, nodes: ["a"], interval_minutes: 360, ip_interval_hours: 24,
  concurrency: 2, nexttrace_path: "nexttrace",
};
const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
afterEach(() => vi.unstubAllGlobals());

describe("回程主线路展示", () => {
  it.each(["CN2GIA", "CN2GT", "CTGGIA", "10099->9929", "10099->4837", "CMIN2->4837"])("直接展示插件结论 %s，不再按目标运营商覆盖", (label) => {
    expect(routeLabel({ ...route("cu", ["AS4134"]), route_label: label })).toBe(label);
    expect(routeLabel({ ...route("ct", ["AS4134"]), route_label: label })).toBe(label);
  });

  it("新插件明确无法判断时不回退成旧线路", () => {
    expect(routeLabel({ ...route("ct", ["AS4134"]), route_label: null })).toBe("无法确定");
  });

  it("待检测和失败状态优先于保存的线路结论", () => {
    const sample = { ...route("ct", []), route_label: "CN2GIA" };
    expect(routeLabel({ ...sample, status: "pending" })).toBe("待检测");
    expect(routeLabel({ ...sample, status: "pending", running: true })).toBe("检测中");
    expect(routeLabel({ ...sample, status: "error" })).toBe("检测失败");
  });

  it("读取旧缓存重算的线路后，主题保留插件结论和检测时间", () => {
    const normalized = testConfig(config);
    const checked = "2026-09-27T00:00:00Z";
    const state = { jobs: [], nodes: { a: { routes: [{
      ...route("ct", ["AS4134"]), key: normalized.targets[0].key, checked_at: checked,
      hops: [{ ttl: 1, ip: "203.0.113.1", asn: "AS10099", owner: "测试网络", location: "", rtt_ms: 1 },
        { ttl: 2, ip: "203.0.113.2", asn: "AS9929", owner: "测试网络", location: "", rtt_ms: 2 },
        { ttl: 3, ip: "203.0.113.3", asn: "AS4134", owner: "测试网络", location: "", rtt_ms: 3 }],
    }] } } };
    const result = NetworkResultsSchema.parse(core.visibleData([{ uuid: "a" }], state, normalized, true, Date.now()));
    expect(routeLabel(result.nodes[0].routes[0])).toBe("10099->9929");
    expect(result.nodes[0].routes[0].checked_at).toBe(checked);
  });

  it("兼容旧版缓存中的多条途经网络", () => {
    expect(routeLabel(route("cm", ["AS58807", "AS9808"]))).toBe("CMIN2");
    expect(routeLabel(route("cu", ["AS10099", "AS9929", "AS4837"]))).toBe("9929");
    expect(routeLabel(route("ct", ["AS10099", "AS9929", "AS4134"]))).toBe("163");
  });

  it("没有识别到骨干网时显示无法确定", () => {
    expect(routeLabel(route("ct", []))).toBe("无法确定");
  });

  it("真实插件结果符合主题格式，待检测和已有结果都返回检测时间", () => {
    const normalized = testConfig(config);
    const nodes = [{ uuid: "a" }];
    const state = { jobs: [], nodes: {} };
    const pending = NetworkResultsSchema.parse(core.visibleData(nodes, state, normalized, true, Date.now()));
    expect(pending.nodes[0].routes[0].checked_at).toBeNull();
    const saved = { jobs: [], nodes: { a: { routes: [{ ...route("ct", ["AS4809"]), key: normalized.targets[0].key }] } } };
    const result = NetworkResultsSchema.parse(core.visibleData(nodes, saved, normalized, true, Date.now()));
    expect(result.nodes[0].routes[0].checked_at).toBe("2026-09-27T00:00:00Z");
  });

  it("旧版插件漏掉检测时间时不再丢弃整份结果", () => {
    const legacy = { ...route("ct", []) } as Partial<NetworkRoute>;
    delete legacy.checked_at;
    const result = NetworkResultsSchema.parse({ available: true, nodes: [{ uuid: "a", ips: [], routes: [legacy] }] });
    expect(result.nodes[0].routes[0].checked_at).toBeNull();
  });
});

describe("网络配置与手动检测接口", () => {
  it("读取与插件后台相同的配置，并兼容字符串形式的指定节点", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ result: { data: { ...config, nodes: '["a"]', targets: "旧自定义地址已停用" } } }));
    vi.stubGlobal("fetch", fetch);
    expect(await getNetworkConfig()).toEqual(config);
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toMatchObject({ method: "admin:getPluginConfiguration", params: { short: "lumina-network" } });
  });

  it("先校验再保存指定节点，整份配置只提交一次", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(json({ ok: true, independent_ip: true, homepage_targets: true })).mockResolvedValueOnce(json({ result: null }));
    vi.stubGlobal("fetch", fetch);
    await saveNetworkConfig(config);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(fetch.mock.calls[0][0]).toContain("/validate");
    expect(JSON.parse(fetch.mock.calls[1][1].body)).toMatchObject({
      method: "admin:setPluginConfiguration", params: { short: "lumina-network", data: { nodes: JSON.stringify(config.nodes) } },
    });
  });

  it.each([
    { name: "单选", nodes: ["a"] },
    { name: "多选", nodes: ["a", "b"] },
    { name: "清空", nodes: [] },
  ])("$name 节点保存后重新读取保留选择，插件按相同范围检测", async ({ nodes }) => {
    let saved: Record<string, unknown> = {};
    const fetch = vi.fn(async (url: string, init: RequestInit) => {
      if (url.endsWith("/validate")) {
        core.normalizeConfig(JSON.parse(String(init.body)));
        return json({ ok: true, independent_ip: true, homepage_targets: true });
      }
      const request = JSON.parse(String(init.body));
      if (request.method === "admin:setPluginConfiguration") {
        saved = request.params.data;
        return json({ result: null });
      }
      if (request.method === "admin:getPluginConfiguration") {
        // 对齐 Komari：保存原值，读取节点选择时只解析 JSON 文本，再返回列表。
        const selected = typeof saved.nodes === "string" ? JSON.parse(saved.nodes) : [];
        return json({ result: { data: { ...saved, nodes: selected } } });
      }
      throw new Error("未预期的配置请求");
    });
    vi.stubGlobal("fetch", fetch);
    const submitted = { ...config, nodes };
    await saveNetworkConfig(submitted);
    const restored = await getNetworkConfig();
    expect(restored).toEqual(submitted);
    expect(saved.nodes).toBe(JSON.stringify(nodes));
    const clients = [{ uuid: "a" }, { uuid: "b" }, { uuid: "c" }];
    expect(core.selectedNodes(clients, core.normalizeConfig(restored))).toEqual(
      clients.filter((client) => nodes.includes(client.uuid)),
    );
  });

  it("配置校验失败时不执行保存", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ error: "存在重复的测试目标" }, 400));
    vi.stubGlobal("fetch", fetch);
    await expect(saveNetworkConfig(config)).rejects.toThrow("存在重复的测试目标");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([
    { kind: "route" as const, path: "run", count: "回程检测队列 3 项" },
    { kind: "ip" as const, path: "ip-refresh", count: "IP 信息查询队列 2 项" },
  ])("$kind 手动入口只请求对应任务，提示排队而不是完成", async ({ kind, path, count }) => {
    const result = { added: 3, queued: 3, running: 0, ip_added: 2, ip_queued: 2 };
    const fetch = vi.fn().mockResolvedValue(json(result, 202));
    vi.stubGlobal("fetch", fetch);
    expect(await runNetworkDetection(kind)).toEqual(result);
    expect(fetch.mock.calls[0][0]).toBe(`/api/admin/lumina-network/v1/${path}`);
    expect(fetch.mock.calls[0][1]).toMatchObject({ method: "POST", credentials: "include" });
    expect(networkDetectionMessage(result, kind)).toContain(count);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("旧版或缺失插件提示升级，不回退到合并入口", async () => {
    const fetch = vi.fn().mockResolvedValue(json({}, 404));
    vi.stubGlobal("fetch", fetch);
    await expect(runNetworkDetection("ip")).rejects.toThrow("0.5.0");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("旧版插件没有独立 IP 配置能力时，不假装保存成功", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ ok: true }));
    vi.stubGlobal("fetch", fetch);
    await expect(saveNetworkConfig(config)).rejects.toThrow("0.5.0");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("三个独立标签开关及 IP 游客设置随配置保存并恢复", async () => {
    const selected = { ...config, show_asn: false, show_organization: true, show_ip_type: false, ip_guest_visible: true, all_nodes: false, nodes: [] };
    const fetch = vi.fn().mockResolvedValueOnce(json({ ok: true, independent_ip: true, homepage_targets: true })).mockResolvedValueOnce(json({ result: null })).mockResolvedValueOnce(json({ result: { data: { ...selected, nodes: "[]" } } }));
    vi.stubGlobal("fetch", fetch);
    await saveNetworkConfig(selected);
    expect(JSON.parse(fetch.mock.calls[1][1].body).params.data).toMatchObject({ show_asn: false, show_organization: true, show_ip_type: false, ip_guest_visible: true, nodes: "[]" });
    expect(await getNetworkConfig()).toEqual(selected);
  });

  it("登录过期显示明确提示", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({}, 401)));
    await expect(runNetworkDetection()).rejects.toThrow("请先登录管理员账号");
  });

  it("仍使用自定义目标的旧插件提示升级，不让用户误以为会跟随主页", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ result: { configuration: { data: [{ key: "targets" }] }, data: config } })));
    await expect(getNetworkConfig()).rejects.toThrow("0.5.0");
  });

  it("保存前检查主页目标能力，不只检查独立 IP 功能", async () => {
    const fetch = vi.fn().mockResolvedValue(json({ ok: true, independent_ip: true }));
    vi.stubGlobal("fetch", fetch);
    await expect(saveNetworkConfig(config)).rejects.toThrow("跟随主页延迟检测");
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
