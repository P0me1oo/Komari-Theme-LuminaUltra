import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { NetworkSettings } from "../NetworkSettings";
import type { NetworkConfig } from "@/services/networkInfo";

vi.mock("@/hooks/useNetworkDetection", () => ({
  useNetworkDetection: (kind: string) => ({ run: vi.fn(), reset: vi.fn(), running: false, notice: { error: false, message: kind === "ip" ? "IP 刷新提示" : "回程检测提示" } }),
}));

const config: NetworkConfig = {
  enabled: true, ip_enabled: true, ip_source: "ipinfo", ip_guest_visible: false,
  show_asn: true, show_organization: false, show_ip_type: true,
  guest_visible: false, show_home: true, show_details: true,
  all_nodes: false, nodes: [], interval_minutes: 360, ip_interval_hours: 24,
  concurrency: 2, nexttrace_path: "nexttrace",
};

function render() {
  return renderToStaticMarkup(<NetworkSettings config={config} loading={false} loadError={null}
    clients={[]} clientsLoading={false} clientsError={null} saving={false} dirty={false}
    formRef={createRef<HTMLFormElement>()} onChange={() => {}} onReload={() => {}} onSave={async () => true} />);
}

describe("独立的 IP 与回程设置", () => {
  it("IP 区域只有全局设置，没有服务器选择或回程参数", () => {
    const html = render();
    const split = html.indexOf('instance-panel-title">三网回程检测</h2>');
    const ip = html.slice(0, split);
    expect(ip).toContain("IP 信息与标签");
    expect(ip).toContain("自动查询全部节点");
    expect(ip).toContain("显示 ASN");
    expect(ip).toContain("显示运营商 / 机构");
    expect(ip).toContain("显示 IP 类型");
    expect(ip).toContain("IPinfo");
    expect(ip).toContain("刷新 IP 信息");
    expect(ip).not.toContain("NextTrace");
    expect(ip).not.toContain("指定回程节点");
    expect(ip).not.toContain("network-node-picker");
    expect(ip).not.toContain("添加测试目标");
  });

  it("回程区域保留节点选择，两个按钮和反馈分别归属各自区域", () => {
    const html = render();
    const split = html.indexOf('instance-panel-title">三网回程检测</h2>');
    const ip = html.slice(0, split), route = html.slice(split);
    expect(route).toContain("指定回程节点");
    expect(route).toContain("检测回程");
    expect(route).toContain("NextTrace");
    expect(route).toContain("主页延迟检测");
    expect(route).not.toMatch(/添加测试目标|测试地址|IP 版本|network-target-row/);
    expect(route).not.toContain("刷新 IP 信息");
    expect(route).not.toContain("显示 ASN");
    expect(ip).toContain("IP 刷新提示");
    expect(ip).not.toContain("回程检测提示");
    expect(route).toContain("回程检测提示");
    expect(route).not.toContain("IP 刷新提示");
  });
});
