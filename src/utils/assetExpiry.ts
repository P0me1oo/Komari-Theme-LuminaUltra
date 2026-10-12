import { getExpireDaysRemaining, LONG_TERM_EXPIRE_DAYS, resolveExpireTimestamp } from "@/utils/format";

/** 资产页的计数、筛选与进度共用同一时点，剩余天数沿用节点卡的向下取整规则。 */
export function getAssetExpiry(expiredAt: string, cycleDays: number, now: number) {
  const timestamp = resolveExpireTimestamp(expiredAt);
  const days = getExpireDaysRemaining(expiredAt, now);
  const longTerm = days != null && days > LONG_TERM_EXPIRE_DAYS;
  const expiringSoon = days != null && days >= 0 && days <= 30;
  const expired = days != null && days < 0;
  const label = days == null
    ? "到期未设置"
    : longTerm
      ? "长期"
      : expired
        ? `已过期 ${Math.abs(days)} 天`
        : days === 0
          ? "今日到期"
          : `剩余 ${days} 天`;
  const tone = days == null || longTerm ? "neutral" : days <= 3 ? "critical" : days <= 30 ? "warning" : "normal";
  // 永久、未知到期和非法周期不展示比例；预付超过一个周期时最多显示 100%。
  const progress = timestamp != null && days != null && !longTerm && Number.isFinite(cycleDays) && cycleDays > 0
    ? Math.min(100, Math.max(0, ((timestamp - now) / (cycleDays * 86_400_000)) * 100))
    : null;
  return { timestamp, days, longTerm, expiringSoon, expired, label, tone, progress };
}
