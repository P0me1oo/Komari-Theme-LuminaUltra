import type { ThemeSettings } from "@/types/komari";
import {
  DEFAULT_BACKGROUND_ALIGNMENT,
  DEFAULT_BACKGROUND_VIDEO_URL,
  DEFAULT_SURFACE_OPACITY,
  normalizeBackgroundAlignment,
  normalizeBackgroundUrl,
  normalizeBackgroundVideoUrl,
  normalizeSurfaceOpacity,
} from "@/utils/background";
import {
  DEFAULT_COST_RATE_API_URL,
  normalizeCostIgnoredNodes,
  normalizeCostPremiums,
  normalizeCostRateApiUrl,
  type CostPremiumEntry,
} from "@/utils/cost";
import { normalizeNodeIdentityList } from "@/utils/nodeIdentity";
import { normalizeHomeGroupOrder } from "@/utils/homeNodes";
import {
  HOME_SORT_NATURAL_DIRECTION,
  isHomeSortDirection,
  isHomeSortField,
  type HomeSortDirection,
  type HomeSortField,
} from "@/utils/homeSort";
import {
  normalizeHomepageMultiPingTaskIds,
  normalizeHomepageMultiPingNodeTaskIds,
  normalizeHomepagePingTaskBindings,
  type HomepageMultiPingNodeTaskIds,
  type HomepagePingTaskBindings,
} from "@/utils/pingTasks";

export type Appearance = "system" | "light" | "dark";
export type NodeViewMode = "large" | "compact" | "mini" | "list";
export type BackgroundMediaType = "image" | "video";
/**
 * 费用可见范围：
 * - public 所有人可见；
 * - member 仅登录用户可见（访客看不到价格）；
 * - hidden 所有人都看不到价格，管理员仍可主动打开资产页核对明细。
 */
export type CostVisibility = "public" | "member" | "hidden";
export const COST_VISIBILITY_VALUES: readonly CostVisibility[] = [
  "public",
  "member",
  "hidden",
];
export type AmbientEffect =
  | "sakura"
  | "rain"
  | "snow"
  | "leaves"
  | "confetti"
  | "fireworks";

export const AMBIENT_EFFECTS: readonly AmbientEffect[] = [
  "sakura",
  "rain",
  "snow",
  "leaves",
  "confetti",
  "fireworks",
];

export interface ResolvedThemeSettings {
  defaultAppearance: Appearance;
  desktopNodeViewMode: NodeViewMode;
  mobileNodeViewMode: NodeViewMode;
  enableAdminButton: boolean;
  hideAdminEntryWhenLoggedOut: boolean;
  visitorInfoCardEnabled: boolean;
  showPingChart: boolean;
  homepagePingBindings: HomepagePingTaskBindings;
  enableHomepageMultiPing: boolean;
  homepageMultiPingTaskIds: number[];
  homepageMultiPingNodeTaskIds: HomepageMultiPingNodeTaskIds;
  fakePingForUnbound: boolean;
  enableHomeHeaderAutoHide: boolean;
  homeHeaderVisibleSeconds: number;
  showHomeOverview: boolean;
  showGroupTabs: boolean;
  showRegionBar: boolean;
  showCardGroup: boolean;
  homeGroupOrder: string[];
  enableHomeSort: boolean;
  homeSortField: HomeSortField;
  homeSortDirection: HomeSortDirection;
  costVisibility: CostVisibility;
  showCostSummary: boolean;
  showCostSummaryFloatingButton: boolean;
  showOverviewOnline: boolean;
  showOverviewBandwidth: boolean;
  showOverviewTraffic: boolean;
  showOverviewAsset: boolean;
  showOverviewMemory: boolean;
  showOverviewDisk: boolean;
  showOverviewRatings: boolean;
  showTrafficRating: boolean;
  showBandwidthRating: boolean;
  showAssetRating: boolean;
  trafficRatingLabels: string;
  bandwidthRatingLabels: string;
  assetRatingLabels: string;
  compactShowTrafficTotal: boolean;
  compactShowBilling: boolean;
  compactShowUptime: boolean;
  showIpStackBadges: boolean;
  showConnections: boolean;
  showTodayTrafficPopover: boolean;
  hiddenNodes: string[];
  costIgnoredNodes: string[];
  costPremiums: Record<string, CostPremiumEntry>;
  costRateApiUrl: string;
  enableBackgroundImage: boolean;
  backgroundMediaType: BackgroundMediaType;
  backgroundImage: string;
  backgroundImageMobile: string;
  backgroundVideo: string;
  backgroundVideoDark: string;
  backgroundAlignment: string;
  surfaceOpacity: number;
  enableAmbientEffect: boolean;
  ambientEffect: AmbientEffect;
}

