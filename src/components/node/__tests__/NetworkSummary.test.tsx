import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { NetworkSummary } from "../NetworkSummary";
import { NodeIPBadges } from "../NodeIPBadges";
import { NetworkPanel } from "@/components/instance/NetworkPanel";
import { NetworkInfoContext } from "@/hooks/useNetworkInfo";
import type { NetworkIP, NetworkResults, NetworkRoute } from "@/services/networkInfo";

function data(overrides: Partial<NetworkIP> = {}, routeOverrides: Partial<NetworkRoute> = {}, settings: Partial<NetworkResults> = {}): NetworkResults {
  return {
    available: true, show_home: true, show_details: true, ip_available: true,
    show_asn: true, show_organization: true, show_ip_type: true,
    nodes: [{
      uuid: "a",
      ips: [{
        family: 4, asn: "AS64500", organization: "测试企业", type: "机房",
        source: "IPinfo", checked_at: "2026-09-29T00:00:00Z", stale: false, error: null,
        ...overrides,
      }],
      routes: [{
        region: "广东", carrier: "ct", family: 4, address: "example.com:80",
        status: "ok", checked_at: "2026-09-29T00:00:00Z", route_label: "CN2GIA",
        networks: [{ asn: "AS4809", name: "CN2" }], asns: ["AS4809"],
        reached: true, running: false, stale: false, error: null,
        hops: [{ ttl: 1, ip: "203.0.113.1", asn: "AS4809", owner: "测试骨干网", location: "广东", rtt_ms: 12 }],
        ...routeOverrides,
      }],
    }],
    ...settings,
  };
}

function render(View: typeof NetworkSummary, overrides: Partial<NetworkIP> = {}, routeOverrides: Partial<NetworkRoute> = {}, settings: Partial<NetworkResults> = {}) {
  return renderToStaticMarkup(<NetworkInfoContext.Provider value={data(overrides, routeOverrides, settings)}><View uuid="a" /></NetworkInfoContext.Provider>);
}

const switches = Array.from({ length: 8 }, (_, mask) => ({ show_asn: Boolean(mask & 1), show_organization: Boolean(mask & 2), show_ip_type: Boolean(mask & 4) }));

function HomeNetwork({ uuid }: { uuid: string }) {
  return <><NodeIPBadges uuid={uuid} /><NetworkSummary uuid={uuid} /></>;
}

describe.each([{ name: "首页标签", View: HomeNetwork, home: true }, { name: "详情标签", View: NetworkPanel, home: false }])("$name", ({ View, home }) => {
  it("ASN、机构和类型是三个独立标签", () => {
    const html = render(View);
    expect(html).toMatch(/data-ip-label="asn"[^>]*>AS64500<\/span>/);
    expect(html).toMatch(/data-ip-label="organization"[^>]*>测试企业<\/span>/);
    expect(html).toMatch(/data-ip-label="type"[^>]*>机房<\/span>/);
    expect(html).toContain("CN2GIA");
  });

  it.each(switches)("独立总开关组合 $show_asn / $show_organization / $show_ip_type，正文和提示都遵守", (settings) => {
    const html = render(View, {}, {}, settings);
    expect(html.includes("AS64500")).toBe(settings.show_asn);
    expect(html.includes("测试企业")).toBe(settings.show_organization);
    expect(html.includes("机房")).toBe(settings.show_ip_type);
    expect(html).toContain("CN2GIA");
  });

  it("回程的显示开关不影响 IP 标签", () => {
    const html = render(View, {}, {}, { show_home: false, show_details: false });
    expect(html).toContain("AS64500");
    expect(html).toContain("测试企业");
    expect(html).toContain("机房");
    expect(html).not.toContain("CN2GIA");
  });

  it("IP 不可见时不会连带隐藏回程", () => {
    const html = render(View, {}, {}, { ip_available: false });
    expect(html).not.toContain("AS64500");
    expect(html).not.toContain("测试企业");
    expect(html).toContain("CN2GIA");
  });

  it("未知类型不根据 ASN 或机构名称推断", () => {
    const html = render(View, { type: "未知" });
    expect(html).toContain("测试企业");
    expect(html).not.toMatch(/机房|住宅网络|家宽|商宽/);
  });

  it("缺少机构时省略该标签，不影响 ASN 和类型", () => {
    const html = render(View, { organization: "未知" });
    expect(html).not.toContain('data-ip-label="organization"');
    expect(html).toContain("AS64500");
    expect(html).toContain("机房");
  });

  it("查询失败且没有旧数据时不捏造标签，失败原因只在详情展示", () => {
    const html = render(View, { asn: null, organization: "未知", type: "未知", error: "IPinfo 查询失败（HTTP 403）" });
    expect(html.includes("IP 信息查询失败")).toBe(!home);
    expect(html.includes("403")).toBe(!home);
    expect(html).not.toContain("data-ip-label=");
  });

  it.each(["CN2GIA", "CMIN2"])("回程结果超过间隔仍显示 %s，不显示过期提示", (label) => {
    const html = render(View, {}, { stale: true, route_label: label });
    expect(html).toContain(label);
    expect(html).toContain(new Date("2026-09-29T00:00:00Z").toLocaleString("zh-CN"));
    expect(html).not.toContain("过期");
  });

  it("回程失败保留失败提示，不影响 IP 标签", () => {
    const html = render(View, {}, { stale: true, status: "error", error: "探测超时" });
    expect(html).toContain("检测失败");
    expect(html).toContain("探测超时");
    expect(html).toContain("AS64500");
    expect(html).not.toContain("过期");
  });

  it("IP 过期保留旧标签，失败原因留在详情", () => {
    const html = render(View, { stale: true, error: "IPinfo 暂时无法查询" });
    expect(html).toContain("测试企业");
    expect(html).toContain("过期");
    expect(html.includes("IPinfo 暂时无法查询")).toBe(!home);
  });

  it("IPv4 和 IPv6 分别展示，不把不同类型混为一个结果", () => {
    const sample = data();
    sample.nodes[0].ips.push({ ...sample.nodes[0].ips[0], family: 6, asn: "AS64501", type: "家宽" });
    const html = renderToStaticMarkup(<NetworkInfoContext.Provider value={sample}><View uuid="a" /></NetworkInfoContext.Provider>);
    expect(html).toContain(home ? "IPv4 网络标签" : "IPv4 标签");
    expect(html).toContain(home ? "IPv6 网络标签" : "IPv6 标签");
    expect(html).toContain("AS64500");
    expect(html).toContain("AS64501");
    expect(html).toContain("机房");
    expect(html).toContain("家宽");
  });

  it("全部标签关闭且没有回程时，不留下空白区域", () => {
    const sample = data({}, {}, { show_asn: false, show_organization: false, show_ip_type: false });
    sample.nodes[0].routes = [];
    const html = renderToStaticMarkup(<NetworkInfoContext.Provider value={sample}><View uuid="a" /></NetworkInfoContext.Provider>);
    expect(html).toBe("");
  });
});

