import { LONG_TERM_EXPIRE_DAYS, resolveExpireTimestamp } from "@/utils/format";

export interface TrafficResetDisplay {
  label: string;
  title: string;
  day: number;
  date: string;
}

function isResetDay(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 1 && value <= 31;
}

export type TrafficResetDefault = "expiry" | "none" | number;

export function normalizeTrafficResetDefault(value: unknown): TrafficResetDefault {
  return value === "none" || isResetDay(value) ? value : "expiry";
}

export function normalizeTrafficUtcOffset(value: unknown, fallback = 8): number {
  return typeof value === "number" && Number.isFinite(value) && value >= -12 && value <= 14
    ? Math.round(value * 4) / 4 : fallback;
}

export function normalizeTrafficResetTimezones(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value)
    .filter(([uuid, offset]) => uuid.trim() !== "" && typeof offset === "number" && Number.isFinite(offset) && offset >= -12 && offset <= 14)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([uuid, offset]) => [uuid, normalizeTrafficUtcOffset(offset)]));
}

export function trafficTimezoneLabel(offset: number): string {
  const minutes = Math.round(Math.abs(offset) * 60);
  return `UTC${offset < 0 ? "−" : "+"}${Math.floor(minutes / 60)}${minutes % 60 ? `:${String(minutes % 60).padStart(2, "0")}` : ""}`;
}

export interface TrafficCycle {
  start: number;
  next: number;
  day: number;
  utcOffset: number;
}

export interface TrafficResetOptions {
  defaultDay?: TrafficResetDefault;
  utcOffset?: number;
  mode?: "agent" | "theme";
}

function resolveResetDay(
  expiredAt: string | number | null | undefined, now: number, customDay?: number,
  options: TrafficResetOptions = {},
): number | null {
  if (customDay === -1) return null;
  if (isResetDay(customDay)) return customDay;
  if (options.defaultDay === "none") return null;
  if (isResetDay(options.defaultDay)) return options.defaultDay;
  const timestamp = resolveExpireTimestamp(expiredAt);
  if (timestamp == null || (timestamp - now) / 86_400_000 > LONG_TERM_EXPIRE_DAYS) return null;
  return options.utcOffset == null ? new Date(timestamp).getDate()
    : new Date(timestamp + options.utcOffset * 3_600_000).getUTCDate();
}

/** 周期在指定时区的重置日零点切换，短月份取月末，下一月恢复原定日期。 */
export function getTrafficCycle(
  expiredAt: string | number | null | undefined, now: number, customDay?: number,
  options: TrafficResetOptions = {},
): TrafficCycle | null {
  if (!Number.isFinite(now)) return null;
  const utcOffset = normalizeTrafficUtcOffset(options.utcOffset);
  const day = resolveResetDay(expiredAt, now, customDay, { ...options, utcOffset });
  if (day == null) return null;
  const shift = utcOffset * 3_600_000;
  const date = new Date(now + shift);
  const year = date.getUTCFullYear();
  const month = date.getUTCMonth();
  const at = (monthIndex: number) => Date.UTC(year, monthIndex,
    Math.min(day, new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate())) - shift;
  return { day, utcOffset, start: now >= at(month) ? at(month) : at(month - 1),
    next: now >= at(month) ? at(month + 1) : at(month) };
}

export function normalizeTrafficResetDays(value: unknown): Record<string, number> {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  // 固定键序，避免同一份配置因编辑顺序不同被误判为未保存。
  return Object.fromEntries(
    Object.entries(value)
      .filter(([uuid, day]) => uuid.trim() !== "" && (isResetDay(day) || day === -1))
      .sort(([left], [right]) => left.localeCompare(right)),
  );
}

/** 指定时区时与统计周期一致；不传选项时兼容原来的浏览器本地日期提示。 */
export function getTrafficResetDisplay(
  expiredAt: string | number | null | undefined,
  now: number,
  customDay?: number,
  options: TrafficResetOptions = {},
): TrafficResetDisplay | null {
  if (!Number.isFinite(now)) return null;
  const custom = isResetDay(customDay);
  const day = resolveResetDay(expiredAt, now, customDay, options);
  if (day == null) return null;

  if (options.utcOffset != null) {
    const cycle = getTrafficCycle(expiredAt, now, customDay, options)!;
    const shift = cycle.utcOffset * 3_600_000;
    const today = new Date(now + shift);
    const ordinal = (value: Date) => Date.UTC(value.getUTCFullYear(), value.getUTCMonth(), value.getUTCDate());
    let next = new Date(cycle.next + shift);
    if (options.mode !== "theme" && ordinal(new Date(cycle.start + shift)) === ordinal(today)) {
      next = new Date(cycle.start + shift);
    }
    const days = (ordinal(next) - ordinal(today)) / 86_400_000;
    const date = next.toISOString().slice(0, 10);
    return { day, date, label: days === 0 ? "今日重置" : `${days}天后重置`,
      title: `流量重置日：${date} · ${trafficTimezoneLabel(cycle.utcOffset)} · ${custom ? "自定义" : options.defaultDay && options.defaultDay !== "expiry" ? "默认固定日" : "默认按到期日"}，每月${day}日零点重置（不足该日取月末）` };
  }

  const today = new Date(now);
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthlyDate = (monthIndex: number) =>
    new Date(year, monthIndex, Math.min(day, new Date(year, monthIndex + 1, 0).getDate()));
  let next = monthlyDate(month);
  // 当天整天显示“今日重置”，次日再滚动至下一月。
  if (next.getDate() < today.getDate()) next = monthlyDate(month + 1);
  // 用日历日计算，避免夏令时切换造成 23/25 小时的一天被取整错算。
  const ordinal = (date: Date) => Date.UTC(date.getFullYear(), date.getMonth(), date.getDate());
  const days = (ordinal(next) - ordinal(today)) / 86_400_000;
  const dateLabel = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, "0")}-${String(next.getDate()).padStart(2, "0")}`;
  return {
    day,
    date: dateLabel,
    label: days === 0 ? "今日重置" : `${days}天后重置`,
    title: `流量重置日：${dateLabel} · ${custom ? "自定义" : "默认按到期日"}，每月${day}日重置（不足该日取月末）`,
  };
}
