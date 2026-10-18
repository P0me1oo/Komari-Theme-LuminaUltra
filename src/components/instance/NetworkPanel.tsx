import { InstancePanel } from "@/components/instance/InstancePanel";
import { NetworkIPTags } from "@/components/node/NetworkIPTags";
import { useNetworkInfo } from "@/hooks/useNetworkInfo";
import { routeName, routeLabel, showIPLabels, type NetworkRoute } from "@/services/networkInfo";

function time(value: string | null) {
  return value && Date.parse(value) > 0 ? new Date(value).toLocaleString("zh-CN") : "尚未检测";
}

type NetworkHop = NonNullable<NetworkRoute["hops"]>[number];

function pathRows(hops: NetworkHop[]) {
  const rows: { hop: NetworkHop; endTtl: number }[] = [];
  for (const hop of hops) {
    const previous = rows.at(-1);
    if (!hop.ip && previous && !previous.hop.ip && hop.ttl === previous.endTtl + 1) {
      previous.endTtl = hop.ttl;
    } else {
      rows.push({ hop, endTtl: hop.ttl });
    }
  }
  return rows;
}

export function NetworkPanel({ uuid }: { uuid: string }) {
  const { node, settings } = useNetworkInfo(uuid);
  if (!node || !settings) return null;
  const showIPs = showIPLabels(settings) && (node.ips.length > 0 || settings.ip_error);
  const showRoutes = (settings.show_details && node.routes.length > 0) || settings.error;
  return (
    <>
      {showIPs && <InstancePanel title="IP 信息与标签">
        {settings.ip_error && <p role="alert">{settings.ip_error}</p>}
        <div className="network-ip-grid">
          {node.ips.map((ip) => (
            <div key={ip.family} className="network-ip-item">
              <NetworkIPTags ip={ip} settings={settings} />
              {ip.address && <span className="network-ip-meta">{ip.address}</span>}
              <span className="network-ip-meta">{time(ip.checked_at)}{ip.stale ? " · 已过期" : ""} · {ip.source}</span>
              {ip.error && <span className="network-ip-meta" role="status">{ip.error}</span>}
            </div>
          ))}
        </div>
      </InstancePanel>}
      {showRoutes && <InstancePanel title="三网回程">
        {settings.error && <p role="alert">{settings.error}</p>}
        <div className="network-route-list">
          {node.routes.map((route) => (
            <section key={`${route.task_id}-${route.region}-${route.carrier}-${route.family}-${route.address}`} className="network-route">
              <div className="network-route-heading">
                <h3>{routeName(route)}</h3>
                <strong>{routeLabel(route)}</strong>
              </div>
              <div className="network-route-meta">
                <span>{route.address}</span>
                <span>{time(route.checked_at)}{route.running ? " · 正在更新" : ""}</span>
                {!!route.matched_asns?.length && <span>ASN 证据 {route.matched_asns.join("、")}</span>}
                {!!route.matched_prefixes?.length && <span>前缀证据 {route.matched_prefixes.join("、")}</span>}
                {route.rule_version && <span>规则 {route.rule_version}</span>}
                {route.status === "partial" && <span>路径不完整</span>}
                {route.reached === false && <span>未到达目标</span>}
                {route.error && <span>{route.error}</span>}
              </div>
              {!!route.hops?.length && (
                <details className="network-hop-details">
                  <summary>查看具体路径</summary>
                  <div className="network-table-scroll">
                    <table>
                      <thead><tr><th>跳数</th><th>地址</th><th>AS 号</th><th>企业 / 地区</th><th>延迟</th></tr></thead>
                      <tbody>{pathRows(route.hops).map(({ hop, endTtl }, index) => (
                        endTtl > hop.ttl ? (
                          <tr key={index}><td>{hop.ttl}–{endTtl}</td><td colSpan={4}>连续 {endTtl - hop.ttl + 1} 跳未响应</td></tr>
                        ) : (
                          <tr key={index}><td>{hop.ttl}</td><td>{hop.ip || "未响应"}</td><td>{hop.asn || "—"}</td><td>{[hop.owner, hop.location].filter(Boolean).join(" · ") || "未知"}</td><td>{hop.rtt_ms == null ? "—" : `${hop.rtt_ms.toFixed(1)} ms`}</td></tr>
                        )
                      ))}</tbody>
                    </table>
                  </div>
                </details>
              )}
            </section>
          ))}
        </div>
      </InstancePanel>}
    </>
  );
}
