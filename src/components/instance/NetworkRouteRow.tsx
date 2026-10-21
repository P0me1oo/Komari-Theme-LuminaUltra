import { ArrowRight, ChevronDown } from "lucide-react";
import { routeLabel, routeName, type NetworkRoute } from "@/services/networkInfo";
import { NetworkRouteSegments } from "@/components/ui/NetworkRouteSegments";

type NetworkHop = NonNullable<NetworkRoute["hops"]>[number];

const hopNetworks: Record<string, string> = {
  AS4809: "CN2", AS4134: "电信163", AS4847: "电信163", AS23764: "电信国际",
  AS9929: "9929", AS10099: "10099", AS4837: "4837", AS4808: "4837",
  AS58807: "CMIN2", AS58453: "CMI", AS9808: "移动骨干",
};

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

function checkedTime(value: string | null) {
  if (!value || !(Date.parse(value) > 0)) return "尚未检测";
  return new Date(value).toLocaleString("zh-CN");
}

export function NetworkRouteRow({ route }: { route: NetworkRoute }) {
  const name = routeName(route);
  const label = routeLabel(route);
  const hasHops = Boolean(route.hops?.length);
  const locations = (route.hops ?? []).reduce<string[]>((path, hop) => {
    const location = hop.location.trim();
    if (hop.ip && location && location !== "未知" && path.at(-1) !== location) path.push(location);
    return path;
  }, []);
  const warning = route.status === "partial" || (route.status === "ok" && route.reached === false);
  const state = route.status === "error" ? "error" : route.status === "pending" ? "pending" : warning ? "warning" : "ok";
  const summary = (
    <>
      <div className="network-route-target">
        <h3>{name}</h3>
        <div className="network-route-target-meta">
          <div className="network-route-address">
            {(route.family === 4 || route.family === 6) && <span className="network-route-family">IPv{route.family}</span>}
            <span>{route.address}</span>
          </div>
          {locations.length > 0 && <div className="network-route-geography">
            <span>地理路径</span>
            <ol aria-label={`${name}地理路径`}>
              {locations.map((location, index) => <li key={index}>
                {index > 0 && <ArrowRight size={13} aria-hidden="true" />}
                <span>{location}</span>
              </li>)}
            </ol>
          </div>}
        </div>
      </div>
      <div className="network-route-result">
        <span className="network-route-label" data-state={state}>
          <NetworkRouteSegments label={label} />
        </span>
        {warning && route.status !== "error" && <span className="network-route-warning">{route.reached === false ? "未到达目标" : "路径不完整"}</span>}
      </div>
      <div className="network-route-updated">
        <span>{checkedTime(route.checked_at)}</span>
        {route.running && <span className="network-route-updating" role="status">正在更新</span>}
      </div>
      {hasHops && <span className="network-route-toggle"><span className="network-route-expand-label">查看明细</span><span className="network-route-collapse-label">收起明细</span><ChevronDown size={15} aria-hidden="true" /></span>}
    </>
  );

  return (
    <section className="network-route">
      {hasHops ? (
        <details className="network-hop-details">
          <summary className="network-route-summary" aria-label={`${name}，${label}，查看具体路径`}>
            {summary}
          </summary>
          <div className="network-route-detail">
            <h4 className="network-route-detail-heading">逐跳明细</h4>
            <div className="network-table-scroll" role="region" aria-label={`${name}逐跳路径`} tabIndex={0}>
              <table>
                <caption className="sr-only">{name}逐跳路径</caption>
                <thead><tr><th>跳数</th><th>延迟</th><th>IP 地址</th><th>AS 号</th><th>企业 / 地区</th></tr></thead>
                <tbody>{pathRows(route.hops ?? []).map(({ hop, endTtl }, index) => (
                  endTtl > hop.ttl ? (
                    <tr key={index}><td>{hop.ttl}–{endTtl}</td><td colSpan={4}>连续 {endTtl - hop.ttl + 1} 跳未响应</td></tr>
                  ) : (
                    <tr key={index}>
                      <td>{hop.ttl}</td>
                      <td>{hop.rtt_ms == null ? "—" : <>{hop.rtt_ms.toFixed(1)} <span className="network-hop-unit">ms</span></>}</td>
                      <td>{hop.ip || "未响应"}</td>
                      <td>{hop.asn ? <div className="network-hop-asn">
                        <span>{hop.asn}</span>
                        {Object.hasOwn(hopNetworks, hop.asn) && <span className="network-hop-network" data-network={hopNetworks[hop.asn]}>{hopNetworks[hop.asn]}</span>}
                      </div> : "—"}</td>
                      <td><span className="network-hop-owner">{hop.owner || (hop.location ? "" : "未知")}</span>{hop.location && <span className="network-hop-location">{hop.location}</span>}</td>
                    </tr>
                  )
                ))}</tbody>
              </table>
            </div>
          </div>
        </details>
      ) : <div className="network-route-summary">{summary}</div>}
      {route.error && <p className="network-route-error" role="status">{route.error}</p>}
    </section>
  );
}
