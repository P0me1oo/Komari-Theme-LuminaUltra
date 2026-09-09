import type { ResolvedThemeSettings } from "@/utils/themeSettings";

type AssetsAccessSettings = Pick<
  ResolvedThemeSettings,
  "showCostSummary" | "showCostSummaryFloatingButton" | "allowGuestCostSummary"
>;

/** 资产入口与资产页共用同一规则；登录状态未确认时按访客处理。 */
export function canAccessAssets(settings: AssetsAccessSettings, loggedIn: boolean): boolean {
  return (
    (settings.showCostSummary || settings.showCostSummaryFloatingButton) &&
    (settings.allowGuestCostSummary || loggedIn)
  );
}
