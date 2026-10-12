import { describe, expect, it } from "vitest";
import { getAssetExpiry } from "@/utils/assetExpiry";

const NOW = Date.parse("2026-10-12T00:00:00Z");
const DAY = 86_400_000;
const after = (days: number) => new Date(NOW + days * DAY).toISOString();

describe("资产页到期状态", () => {
  it("30 天内计数与筛选沿用剩余天数，排除已过期节点", () => {
    expect(getAssetExpiry(after(31), 365, NOW).expiringSoon).toBe(false);
    expect(getAssetExpiry(after(30), 365, NOW).expiringSoon).toBe(true);
    expect(getAssetExpiry(after(0), 30, NOW)).toMatchObject({ expiringSoon: true, expired: false, label: "今日到期" });
    expect(getAssetExpiry(after(-0.01), 30, NOW)).toMatchObject({ expiringSoon: false, expired: true, tone: "critical", progress: 0 });
  });

  it("进度按实际剩余时间计算，并限制在一个周期内", () => {
    expect(getAssetExpiry(after(15), 30, NOW).progress).toBe(50);
    expect(getAssetExpiry(after(60), 30, NOW).progress).toBe(100);
    expect(getAssetExpiry(after(-1), 30, NOW).progress).toBe(0);
    expect(getAssetExpiry(after(0.5), 30, NOW)).toMatchObject({ days: 0, label: "今日到期" });
    expect(getAssetExpiry(after(0.5), 30, NOW).progress).toBeGreaterThan(0);
  });

  it.each(["", "0", "-1", "0001-01-01T00:00:00Z", "无效日期"])("缺失或无效日期 %s 不伪造进度", (date) => {
    expect(getAssetExpiry(date, 30, NOW)).toMatchObject({ days: null, progress: null, expired: false, expiringSoon: false, label: "到期未设置" });
  });

  it("长期节点和非周期账单不展示剩余比例", () => {
    expect(getAssetExpiry(after(36501), 365, NOW)).toMatchObject({ longTerm: true, label: "长期", progress: null });
    for (const cycle of [-1, 0, Infinity, NaN]) {
      expect(getAssetExpiry(after(15), cycle, NOW)).toMatchObject({ progress: null, days: 15, expiringSoon: true });
    }
  });

  it("同一到期时间随着时钟推进更新标签、计数和进度", () => {
    const expiry = after(31);
    expect(getAssetExpiry(expiry, 30, NOW).expiringSoon).toBe(false);
    expect(getAssetExpiry(expiry, 30, NOW + DAY)).toMatchObject({ days: 30, expiringSoon: true, progress: 100 });
    expect(getAssetExpiry(expiry, 30, NOW + 32 * DAY)).toMatchObject({ expired: true, expiringSoon: false, progress: 0 });
  });
});
