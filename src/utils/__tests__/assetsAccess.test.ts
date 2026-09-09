import { describe, expect, it } from "vitest";
import { canAccessAssets } from "@/utils/assetsAccess";
import { normalizeThemeSettings } from "@/utils/themeSettings";

describe("资产入口与页面访问", () => {
  it("未配置新开关的站点继续允许访客查看", () => {
    expect(canAccessAssets(normalizeThemeSettings({}), false)).toBe(true);
  });

  it("关闭访客访问后只允许已确认登录的用户查看", () => {
    const settings = normalizeThemeSettings({ allowGuestCostSummary: false });
    expect(canAccessAssets(settings, false)).toBe(false);
    expect(canAccessAssets(settings, true)).toBe(true);
  });

  it("仅开启悬浮入口时仍遵循访客开关", () => {
    const settings = normalizeThemeSettings({
      showCostSummary: false,
      showCostSummaryFloatingButton: true,
      allowGuestCostSummary: false,
    });
    expect(canAccessAssets(settings, false)).toBe(false);
    expect(canAccessAssets(settings, true)).toBe(true);
    expect(canAccessAssets({ ...settings, allowGuestCostSummary: true }, false)).toBe(true);
  });

  it("两个入口都关闭时保持资产页不可访问的原有规则", () => {
    const settings = normalizeThemeSettings({
      showCostSummary: false,
      showCostSummaryFloatingButton: false,
    });
    expect(canAccessAssets(settings, false)).toBe(false);
    expect(canAccessAssets(settings, true)).toBe(false);
  });
});
