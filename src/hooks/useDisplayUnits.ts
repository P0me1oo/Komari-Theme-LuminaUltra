import { useMemo } from "react";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { formatBytes, formatNetworkRate, formatNetworkRateLabel } from "@/utils/format";

/** 格式化函数随单位设置更新，图表可以直接把它们加入依赖列表。 */
export function useDisplayUnits() {
  const { memoryUnit, diskUnit, trafficUnit, networkUnit } = useThemeSettings();
  return useMemo(() => ({
    formatMemory: (value: number | null | undefined) => formatBytes(value, memoryUnit),
    formatDisk: (value: number | null | undefined) => formatBytes(value, diskUnit),
    formatTraffic: (value: number | null | undefined) => formatBytes(value, trafficUnit),
    formatSpeed: (value: number | null | undefined) => formatNetworkRate(value, networkUnit),
    formatSpeedLabel: (value: number | null | undefined) => formatNetworkRateLabel(value, networkUnit),
  }), [memoryUnit, diskUnit, trafficUnit, networkUnit]);
}