export const DEFAULT_THEME_SETTINGS: ResolvedThemeSettings = {
  defaultAppearance: "system",
  desktopNodeViewMode: "large",
  mobileNodeViewMode: "compact",
  enableAdminButton: true,
  hideAdminEntryWhenLoggedOut: false,
  visitorInfoCardEnabled: true,
  showPingChart: true,
  homepagePingBindings: {},
  enableHomepageMultiPing: false,
  homepageMultiPingTaskIds: [],
  homepageMultiPingNodeTaskIds: {},
  fakePingForUnbound: false,
  enableHomeHeaderAutoHide: false,
  homeHeaderVisibleSeconds: 10,
  showHomeOverview: true,
  showGroupTabs: true,
  showRegionBar: true,
  showCardGroup: true,
  homeGroupOrder: [],
  enableHomeSort: true,
  homeSortField: "default",
  homeSortDirection: HOME_SORT_NATURAL_DIRECTION.default,
  costVisibility: "public",
  showCostSummary: true,
  showCostSummaryFloatingButton: true,
  showOverviewOnline: true,
  showOverviewBandwidth: true,
  showOverviewTraffic: true,
  showOverviewAsset: true,
  showOverviewMemory: false,
  showOverviewDisk: false,
  showOverviewRatings: true,
  showTrafficRating: true,
  showBandwidthRating: true,
  showAssetRating: true,
  trafficRatingLabels: "",
  bandwidthRatingLabels: "",
  assetRatingLabels: "",
  compactShowTrafficTotal: true,
  compactShowBilling: true,
  compactShowUptime: true,
  showIpStackBadges: true,
  showConnections: false,
  showTodayTrafficPopover: true,
  hiddenNodes: [],
  costIgnoredNodes: [],
  costPremiums: {},
  costRateApiUrl: DEFAULT_COST_RATE_API_URL,
  enableBackgroundImage: true,
  backgroundMediaType: "image",
  backgroundImage: "",
  backgroundImageMobile: "",
  backgroundVideo: DEFAULT_BACKGROUND_VIDEO_URL,
  backgroundVideoDark: "",
  backgroundAlignment: DEFAULT_BACKGROUND_ALIGNMENT,
  surfaceOpacity: DEFAULT_SURFACE_OPACITY,
  enableAmbientEffect: false,
  ambientEffect: "sakura",
};

export function isAppearance(value: unknown): value is Appearance {
  return value === "system" || value === "light" || value === "dark";
}

function normalizeAppearance(
  value: unknown,
  fallback: Appearance = DEFAULT_THEME_SETTINGS.defaultAppearance,
): Appearance {
  return isAppearance(value) ? value : fallback;
}

export function isNodeViewMode(value: unknown): value is NodeViewMode {
  return value === "large" || value === "compact" || value === "mini" || value === "list";
}

function normalizeNodeViewMode(
  value: unknown,
  fallback: NodeViewMode,
): NodeViewMode {
  if (isNodeViewMode(value)) return value;
  // 未知旧字符串统一落到小卡，避免升级后出现无选中项。
  return typeof value === "string" && value.length > 0 ? "compact" : fallback;
}

// 列表档仅桌面可用(见 useViewMode 的 MOBILE_VIEW_MODES)。移动端即便配置里存了 "list"
// (历史值/外部写入)也归一化回默认档,避免管理页无选中项、首页又强制回落 compact 的不一致。
function normalizeMobileNodeViewMode(
  value: unknown,
  fallback: NodeViewMode,
): NodeViewMode {
  const mode = normalizeNodeViewMode(value, fallback);
  return mode === "list" ? fallback : mode;
}

function enabledUnlessFalse(value: unknown) {
  return value !== false;
}

export function normalizeHomeHeaderVisibleSeconds(value: unknown) {
  const seconds =
    typeof value === "number"
      ? value
      : typeof value === "string"
        ? Number.parseFloat(value)
        : Number.NaN;
  if (!Number.isFinite(seconds)) return DEFAULT_THEME_SETTINGS.homeHeaderVisibleSeconds;
  return Math.min(3600, Math.max(1, Math.round(seconds)));
}

export function shouldShowAdminEntry(
  settings: Pick<
    ResolvedThemeSettings,
    "enableAdminButton" | "hideAdminEntryWhenLoggedOut"
  >,
  loggedIn: boolean,
) {
  // enableAdminButton 是旧版隐藏字段，继续保留其全局禁用语义；新设置只对未登录访客生效。
  return (
    settings.enableAdminButton &&
    (loggedIn || !settings.hideAdminEntryWhenLoggedOut)
  );
}

