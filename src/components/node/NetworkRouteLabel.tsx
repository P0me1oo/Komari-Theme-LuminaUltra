import type { ReactNode } from "react";
import { useNetworkInfo } from "@/hooks/useNetworkInfo";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { routeLabel, routeName } from "@/services/networkInfo";
import { invertHomepagePingTaskBindings } from "@/utils/pingTasks";

export function NetworkRouteLabel({ uuid, taskId, children = null }: { uuid: string; taskId: number | null; children?: ReactNode }) {
  const { node, settings } = useNetworkInfo(uuid);
  const route = taskId == null ? undefined : node?.routes.find((item) => item.task_id === taskId);
  if (!settings?.show_home || !route) return children;
  const label = routeLabel(route);
  const title = [routeName(route), route.address, label, route.running ? "正在更新" : "", route.error,
    route.checked_at ? new Date(route.checked_at).toLocaleString("zh-CN") : ""].filter(Boolean).join(" · ");
  return <span className="network-loss-route" title={title} aria-label={`回程线路：${label}`}>{label}</span>;
}

export function SingleNetworkRouteLabel({ uuid, children }: { uuid: string; children?: ReactNode }) {
  const { homepagePingBindings } = useThemeSettings();
  const taskId = invertHomepagePingTaskBindings(homepagePingBindings).get(uuid) ?? null;
  return <NetworkRouteLabel uuid={uuid} taskId={taskId}>{children}</NetworkRouteLabel>;
}