it("首页回程区域只显示线路，IP 标签显示在 V4 后面", () => {
  const routeHtml = render(NetworkSummary);
  expect(routeHtml).toContain("CN2GIA");
  expect(routeHtml).not.toMatch(/data-ip-label|IPinfo|AS64500|测试企业/);
  const html = render(HomeNetwork);
  expect(html.indexOf(">V4</span>")).toBeLessThan(html.indexOf('data-ip-label="asn"'));
  expect(html.indexOf('data-ip-label="type"')).toBeLessThan(html.indexOf('aria-label="三网回程"'));
});

it("双栈属性相同时共用标签，V4/V6 并排显示", () => {
  const sample = data();
  sample.nodes[0].ips.push({ ...sample.nodes[0].ips[0], family: 6 });
  const html = renderToStaticMarkup(<NetworkInfoContext.Provider value={sample}><NodeIPBadges uuid="a" /></NetworkInfoContext.Provider>);
  expect(html).toContain("IPv4 / IPv6 网络标签");
  expect(html).toContain(">V4</span>");
  expect(html).toContain(">V6</span>");
  expect(html.match(/data-ip-label="asn"/g)).toHaveLength(1);
});

it("没有插件结果时继续根据节点地址显示 V4/V6", () => {
  const html = renderToStaticMarkup(<NodeIPBadges uuid="a" ipv4="192.0.2.1" ipv6="2001:db8::1" />);
  expect(html).toContain(">V4</span>");
  expect(html).toContain(">V6</span>");
  expect(html).not.toMatch(/192\.0\.2\.1|2001:db8::1|data-ip-label/);
});

it("双栈标识与 IP 属性使用独立开关", () => {
  const html = renderToStaticMarkup(<NetworkInfoContext.Provider value={data()}><NodeIPBadges uuid="a" ipv4="192.0.2.1" showStack={false} /></NetworkInfoContext.Provider>);
  expect(html).not.toContain("ip-stack-badge");
  expect(html).toContain("AS64500");
  const hidden = data({}, {}, { show_asn: false, show_organization: false, show_ip_type: false });
  const stackOnly = renderToStaticMarkup(<NetworkInfoContext.Provider value={hidden}><NodeIPBadges uuid="a" ipv4="192.0.2.1" /></NetworkInfoContext.Provider>);
  expect(stackOnly).toContain(">V4</span>");
  expect(stackOnly).not.toContain("data-ip-label");
});

it("详情的 IP 信息与回程是两个区域，错误分别显示", () => {
  const html = render(NetworkPanel, {}, {}, { ip_error: "IP 查询设置错误", error: "回程设置错误" });
  expect(html).toContain('instance-panel-title">IP 信息与标签</h2>');
  expect(html).toContain('instance-panel-title">三网回程</h2>');
  expect(html.indexOf("IP 查询设置错误")).toBeLessThan(html.indexOf('instance-panel-title">三网回程</h2>'));
  expect(html.indexOf("回程设置错误")).toBeGreaterThan(html.indexOf('instance-panel-title">三网回程</h2>'));
});

it("路径详情保留企业和地区，不受节点 ASN 标签影响", () => {
  const html = render(NetworkPanel);
  expect(html).toContain("企业 / 地区");
  expect(html).toContain("测试骨干网 · 广东");
  expect(html).not.toContain("<th>ASN</th>");
  expect(html).not.toContain("AS4809");
});