/** 价格数字是否显示。hidden 档对所有人（含管理员）都为 false。 */
export function canViewCosts(
  settings: Pick<ResolvedThemeSettings, "costVisibility">,
  loggedIn: boolean,
) {
  if (settings.costVisibility === "hidden") return false;
  return loggedIn || settings.costVisibility === "public";
}

/**
 * 是否允许打开资产明细（资产页与其入口）。hidden 档只藏前台价格，
 * 登录管理员仍需要一个自查入口，所以这里按登录状态放行。
 */
export function canViewCostDetails(
  settings: Pick<ResolvedThemeSettings, "costVisibility">,
  loggedIn: boolean,
) {
  if (settings.costVisibility === "hidden") return loggedIn;
  return canViewCosts(settings, loggedIn);
}

function normalizePlainText(value: unknown) {
  return typeof value === "string" ? value : "";
}

function normalizeBackgroundMediaType(value: unknown): BackgroundMediaType {
  return value === "video" ? "video" : "image";
}

export function isAmbientEffect(value: unknown): value is AmbientEffect {
  return typeof value === "string" && AMBIENT_EFFECTS.includes(value as AmbientEffect);
}

function normalizeAmbientEffect(value: unknown): AmbientEffect {
  return isAmbientEffect(value) ? value : DEFAULT_THEME_SETTINGS.ambientEffect;
}

// 管理员默认排序:字段非法回落 default;方向非法时回落该字段的自然方向(文本升、数值降)。
function normalizeHomeSortDefault(
  field: unknown,
  direction: unknown,
): { homeSortField: HomeSortField; homeSortDirection: HomeSortDirection } {
  const homeSortField = isHomeSortField(field) ? field : "default";
  return {
    homeSortField,
    homeSortDirection: isHomeSortDirection(direction)
      ? direction
      : HOME_SORT_NATURAL_DIRECTION[homeSortField],
  };
}

export function isCostVisibility(value: unknown): value is CostVisibility {
  return (
    typeof value === "string" &&
    COST_VISIBILITY_VALUES.includes(value as CostVisibility)
  );
}

// 三档新字段优先;否则按旧开关迁移:showCostsToGuests 决定 public/member,
// 再旧的两个开关任一关闭也视为仅登录可见。旧配置里不存在「对所有人隐藏」,不会迁出 hidden。
function normalizeCostVisibility(
  settings: (ThemeSettings & Record<string, unknown>) | null | undefined,
): CostVisibility {
  if (isCostVisibility(settings?.costVisibility)) return settings.costVisibility;
  const guestsAllowed =
    typeof settings?.showCostsToGuests === "boolean"
      ? settings.showCostsToGuests
      : enabledUnlessFalse(settings?.allowGuestCostSummary) &&
        enabledUnlessFalse(settings?.showNodePrice);
  return guestsAllowed ? "public" : "member";
}

