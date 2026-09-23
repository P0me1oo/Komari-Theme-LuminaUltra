import { describe, expect, it } from "vitest";
import {
  DEFAULT_THEME_SETTINGS,
  canViewCostDetails,
  canViewCosts,
  normalizeThemeSettings,
  shouldShowAdminEntry,
} from "@/utils/themeSettings";
import { DEFAULT_BACKGROUND_VIDEO_URL } from "@/utils/background";

describe("normalizeThemeSettings", () => {
  it("defaults to image mode with the bundled desktop video ready to enable", () => {
    const settings = normalizeThemeSettings({});

    expect(settings.backgroundMediaType).toBe("image");
    expect(settings.backgroundVideo).toBe(DEFAULT_BACKGROUND_VIDEO_URL);
    expect(settings.backgroundVideoDark).toBe("");
    expect(settings.backgroundMediaType).toBe(DEFAULT_THEME_SETTINGS.backgroundMediaType);
    expect(settings.backgroundVideo).toBe(DEFAULT_THEME_SETTINGS.backgroundVideo);
    expect(normalizeThemeSettings({ backgroundVideo: "" }).backgroundVideo).toBe(
      DEFAULT_BACKGROUND_VIDEO_URL,
    );
  });

  it("keeps ambient effects opt-in and normalizes the selected preset", () => {
    const defaults = normalizeThemeSettings({});
    expect(defaults.enableAmbientEffect).toBe(false);
    expect(defaults.ambientEffect).toBe("sakura");

    expect(
      normalizeThemeSettings({
        enableAmbientEffect: true,
        ambientEffect: "leaves",
      }),
    ).toMatchObject({
      enableAmbientEffect: true,
      ambientEffect: "leaves",
    });
    expect(normalizeThemeSettings({ ambientEffect: "unknown" } as never).ambientEffect).toBe(
      "sakura",
    );
    expect(normalizeThemeSettings({ ambientEffect: "fireflies" } as never).ambientEffect).toBe(
      "sakura",
    );
    expect(normalizeThemeSettings({ enableAmbientEffect: "yes" } as never).enableAmbientEffect).toBe(
      false,
    );
  });

  it("normalizes the light and dark video fields independently", () => {
    const light = "https://cdn.example/day.mp4?Policy=a(b)&Signature=x%2By%3D";
    const dark = "/media/night%20sky.mp4?token=a%7Cb";
    const settings = normalizeThemeSettings({
      backgroundMediaType: "video",
      backgroundVideo: `  ${light}  `,
      backgroundVideoDark: `  ${dark}  `,
    });

    expect(settings.backgroundMediaType).toBe("video");
    expect(settings.backgroundVideo).toBe(light);
    expect(settings.backgroundVideoDark).toBe(dark);
  });

  it("does not migrate a pipe-delimited video value", () => {
    const settings = normalizeThemeSettings({
      backgroundVideo: "/light.mp4|/dark.mp4",
      backgroundVideoDark: "/night.mp4",
    });

    expect(settings.backgroundVideo).toBe(DEFAULT_BACKGROUND_VIDEO_URL);
    expect(settings.backgroundVideoDark).toBe("/night.mp4");
  });

  it("falls unknown media types back to image and rejects unsafe video URLs", () => {
    const settings = normalizeThemeSettings({
      backgroundMediaType: "animation",
      backgroundVideo: "javascript:alert(1)",
    } as never);

    expect(settings.backgroundMediaType).toBe("image");
    expect(settings.backgroundVideo).toBe(DEFAULT_BACKGROUND_VIDEO_URL);
    expect(settings.backgroundVideoDark).toBe("");
  });

  it("keeps mini and falls unknown saved view modes back to compact", () => {
    const settings = normalizeThemeSettings({
      desktopNodeViewMode: "retired-view",
      mobileNodeViewMode: "retired-view",
    } as never);

    expect(settings.desktopNodeViewMode).toBe("compact");
    expect(settings.mobileNodeViewMode).toBe("compact");
    expect(normalizeThemeSettings({ desktopNodeViewMode: "mini" }).desktopNodeViewMode).toBe(
      "mini",
    );
    expect(normalizeThemeSettings({ mobileNodeViewMode: "mini" }).mobileNodeViewMode).toBe("mini");
    expect(normalizeThemeSettings({ mobileNodeViewMode: "list" }).mobileNodeViewMode).toBe(
      "compact",
    );
  });

  it("defaults overview ratings on unless explicitly disabled", () => {
    expect(normalizeThemeSettings({}).showOverviewRatings).toBe(true);
    expect(normalizeThemeSettings({ showOverviewRatings: false }).showOverviewRatings).toBe(false);
  });

  it("概览资源卡默认关闭，费用默认公开", () => {
    expect(normalizeThemeSettings({})).toMatchObject({
      showOverviewOnline: true,
      showOverviewBandwidth: true,
      showOverviewTraffic: true,
      showOverviewAsset: true,
      showOverviewMemory: false,
      showOverviewDisk: false,
      costVisibility: "public",
    });
    expect(
      normalizeThemeSettings({
        showOverviewOnline: false,
        showOverviewBandwidth: false,
        showOverviewTraffic: false,
        showOverviewAsset: false,
        showOverviewMemory: true,
        showOverviewDisk: true,
        costVisibility: "member",
      }),
    ).toMatchObject({
      showOverviewOnline: false,
      showOverviewBandwidth: false,
      showOverviewTraffic: false,
      showOverviewAsset: false,
      showOverviewMemory: true,
      showOverviewDisk: true,
      costVisibility: "member",
    });
  });

  it("normalizes homepage multi-ping tasks while preserving an enabled draft for repair", () => {
    expect(normalizeThemeSettings({}).enableHomepageMultiPing).toBe(false);
    expect(
      normalizeThemeSettings({
        enableHomepageMultiPing: true,
        homepageMultiPingTaskIds: [3, 1],
      }).enableHomepageMultiPing,
    ).toBe(true);

    const resolved = normalizeThemeSettings({
      enableHomepageMultiPing: true,
      homepageMultiPingTaskIds: [3, 1, 3, 2, 4],
    });
    expect(resolved.enableHomepageMultiPing).toBe(true);
    expect(resolved.homepageMultiPingTaskIds).toEqual([3, 1, 2]);
  });

  it("normalizes complete per-node multi-ping overrides and drops malformed entries", () => {
    const resolved = normalizeThemeSettings({
      homepageMultiPingNodeTaskIds: {
        "node-a": [4, 2, 3],
        "node-b": [1, 1, 2],
      },
    });

    expect(resolved.homepageMultiPingNodeTaskIds).toEqual({
      "node-a": [4, 2, 3],
    });
    expect(normalizeThemeSettings({}).homepageMultiPingNodeTaskIds).toEqual({});
  });

  it("defaults home sort to weight ascending and falls back to a field's natural direction", () => {
    const base = normalizeThemeSettings({});
    expect(base.enableHomeSort).toBe(true);
    expect(base.homeSortField).toBe("default");
    expect(base.homeSortDirection).toBe("asc");

    // 指定字段但缺省方向 → 回落该字段自然方向(网速为降序)。
    expect(normalizeThemeSettings({ homeSortField: "speed" } as never).homeSortDirection).toBe("desc");
    // 非法字段回落 default。
    expect(normalizeThemeSettings({ homeSortField: "nope" } as never).homeSortField).toBe("default");
  });

  it("支持保存离线与高负载排序，未指定方向时使用降序", () => {
    for (const field of ["offline", "load"] as const) {
      expect(normalizeThemeSettings({ homeSortField: field })).toMatchObject({
        homeSortField: field,
        homeSortDirection: "desc",
      });
      expect(normalizeThemeSettings({
        homeSortField: field,
        homeSortDirection: "asc",
      }).homeSortDirection).toBe("asc");
    }
  });

  it("费用可见范围与访客信息卡片分别保存，不影响现有入口开关", () => {
    expect(normalizeThemeSettings({})).toMatchObject({
      costVisibility: "public",
      visitorInfoCardEnabled: true,
    });
    expect(normalizeThemeSettings({
      costVisibility: "member",
      visitorInfoCardEnabled: false,
    })).toMatchObject({
      costVisibility: "member",
      visitorInfoCardEnabled: false,
      showCostSummary: true,
      showCostSummaryFloatingButton: true,
    });
  });

  it("keeps fake ping off unless explicitly enabled", () => {
    expect(normalizeThemeSettings({}).fakePingForUnbound).toBe(false);
    expect(normalizeThemeSettings({ fakePingForUnbound: true }).fakePingForUnbound).toBe(true);
    // 非布尔真值不算显式开启。
    expect(
      normalizeThemeSettings({ fakePingForUnbound: "yes" } as never).fakePingForUnbound,
    ).toBe(false);
  });

  it("keeps timed home header hiding opt-in and normalizes its duration", () => {
    const defaults = normalizeThemeSettings({});
    expect(defaults.enableHomeHeaderAutoHide).toBe(false);
    expect(defaults.homeHeaderVisibleSeconds).toBe(10);

    expect(
      normalizeThemeSettings({
        enableHomeHeaderAutoHide: true,
        homeHeaderVisibleSeconds: 12.6,
      }),
    ).toMatchObject({
      enableHomeHeaderAutoHide: true,
      homeHeaderVisibleSeconds: 13,
    });
    expect(normalizeThemeSettings({ homeHeaderVisibleSeconds: 0 }).homeHeaderVisibleSeconds).toBe(1);
    expect(
      normalizeThemeSettings({ homeHeaderVisibleSeconds: 9999 }).homeHeaderVisibleSeconds,
    ).toBe(3600);
  });

  it("hides the admin entry only from logged-out visitors when explicitly enabled", () => {
    const defaults = normalizeThemeSettings({});
    expect(defaults.hideAdminEntryWhenLoggedOut).toBe(false);
    expect(shouldShowAdminEntry(defaults, false)).toBe(true);

    const visitorHidden = normalizeThemeSettings({
      hideAdminEntryWhenLoggedOut: true,
    });
    expect(shouldShowAdminEntry(visitorHidden, false)).toBe(false);
    expect(shouldShowAdminEntry(visitorHidden, true)).toBe(true);

    // 旧字段继续作为全局总开关，避免改变存量手工配置的行为。
    const legacyDisabled = normalizeThemeSettings({ enableAdminButton: false });
    expect(shouldShowAdminEntry(legacyDisabled, false)).toBe(false);
    expect(shouldShowAdminEntry(legacyDisabled, true)).toBe(false);
  });

  it("仅登录可见档下访客看不到费用，登录用户仍可查看", () => {
    const defaults = normalizeThemeSettings({});
    expect(defaults.costVisibility).toBe("public");
    expect(canViewCosts(defaults, false)).toBe(true);

    const privateCosts = normalizeThemeSettings({ costVisibility: "member" });
    expect(canViewCosts(privateCosts, false)).toBe(false);
    expect(canViewCosts(privateCosts, true)).toBe(true);
  });

  it("全局隐藏档对所有人藏价格，资产明细仍留给登录用户", () => {
    const hidden = normalizeThemeSettings({ costVisibility: "hidden" });
    expect(canViewCosts(hidden, false)).toBe(false);
    expect(canViewCosts(hidden, true)).toBe(false);
    expect(canViewCostDetails(hidden, false)).toBe(false);
    expect(canViewCostDetails(hidden, true)).toBe(true);
  });

  it("非法的可见范围回落到旧开关或默认公开", () => {
    expect(normalizeThemeSettings({ costVisibility: "all" } as never).costVisibility).toBe("public");
    expect(
      normalizeThemeSettings({ costVisibility: "all", showCostsToGuests: false } as never)
        .costVisibility,
    ).toBe("member");
  });

  it.each([
    [{}, "public"],
    [{ showCostsToGuests: true }, "public"],
    [{ showCostsToGuests: false }, "member"],
    [{ allowGuestCostSummary: true, showNodePrice: true }, "public"],
    [{ allowGuestCostSummary: false }, "member"],
    [{ showNodePrice: false }, "member"],
    [{ allowGuestCostSummary: false, showNodePrice: true }, "member"],
    [{ allowGuestCostSummary: true, showNodePrice: false }, "member"],
    [{ allowGuestCostSummary: false, showNodePrice: false }, "member"],
  ])("旧配置 %j 迁移后费用可见范围为 %s", (legacy, expected) => {
    const resolved = normalizeThemeSettings(legacy);
    expect(resolved.costVisibility).toBe(expected);
    expect(canViewCosts(resolved, false)).toBe(expected === "public");
    expect(canViewCosts(resolved, true)).toBe(true);
    expect(resolved).not.toHaveProperty("allowGuestCostSummary");
    expect(resolved).not.toHaveProperty("showNodePrice");
    expect(resolved).not.toHaveProperty("showCostsToGuests");
    expect(normalizeThemeSettings({ ...resolved }).costVisibility).toBe(expected);
  });

  it.each(["public", "member", "hidden"] as const)(
    "显式的新字段 %s 优先于残留的旧配置",
    (costVisibility) => {
      const resolved = normalizeThemeSettings({
        costVisibility,
        showCostsToGuests: costVisibility !== "public",
        allowGuestCostSummary: costVisibility !== "public",
        showNodePrice: costVisibility !== "public",
      });
      expect(resolved.costVisibility).toBe(costVisibility);
      expect(canViewCosts(resolved, false)).toBe(costVisibility === "public");
      expect(canViewCosts(resolved, true)).toBe(costVisibility !== "hidden");
    },
  );

  it("parses hiddenNodes from a delimited string and dedupes", () => {
    expect(normalizeThemeSettings({}).hiddenNodes).toEqual([]);
    expect(
      normalizeThemeSettings({ hiddenNodes: "节点A, 节点A\nuuid-1；节点B" } as never).hiddenNodes,
    ).toEqual(["节点A", "uuid-1", "节点B"]);
  });
});
