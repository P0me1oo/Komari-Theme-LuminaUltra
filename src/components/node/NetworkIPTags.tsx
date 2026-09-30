import { networkIPLabels, showIPLabels, type NetworkIP, type NetworkResults } from "@/services/networkInfo";

export function NetworkIPTags({ ip, settings }: { ip: NetworkIP; settings: NetworkResults }) {
  if (!showIPLabels(settings)) return null;
  const labels = networkIPLabels(ip, settings);
  if (!labels.length && !ip.error) return null;
  const title = [labels.map((label) => label.fullText ?? label.text).join(" · "), ip.source, ip.stale ? "结果已过期" : "", ip.error].filter(Boolean).join(" · ");
  return (
    <div className="network-ip-label-row" aria-label={`IPv${ip.family} 标签`} title={title}>
      <span className="network-summary-key">IPv{ip.family}</span>
      <div className="network-ip-tags">
        {labels.map((label) => <span key={label.key} className="network-ip-tag" data-ip-label={label.key}>{label.text}</span>)}
        {!labels.length && ip.error && <span className="network-ip-notice">IP 信息查询失败</span>}
        {!!labels.length && ip.stale && <span className="network-ip-notice">过期</span>}
      </div>
    </div>
  );
}
