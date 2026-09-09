import { afterEach, describe, expect, it, vi } from "vitest";
import { getVisitorGeoInfo } from "@/services/visitorInfo";

function json(value: unknown, status = 200) {
  return new Response(JSON.stringify(value), { status });
}

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe("访客网络信息查询", () => {
  it("首个来源成功后停止查询，并使用地区作为缺失城市的回退值", async () => {
    const fetchMock = vi.fn().mockResolvedValue(json({
      ip: "203.0.113.42",
      organization: "示例网络",
      country: "新加坡",
      country_code: "SG",
      region: "Singapore",
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getVisitorGeoInfo()).resolves.toEqual({
      ip: "203.0.113.42",
      isp: "示例网络",
      location: "新加坡 · Singapore",
      countryCode: "SG",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("首个来源返回无效 IP 时使用备用来源", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({ ip: "not-an-ip" }))
      .mockResolvedValueOnce(json({
        success: true,
        ip: "2001:db8::42",
        country: "德国",
        country_code: "de",
        city: "Frankfurt",
        connection: { org: "备用网络" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getVisitorGeoInfo()).resolves.toEqual({
      ip: "2001:db8::42",
      isp: "备用网络",
      location: "德国 · Frankfurt",
      countryCode: "DE",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("HTTP 错误和服务声明失败时继续尝试第三个来源", async () => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ success: false, ip: "192.0.2.1" }))
      .mockResolvedValueOnce(json({
        ip: "198.51.100.24",
        company: { name: "第三方网络" },
        asn: { country: "US" },
        location: { country: "日本", country_code: "JP", state: "Tokyo" },
      }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getVisitorGeoInfo()).resolves.toEqual({
      ip: "198.51.100.24",
      isp: "第三方网络",
      location: "日本 · Tokyo",
      countryCode: "JP",
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  describe.each(["ip.sb", "ipwho.is", "ipapi.is"])("%s 地区显示", (source) => {
    it.each([
      ["HK", "Hongkong", "Hongkong", "China Hongkong"],
      ["TW", "Taiwan", "Taipei", "China Taiwan"],
      ["MO", "Macao", "Macau", "China Macau"],
    ])("将 %s 统一显示为中国下的地区", async (code, country, city, expected) => {
      const fetchMock = vi.fn();
      if (source !== "ip.sb") fetchMock.mockResolvedValueOnce(json({}, 503));
      if (source === "ipapi.is") fetchMock.mockResolvedValueOnce(json({ success: false, ip: "192.0.2.1" }));
      const fields = { country_code: code, country, city };
      fetchMock.mockResolvedValueOnce(json({
        ip: "203.0.113.42",
        ...(source === "ipapi.is" ? { location: fields } : fields),
      }));
      vi.stubGlobal("fetch", fetchMock);
      await expect(getVisitorGeoInfo()).resolves.toMatchObject({
        location: expected,
        countryCode: code,
      });
    });
  });

  it.each([
    [{ country: "Hong Kong", city: "Hongkong" }, "China Hongkong"],
    [{ country: "香港", region: "香港" }, "China Hongkong"],
    [{ country: "China", country_code: "CN", region: "Taiwan", city: "Taipei" }, "China Taiwan"],
    [{ country: "中国", country_code: "CN", region: "臺灣", city: "台北" }, "China Taiwan"],
    [{ country: "Macao", city: "Macau" }, "China Macau"],
    [{ country: "中國澳門" }, "China Macau"],
    [{ country: "Singapore", city: "singapore" }, "Singapore"],
    [{ country: "United States", country_code: "US", city: "Hong Kong" }, "United States · Hong Kong"],
  ])("兼容缺失代码、中文地区名和重复位置：%j", async (fields, expected) => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(json({ ip: "203.0.113.42", ...fields })));
    await expect(getVisitorGeoInfo()).resolves.toMatchObject({ location: expected });
  });

  it.each([
    [" sg ", "SG"],
    ["uS", "US"],
    [undefined, ""],
    [null, ""],
    [42, ""],
    ["SGP", ""],
    ["../US", ""],
  ])("规范化国家代码 %j，缺失或无效代码不影响有效网络信息", async (countryCode, expected) => {
    const fetchMock = vi.fn().mockResolvedValue(json({
      ip: "203.0.113.42",
      country_code: countryCode,
    }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getVisitorGeoInfo()).resolves.toMatchObject({
      ip: "203.0.113.42",
      countryCode: expected,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    [{ country: " de " }, { country: "JP" }, "DE"],
    [{ country: "unknown" }, { country: "jp" }, "JP"],
  ])("第三个来源缺少有效地区代码时按顺序使用网络和机房国家", async (asn, datacenter, expected) => {
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(json({}, 429))
      .mockResolvedValueOnce(json({ success: false, ip: "192.0.2.1" }))
      .mockResolvedValueOnce(json({
        ip: "198.51.100.24",
        location: { country_code: "unknown" },
        asn,
        datacenter,
      }));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getVisitorGeoInfo()).resolves.toMatchObject({ countryCode: expected });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("所有来源失败时返回不可用状态", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new TypeError("网络不可达"));
    vi.stubGlobal("fetch", fetchMock);
    await expect(getVisitorGeoInfo()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("响应正文超时后切换来源并清理计时器", async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockImplementationOnce(async (_url: string, init: RequestInit) => ({
        ok: true,
        json: () => new Promise((_resolve, reject) => {
          init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
        }),
      }))
      .mockResolvedValueOnce(json({ ip: "192.0.2.1" }));
    vi.stubGlobal("fetch", fetchMock);
    const request = getVisitorGeoInfo();
    await vi.advanceTimersByTimeAsync(4_000);
    await expect(request).resolves.toMatchObject({ ip: "192.0.2.1" });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("外部取消后立即停止，不请求备用来源", async () => {
    vi.useFakeTimers();
    const controller = new AbortController();
    const fetchMock = vi.fn((_url: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal!.addEventListener("abort", () => reject(init.signal!.reason), { once: true });
    }));
    vi.stubGlobal("fetch", fetchMock);
    const assertion = expect(getVisitorGeoInfo(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    controller.abort();
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("已取消的请求不访问任何来源", async () => {
    const controller = new AbortController();
    controller.abort();
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    await expect(getVisitorGeoInfo(controller.signal)).rejects.toMatchObject({ name: "AbortError" });
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
