import { useNetworkInfo } from "@/hooks/useNetworkInfo";
import { routeName, routeLabel } from "@/services/networkInfo";

export function NetworkSummary({ uuid }: { uuid: string }) {
  const { node, settings } = useNetworkInfo(uuid);
  if (!node || !settings?.show_home || !node.routes.length) return null;
  return (
    <div className="network-summary" aria-label="三网回程">
      {node.routes.map((route) => (
        <div key={`${route.task_id}-${route.region}-${route.carrier}-${route.family}-${route.address}`} className="network-summary-line" title={[route.address, route.error, route.checked_at ? new Date(route.checked_at).toLocaleString("zh-CN") : ""].filter(Boolean).join(" · ")}>
          <span className="network-summary-key">{routeName(route)}</span>
          <span className="network-summary-value">{routeLabel(route)}</span>
        </div>
      ))}
    </div>
  );
}
