import { Database } from "lucide-react";
import type { TrafficResetDisplay } from "@/utils/trafficReset";
import { useThemeSettings } from "@/hooks/useThemeSettings";

export function TrafficQuotaLabel({
  remainingLabel,
  reset,
}: {
  remainingLabel: string;
  reset: TrafficResetDisplay | null;
}) {
  const { trafficUnit } = useThemeSettings();
  // 自动档沿用旧缩写，固定档保留完整单位，避免 TB、GB、MB 的选择被省略。
  const compactRemaining = trafficUnit === "auto"
    ? remainingLabel.replace(
        /^(\d+(?:\.\d+)?)\s+([KMGTPE]?)B$/,
        (_, value: string, unit: string) => `${Number(value)}${unit || "B"}`,
      )
    : remainingLabel.replace(" ", "");

  return (
    <span className="traffic-quota-label">
      <span className="traffic-quota-summary">
        <Database size={13} strokeWidth={2} />
        <span>剩余</span>
        <span>
          <strong className="traffic-quota-remain" title={remainingLabel}>{compactRemaining}</strong>
          {reset && (
            <span className="traffic-quota-reset" title={reset.title}>
              {" ·"}{reset.label}
            </span>
          )}
        </span>
      </span>
    </span>
  );
}