export function normalizeThemeSettings(
  settings: (ThemeSettings & Record<string, unknown>) | null | undefined,
): ResolvedThemeSettings {
  const homepageMultiPingTaskIds = normalizeHomepageMultiPingTaskIds(
    settings?.homepageMultiPingTaskIds,
  );
  return {
    defaultAppearance: normalizeAppearance(settings?.defaultAppearance),
    desktopNodeViewMode: normalizeNodeViewMode(
      settings?.desktopNodeViewMode,
      DEFAULT_THEME_SETTINGS.desktopNodeViewMode,
    ),
    mobileNodeViewMode: normalizeMobileNodeViewMode(
      settings?.mobileNodeViewMode,
      DEFAULT_THEME_SETTINGS.mobileNodeViewMode,
    ),
    enableAdminButton: enabledUnlessFalse(settings?.enableAdminButton),
    hideAdminEntryWhenLoggedOut:
      settings?.hideAdminEntryWhenLoggedOut === true,
    visitorInfoCardEnabled: enabledUnlessFalse(settings?.visitorInfoCardEnabled),
    showPingChart: enabledUnlessFalse(settings?.showPingChart),
    homepagePingBindings: normalizeHomepagePingTaskBindings(settings?.homepagePingBindings),
    // 保留开关原值，让管理页能呈现并修复不完整配置；首页消费方仅在任务恰好为三项时启用。
    enableHomepageMultiPing: settings?.enableHomepageMultiPing === true,
    homepageMultiPingTaskIds,
    homepageMultiPingNodeTaskIds: normalizeHomepageMultiPingNodeTaskIds(
      settings?.homepageMultiPingNodeTaskIds,
    ),
    // 默认关闭(需手动开启):给访客展示的是模拟数据,必须由站长显式决定。
    fakePingForUnbound: settings?.fakePingForUnbound === true,
    enableHomeHeaderAutoHide: settings?.enableHomeHeaderAutoHide === true,
    homeHeaderVisibleSeconds: normalizeHomeHeaderVisibleSeconds(
      settings?.homeHeaderVisibleSeconds,
    ),
    showHomeOverview: enabledUnlessFalse(settings?.showHomeOverview),
    showGroupTabs: enabledUnlessFalse(settings?.showGroupTabs),
    showRegionBar: enabledUnlessFalse(settings?.showRegionBar),
    showCardGroup: enabledUnlessFalse(settings?.showCardGroup),
    homeGroupOrder: normalizeHomeGroupOrder(settings?.homeGroupOrder),
    enableHomeSort: enabledUnlessFalse(settings?.enableHomeSort),
    ...normalizeHomeSortDefault(settings?.homeSortField, settings?.homeSortDirection),
    costVisibility: normalizeCostVisibility(settings),
    showCostSummary: enabledUnlessFalse(settings?.showCostSummary),
    showCostSummaryFloatingButton: enabledUnlessFalse(settings?.showCostSummaryFloatingButton),
    showOverviewOnline: enabledUnlessFalse(settings?.showOverviewOnline),
    showOverviewBandwidth: enabledUnlessFalse(settings?.showOverviewBandwidth),
    showOverviewTraffic: enabledUnlessFalse(settings?.showOverviewTraffic),
    showOverviewAsset: enabledUnlessFalse(settings?.showOverviewAsset),
    showOverviewMemory: settings?.showOverviewMemory === true,
    showOverviewDisk: settings?.showOverviewDisk === true,
    showOverviewRatings: enabledUnlessFalse(settings?.showOverviewRatings),
    showTrafficRating: enabledUnlessFalse(settings?.showTrafficRating),
    showBandwidthRating: enabledUnlessFalse(settings?.showBandwidthRating),
    showAssetRating: enabledUnlessFalse(settings?.showAssetRating),
    trafficRatingLabels: normalizePlainText(settings?.trafficRatingLabels),
    bandwidthRatingLabels: normalizePlainText(settings?.bandwidthRatingLabels),
    assetRatingLabels: normalizePlainText(settings?.assetRatingLabels),
    compactShowTrafficTotal: enabledUnlessFalse(settings?.compactShowTrafficTotal),
    compactShowBilling: enabledUnlessFalse(settings?.compactShowBilling),
    compactShowUptime: enabledUnlessFalse(settings?.compactShowUptime),
    showIpStackBadges: enabledUnlessFalse(settings?.showIpStackBadges),
    // 默认关闭(需手动开启):连接数是个小众指标,很多 agent 也不上报,所以只在显式启用时才显示。
    showConnections: settings?.showConnections === true,
    showTodayTrafficPopover: enabledUnlessFalse(settings?.showTodayTrafficPopover),
    hiddenNodes: normalizeNodeIdentityList(settings?.hiddenNodes),
    costIgnoredNodes: normalizeCostIgnoredNodes(settings?.costIgnoredNodes),
    costPremiums: normalizeCostPremiums(settings?.costPremiums),
    costRateApiUrl: normalizeCostRateApiUrl(settings?.costRateApiUrl),
    // 默认开:让已配置背景图的存量站点升级后行为不变;关闭 = 保留 URL 但不加载背景图。
    enableBackgroundImage: enabledUnlessFalse(settings?.enableBackgroundImage),
    backgroundMediaType: normalizeBackgroundMediaType(settings?.backgroundMediaType),
    backgroundImage: normalizeBackgroundUrl(settings?.backgroundImage),
    backgroundImageMobile: normalizeBackgroundUrl(settings?.backgroundImageMobile),
    backgroundVideo:
      normalizeBackgroundVideoUrl(settings?.backgroundVideo) || DEFAULT_BACKGROUND_VIDEO_URL,
    backgroundVideoDark: normalizeBackgroundVideoUrl(settings?.backgroundVideoDark),
    backgroundAlignment: normalizeBackgroundAlignment(settings?.backgroundAlignment),
    surfaceOpacity: normalizeSurfaceOpacity(settings?.surfaceOpacity),
    // 环境动效默认关闭；保存的预设仍会保留，方便站长关闭后再次开启。
    enableAmbientEffect: settings?.enableAmbientEffect === true,
    ambientEffect: normalizeAmbientEffect(settings?.ambientEffect),
  };
}
