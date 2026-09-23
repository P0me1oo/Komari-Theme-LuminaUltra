import { describe, expect, it } from "vitest";
import { canAccessAssets } from "@/utils/assetsAccess";
import { normalizeThemeSettings } from "@/utils/themeSettings";

describe("资产入口与页面访问", () => {
  it("未配置可见范围的站点继续允许访客查看", () => {
    expect(canAccessAssets(normalizeThemeSettings({}), false)).toBe(true);
  });

  it("仅登录可见档只允许已确认登录的用户查看", () => {
    const settings = normalizeThemeSettings({ costVisibility: "member" });
    expect(canAccessAssets(settings, false)).toBe(false);
    expect(canAccessAssets(settings, true)).toBe(true);
  });

  it("全局隐藏档挡住访客，登录用户仍可进资产页核对明细", () => {
    const settings = normalizeThemeSettings({ costVisibility: "hidden" });
    expect(canAccessAssets(settings, false)).toBe(false);
    expect(canAccessAssets(settings, true)).toBe(true);
  });

  it("仅开启快捷入口时仍遵循可见范围", () => {
    const settings = normalizeThemeSettings({
      showCostSummary: false,
      showCostSummaryFloatingButton: true,
      costVisibility: "member",
    });
    expect(canAccessAssets(settings, false)).toBe(false);
    expect(canAccessAssets(settings, true)).toBe(true);
    expect(canAccessAssets({ ...settings, costVisibility: "public" }, false)).toBe(true);
  });

  it("两个入口都关闭时保持资产页不可访问的原有规则", () => {
    const settings = normalizeThemeSettings({
      showCostSummary: false,
      showCostSummaryFloatingButton: false,
    });
    expect(canAccessAssets(settings, false)).toBe(false);
    expect(canAccessAssets(settings, true)).toBe(false);
    expect(
      canAccessAssets({ ...settings, costVisibility: "hidden" }, true),
    ).toBe(false);
  });
});
