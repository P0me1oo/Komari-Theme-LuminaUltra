import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NetworkInfoContext } from "@/hooks/useNetworkInfo";
import type { NetworkResults, NetworkRoute } from "@/services/networkInfo";
import { NetworkRouteLabel, SingleNetworkRouteLabel } from "../NetworkRouteLabel";
import { MultiPingStatus } from "../MultiPingStatus";

vi.mock("@/hooks/usePreferences", () => ({ usePreferences: () => ({ resolvedAppearance: "dark" }) }));
vi.mock("@/hooks/useMetricColors", () => ({ useMetricColorsVersion: () => 0 }));
vi.mock("@/hooks/useThemeSettings", () => ({ useThemeSettings: () => ({ homepagePingBindings: { 2: ["a"] } }) }));

const route = (task_id: number, route_label: string): NetworkRoute => ({
  task_id, task_name: "探测点 " + task_id, region: "", carrier: null, family: 0, address: `probe${task_id}.example.com`,
  route_label, status: "ok", checked_at: "2026-09-30T00:00:00Z", networks: [], asns: [],
  reached: true, error: null, running: false, stale: false,
});
const data: NetworkResults = { available: true, show_home: true, nodes: [
  { uuid: "a", ips: [], routes: [route(1, "CN2GIA"), route(2, "10099->9929"), route(3, "CMIN2")] },
  { uuid: "b", ips: [], routes: [route(1, "163")] },
] };

describe("丢包率条上方左侧的回程线路", () => {
  it("按服务器和探测点对应结果，只输出标题文字", () => {
    const html = renderToStaticMarkup(<NetworkInfoContext.Provider value={data}>
      <NetworkRouteLabel uuid="b" taskId={1}><span>丢包</span></NetworkRouteLabel>
    </NetworkInfoContext.Provider>);
    expect(html).toContain("回程线路：163");
    expect(html).not.toContain("CN2GIA");
    expect(html).not.toContain("network-loss-row");
    expect(html).not.toContain("<span>丢包</span>");
  });

  it("单线路使用主页的单独绑定，不拿三网第一条凑数", () => {
    const html = renderToStaticMarkup(<NetworkInfoContext.Provider value={data}>
      <SingleNetworkRouteLabel uuid="a"><span>丢包</span></SingleNetworkRouteLabel>
    </NetworkInfoContext.Provider>);
    expect(html).toContain("10099-&gt;9929");
    expect(html).not.toMatch(/CN2GIA|CMIN2/);
  });

  it.each([null, 99])("没有对应探测点 %s 时保留原标签，不显示其他线路", (taskId) => {
    const html = renderToStaticMarkup(<NetworkInfoContext.Provider value={data}>
      <NetworkRouteLabel uuid="a" taskId={taskId}><span>丢包</span></NetworkRouteLabel>
    </NetworkInfoContext.Provider>);
    expect(html).toBe("<span>丢包</span>");
  });

  it("关闭首页回程或插件不可用时不留下空白位置", () => {
    const html = renderToStaticMarkup(<NetworkInfoContext.Provider value={{ ...data, show_home: false }}>
      <NetworkRouteLabel uuid="a" taskId={1}><span>丢包</span></NetworkRouteLabel>
    </NetworkInfoContext.Provider>);
    expect(html).toBe("<span>丢包</span>");
    expect(renderToStaticMarkup(<NetworkRouteLabel uuid="a" taskId={1}><span>丢包</span></NetworkRouteLabel>)).toBe(html);
  });

  it("三网按主页顺序逐行对应，延迟列不重复显示回程", () => {
    const lines = [3, 1, 2].map((taskId) => ({ taskId, taskName: "探测点 " + taskId, client: "a", isAssigned: true,
      lastValue: 10, loss: 0, samples: [], max: 1, buckets: [] }));
    const html = renderToStaticMarkup(<NetworkInfoContext.Provider value={data}>
      <MultiPingStatus lines={lines} density="compact" />
    </NetworkInfoContext.Provider>);
    expect(html.match(/class="network-loss-route"/g)).toHaveLength(3);
    expect(html.match(/class="multi-ping-metric-head"><span class="network-loss-route"/g)).toHaveLength(3);
    expect(html).not.toMatch(/network-loss-row|network-loss-chart/);
    expect(html.indexOf("回程线路：CMIN2")).toBeLessThan(html.indexOf("回程线路：CN2GIA"));
    expect(html.indexOf("回程线路：CN2GIA")).toBeLessThan(html.indexOf("回程线路：10099-&gt;9929"));
    expect(html.indexOf('aria-label="丢包"')).toBeLessThan(html.indexOf("network-loss-route"));
  });
});
