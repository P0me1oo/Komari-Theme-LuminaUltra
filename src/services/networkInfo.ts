import { z } from "zod";
import { fetchWithTimeout } from "@/utils/abort";
import { organizationLabel } from "@/utils/organization";

const NetworkSchema = z.object({ asn: z.string(), name: z.string() });
const HopSchema = z.object({
  ttl: z.number(), ip: z.string().nullable(), asn: z.string().nullable(),
  owner: z.string(), location: z.string(), rtt_ms: z.number().nullable(),
});
const IpSchema = z.object({
  family: z.number(), asn: z.string().nullable(), organization: z.string(), type: z.string(),
  source: z.string(), checked_at: z.string(), stale: z.boolean(), error: z.string().nullable(),
  address: z.string().optional(),
});
const RouteSchema = z.object({
  region: z.string(), carrier: z.enum(["ct", "cu", "cm"]).nullable(), family: z.number(), address: z.string(),
  task_id: z.number().optional(), task_name: z.string().optional(),
  status: z.enum(["pending", "ok", "partial", "error"]), checked_at: z.string().nullable().default(null),
  route_label: z.string().nullable().optional(),
  networks: z.array(NetworkSchema), asns: z.array(z.string()), reached: z.boolean().nullable(),
  error: z.string().nullable(), running: z.boolean(), stale: z.boolean(), hops: z.array(HopSchema).optional(),
});
export const NetworkResultsSchema = z.object({
  available: z.boolean(), show_home: z.boolean().optional(), show_details: z.boolean().optional(),
  homepage_targets: z.boolean().optional(),
  interval_minutes: z.number().optional(), error: z.string().nullable().optional(),
  independent_ip: z.boolean().optional(), ip_available: z.boolean().optional(), ip_error: z.string().nullable().optional(),
  show_asn: z.boolean().optional(), show_organization: z.boolean().optional(), show_ip_type: z.boolean().optional(),
  nodes: z.array(z.object({ uuid: z.string(), ips: z.array(IpSchema), routes: z.array(RouteSchema) })),
});
export type NetworkIP = z.infer<typeof IpSchema>;
export type NetworkRoute = z.infer<typeof RouteSchema>;
export type NetworkResults = z.infer<typeof NetworkResultsSchema>;
export type NetworkConfig = {
  enabled: boolean; ip_enabled: boolean; guest_visible: boolean; show_home: boolean; show_details: boolean;
  all_nodes: boolean; nodes: string[]; interval_minutes: number; ip_interval_hours: number;
  concurrency: number; nexttrace_path: string;
  ip_source: "ipinfo" | "ipregistry"; ipregistry_api_key?: string; ip_guest_visible: boolean;
  show_asn: boolean; show_organization: boolean; show_ip_type: boolean;
};
export const carrierNames = { ct: "电信", cu: "联通", cm: "移动" };

export function routeName(route: NetworkRoute) {
  return route.task_name || [route.region, route.carrier ? carrierNames[route.carrier] : "", route.family ? `IPv${route.family}` : ""].filter(Boolean).join(" · ");
}

export function networkIPLabels(ip: NetworkIP, settings: NetworkResults) {
  const labels: { key: string; text: string; fullText?: string }[] = [];
  if (settings.show_asn !== false && ip.asn) labels.push({ key: "asn", text: ip.asn });
  const organization = ip.organization.trim();
  if (settings.show_organization !== false && organization && organization !== "未知") labels.push({ key: "organization", text: organizationLabel(organization), fullText: organization });
  if (settings.show_ip_type !== false && ip.type && ip.type !== "未知") labels.push({ key: "type", text: ip.type });
  return labels;
}

export function showIPLabels(settings: NetworkResults) {
  return settings.ip_available !== false && [settings.show_asn, settings.show_organization, settings.show_ip_type].some((value) => value !== false);
}

export function routeLabel(route: NetworkRoute) {
  if (route.status === "pending") return route.running ? "检测中" : "待检测";
  if (route.status === "error") return "检测失败";
  // 新插件统一判断线路；仅旧插件没有最终标签时兼容原有显示方式。
  if (route.route_label !== undefined) return route.route_label || "无法确定";
  const preferred = route.carrier === "ct" ? ["AS4809", "AS4134", "AS4847"]
    : route.carrier === "cu" ? ["AS9929", "AS4837", "AS4808", "AS10099"]
      : ["AS58807", "AS58453", "AS9808"];
  const network = preferred.map((asn) => route.networks.find((item) => item.asn === asn)).find(Boolean)
    || route.networks.at(-1);
  if (!network) return "无法确定";
  const labels: Record<string, string> = {
    AS4809: "CN2", AS4134: "163", AS4847: "163", AS9929: "9929", AS4837: "4837",
    AS4808: "4837", AS10099: "10099", AS58807: "CMIN2", AS58453: "CMI", AS9808: "移动骨干",
  };
  return labels[network.asn] || network.name;
}

