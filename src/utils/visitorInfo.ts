import { z } from "zod";

const ipSchema = z.string().ip();

/** 折叠时遮住 IPv4 最后一段或 IPv6 后半段；占位文字保持原样。 */
export function maskVisitorIp(value: string): string {
  if (!ipSchema.safeParse(value).success) return value;
  if (!value.includes(":")) {
    const segments = value.split(".");
    segments[3] = "*";
    return segments.join(".");
  }

  const prefix = value.split("::")[0].split(":").filter(Boolean).slice(0, 4).join(":");
  return value.includes("::") ? `${prefix}::*` : `${prefix}:*`;
}

export function detectVisitorClient(userAgent: string, maxTouchPoints = 0) {
  let device = "未知设备";
  if (/iPad/i.test(userAgent) || (/Macintosh/i.test(userAgent) && maxTouchPoints > 1)) {
    device = "iPad";
  } else if (/iPhone/i.test(userAgent)) {
    device = "iPhone";
  } else if (/iPod/i.test(userAgent)) {
    device = "iPod";
  } else if (/Android/i.test(userAgent)) {
    device = /Mobile/i.test(userAgent) ? "Android 手机" : "Android 平板";
  } else if (/Windows/i.test(userAgent)) {
    device = "Windows 电脑";
  } else if (/Macintosh|Mac OS X/i.test(userAgent)) {
    device = "Mac 电脑";
  } else if (/Linux/i.test(userAgent)) {
    device = "Linux 电脑";
  }

  // 先匹配基于 Chromium 或 iOS 的派生浏览器，避免一律识别成 Chrome / Safari。
  const browsers: Array<[RegExp, string]> = [
    [/MicroMessenger\//i, "微信"],
    [/Edg(?:e|A|iOS)?\//i, "Edge"],
    [/OPR\/|Opera|OPiOS\//i, "Opera"],
    [/SamsungBrowser\//i, "三星浏览器"],
    [/QQBrowser\//i, "QQ 浏览器"],
    [/Firefox\/|FxiOS\//i, "Firefox"],
    [/Chrome\/|CriOS\//i, "Chrome"],
    [/Safari\//i, "Safari"],
  ];
  const browser = browsers.find(([pattern]) => pattern.test(userAgent))?.[1] ?? "未知浏览器";
  return { device, browser };
}

export function formatVisitTime(date: Date): string {
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
}
