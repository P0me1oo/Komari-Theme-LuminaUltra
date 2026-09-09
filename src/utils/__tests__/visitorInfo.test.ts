import { describe, expect, it } from "vitest";
import { detectVisitorClient, maskVisitorIp } from "@/utils/visitorInfo";

describe("访客 IP 折叠显示", () => {
  it.each([
    ["203.0.113.42", "203.0.***.42"],
    ["192.0.2.1", "192.0.*.1"],
    ["2001:db8::1234:5678", "2001:db8::*"],
    ["2001:db8:85a3:0:0:8a2e:370:7334", "2001:db8:85a3:0:*"],
    ["::1", "::*"],
    ["获取中", "获取中"],
    ["暂无法获取", "暂无法获取"],
  ])("将 %s 显示为 %s", (source, expected) => {
    expect(maskVisitorIp(source)).toBe(expected);
  });
});

describe("访客设备与浏览器识别", () => {
  it.each([
    ["Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130.0 Safari/537.36 Edg/130.0", 0, "Windows 电脑", "Edge"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 CriOS/130.0 Mobile/15E148 Safari/604.1", 5, "iPhone", "Chrome"],
    ["Mozilla/5.0 (iPhone; CPU iPhone OS 18_0) AppleWebKit/605.1.15 FxiOS/130.0 Mobile/15E148 Safari/604.1", 5, "iPhone", "Firefox"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15", 5, "iPad", "Safari"],
    ["Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) Version/18.0 Safari/605.1.15", 0, "Mac 电脑", "Safari"],
    ["Mozilla/5.0 (Linux; Android 14; Pixel) Chrome/130.0 Mobile Safari/537.36", 5, "Android 手机", "Chrome"],
    ["Mozilla/5.0 (Linux; Android 14; Tablet) Chrome/130.0 Safari/537.36", 5, "Android 平板", "Chrome"],
    ["", 0, "未知设备", "未知浏览器"],
  ])("识别设备和浏览器：%s", (ua, touchPoints, device, browser) => {
    expect(detectVisitorClient(ua, touchPoints)).toEqual({ device, browser });
  });
});
