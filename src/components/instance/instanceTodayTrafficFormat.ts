import { formatNetworkRateLabel, formatBytes, formatClockTime } from "@/utils/format";
import type { CapacityUnit, NetworkRateUnit } from "@/utils/units";
import type { TodayTrafficStat } from "@/utils/trafficStats";

export function formatTodayTrafficValue(
  stat: TodayTrafficStat | undefined,
  pending: boolean,
  isError: boolean,
  unit: CapacityUnit = "auto",
): string {
  if (isError && !stat) return "今日流量加载失败";
  if (pending && !stat) return "—";
  if (isError) {
    if (!stat || !stat.hasSamples) return "今日暂无采样（更新失败）";
    return `↑ ${formatBytes(stat.trafficUp, unit)} · ↓ ${formatBytes(stat.trafficDown, unit)}（更新失败）`;
  }
  if (!stat || !stat.hasSamples) return "今日暂无采样";
  return `↑ ${formatBytes(stat.trafficUp, unit)} · ↓ ${formatBytes(stat.trafficDown, unit)}`;
}

export function formatTodayPeakValue(
  stat: TodayTrafficStat | undefined,
  pending: boolean,
  unit: NetworkRateUnit = "auto",
): string {
  if (pending && !stat) return "—";
  if (!stat || !stat.hasSamples) return "—";
  const upTime =
    stat.peakUp > 0 && stat.peakUpAt != null
      ? `（${formatClockTime(stat.peakUpAt)}）`
      : "";
  const downTime =
    stat.peakDown > 0 && stat.peakDownAt != null
      ? `（${formatClockTime(stat.peakDownAt)}）`
      : "";
  return `↑ ${formatNetworkRateLabel(stat.peakUp, unit)}${upTime} · ↓ ${formatNetworkRateLabel(stat.peakDown, unit)}${downTime}`;
}
