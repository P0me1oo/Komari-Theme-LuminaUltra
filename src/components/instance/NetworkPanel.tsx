import { InstancePanel } from "@/components/instance/InstancePanel";
import { NetworkRouteRow } from "@/components/instance/NetworkRouteRow";
import { NetworkIPTags } from "@/components/node/NetworkIPTags";
import { useNetworkInfo } from "@/hooks/useNetworkInfo";
import { showIPLabels } from "@/services/networkInfo";

function time(value: string | null) {
  return value && Date.parse(value) > 0 ? new Date(value).toLocaleString("zh-CN") : "尚未检测";
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
      {showRoutes && <InstancePanel title="三网回程" className="network-routes-panel">
        {settings.error && <p role="alert">{settings.error}</p>}
        {node.routes.length > 0 && <div className="network-route-list">
          <div className="network-route-columns" aria-hidden="true">
            <span>检测目标</span><span>回程线路</span><span>检测时间</span><span />
          </div>
          {node.routes.map((route) => (
            <NetworkRouteRow key={`${route.task_id}-${route.region}-${route.carrier}-${route.family}-${route.address}`} route={route} />
          ))}
        </div>}
      </InstancePanel>}
    </>
  );
}