export async function getNetworkResults(signal?: AbortSignal): Promise<NetworkResults> {
  const response = await fetchWithTimeout("/api/public/lumina-network/v1/results", { credentials: "include", cache: "no-store" }, 15000, signal);
  if ([401, 403, 404].includes(response.status)) return { available: false, nodes: [] };
  if (!response.ok) throw new Error("网络识别结果暂时不可用");
  return NetworkResultsSchema.parse(await response.json());
}

const NetworkDetectionSchema = z.object({
  added: z.number(), queued: z.number(), running: z.number(), ip_added: z.number(), ip_queued: z.number(),
});
export type NetworkDetection = z.infer<typeof NetworkDetectionSchema>;

export type NetworkDetectionKind = "route" | "ip";

export function networkDetectionMessage(result: NetworkDetection, kind: NetworkDetectionKind = "route") {
  const added = kind === "ip" ? result.ip_added : result.added;
  const name = kind === "ip" ? "IP 信息查询" : "回程检测";
  return added > 0 ? `已加入${name}队列 ${added} 项，完成后自动更新。` : `${name}已在进行或排队，完成后自动更新。`;
}

export async function runNetworkDetection(kind: NetworkDetectionKind = "route"): Promise<NetworkDetection> {
  const response = await fetchWithTimeout(`/api/admin/lumina-network/v1/${kind === "ip" ? "ip-refresh" : "run"}`, {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: "{}",
  }, 15000);
  if (response.status === 404) throw new Error("请安装并启用 Lumina 网络识别插件 0.5.0 或更新版本");
  if ([401, 403].includes(response.status)) throw new Error("请先登录管理员账号");
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(result.error || "无法启动网络检测");
  return NetworkDetectionSchema.parse(result);
}

async function pluginRpc(method: string, params: Record<string, unknown>) {
  // 配置保存只发送一次 HTTP 请求，避免 WebSocket 超时回退造成重复保存和重载。
  const response = await fetchWithTimeout("/api/rpc2", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
  }, 30000);
  const payload = await response.json();
  if (!response.ok || payload.error) throw new Error(payload.error?.message || "无法访问网络识别插件，请确认已安装并启用");
  return payload.result;
}

export async function getNetworkConfig(): Promise<NetworkConfig> {
  const result = await pluginRpc("admin:getPluginConfiguration", { short: "lumina-network" });
  if (result.configuration?.data?.some((item: { key: string }) => item.key === "targets")) {
    throw new Error("请先将 Lumina 网络识别插件升级到 0.5.0 或更新版本，以跟随主页延迟检测");
  }
  const value = { ...result.data };
  delete value.targets;
  return { ip_source: "ipinfo", ip_guest_visible: false, show_asn: true, show_organization: true, show_ip_type: true,
    ...value, nodes: typeof value.nodes === "string" ? JSON.parse(value.nodes) : value.nodes };
}

export async function saveNetworkConfig(config: NetworkConfig) {
  // Komari 的节点选择配置按 JSON 文本保存，读取时才转换为列表。
  const data: Record<string, unknown> = { ...config, nodes: JSON.stringify(config.nodes) };
  delete data.targets;
  const validated = await fetchWithTimeout("/api/admin/lumina-network/v1/validate", {
    method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data),
  }, 15000);
  const result = await validated.json();
  if (config.ip_source === "ipregistry" && !result.ip_sources?.includes("ipregistry") && validated.ok) throw new Error("使用 IPregistry 请先将 Lumina 网络识别插件升级到 0.6.0 或更新版本");
  if (!validated.ok) throw new Error(result.error || "配置无效");
  if (result.independent_ip !== true || result.homepage_targets !== true) throw new Error("请先将 Lumina 网络识别插件升级到 0.5.0 或更新版本，以跟随主页延迟检测");
  await pluginRpc("admin:setPluginConfiguration", { short: "lumina-network", data });
}
