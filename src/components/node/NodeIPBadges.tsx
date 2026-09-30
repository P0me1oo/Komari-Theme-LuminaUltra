import { useNetworkInfo } from "@/hooks/useNetworkInfo";
import { networkIPLabels, showIPLabels } from "@/services/networkInfo";
import { IpStackBadges } from "./IpStackBadges";

export function NodeIPBadges({ uuid, ipv4, ipv6, showStack = true }: {
  uuid: string;
  ipv4?: string | null;
  ipv6?: string | null;
  showStack?: boolean;
}) {
  const { node, settings } = useNetworkInfo(uuid);
  const ips = node && settings && showIPLabels(settings) ? node.ips : [];
  const groups: { key: string; families: number[]; labels: ReturnType<typeof networkIPLabels>; title: string }[] = [];
  for (const family of [4, 6]) {
    const ip = ips.find((entry) => entry.family === family);
    const labels = ip && settings ? networkIPLabels(ip, settings) : [];
    const hasStack = showStack && Boolean((family === 4 ? ipv4 : ipv6) || labels.length);
    if (!hasStack && !labels.length) continue;
    const title = labels.length && ip ? [ip.source, ip.stale ? "结果已过期" : ""].filter(Boolean).join(" · ") : "";
    const key = JSON.stringify([labels, title]);
    const group = groups.find((entry) => entry.key === key);
    if (group) group.families.push(family);
    else groups.push({ key, families: [family], labels, title });
  }
  if (!groups.length) return null;
  return (
    <span className="node-ip-badges">
      {groups.map((group) => (
        <span key={group.key} className="node-ip-badge-group" aria-label={group.families.map((family) => `IPv${family}`).join(" / ") + " 网络标签"}>
          {showStack && <IpStackBadges families={group.families} />}
          {group.labels.map((label) => (
            <span key={label.key} className="node-ip-attribute" data-ip-label={label.key}
              title={[group.families.map((family) => `IPv${family}`).join(" / "), label.fullText ?? label.text, group.title].filter(Boolean).join(" · ")}>
              {label.text}
            </span>
          ))}
        </span>
      ))}
    </span>
  );
}
