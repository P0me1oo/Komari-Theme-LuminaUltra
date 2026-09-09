import { z } from "zod";
import { withTimeoutSignal } from "@/utils/abort";

export interface VisitorGeoInfo {
  ip: string;
  isp: string;
  location: string;
}

const textField = z.string().trim().catch("");
const ipField = z.string().trim().ip();
const geoFields = {
  country: textField,
  region: textField,
  city: textField,
};

const ipSbSchema = z.object({
  ip: ipField,
  ...geoFields,
  isp: textField,
  organization: textField,
  asn_organization: textField,
});

const ipWhoSchema = z.object({
  ip: ipField,
  ...geoFields,
  success: z.boolean().optional(),
  connection: z.object({ isp: textField, org: textField }).optional().catch(undefined),
}).refine((data) => data.success !== false);

const ipApiSchema = z.object({
  ip: ipField,
  company: z.object({ name: textField }).optional().catch(undefined),
  asn: z.object({ org: textField, descr: textField }).optional().catch(undefined),
  location: z.object({
    country: textField,
    state: textField,
    city: textField,
  }).optional().catch(undefined),
});

function geoInfo(ip: string, isp: string, country = "", city = ""): VisitorGeoInfo {
  return {
    ip,
    isp: isp || "未知运营商",
    location: [country, city].filter(Boolean).join(" · ") || "未知位置",
  };
}

// 沿用 Emerald 的公开来源；按需逐个尝试，任一成功后不再请求后续来源。
const SOURCES: Array<{ url: string; parse: (value: unknown) => VisitorGeoInfo }> = [
  {
    url: "https://api.ip.sb/geoip",
    parse(value) {
      const data = ipSbSchema.parse(value);
      return geoInfo(
        data.ip,
        data.isp || data.organization || data.asn_organization,
        data.country,
        data.city || data.region,
      );
    },
  },
  {
    url: "https://ipwho.is/",
    parse(value) {
      const data = ipWhoSchema.parse(value);
      return geoInfo(
        data.ip,
        data.connection?.isp || data.connection?.org || "",
        data.country,
        data.city || data.region,
      );
    },
  },
  {
    url: "https://api.ipapi.is/",
    parse(value) {
      const data = ipApiSchema.parse(value);
      return geoInfo(
        data.ip,
        data.asn?.org || data.company?.name || data.asn?.descr || "",
        data.location?.country,
        data.location?.city || data.location?.state,
      );
    },
  },
];

export async function getVisitorGeoInfo(signal?: AbortSignal): Promise<VisitorGeoInfo | null> {
  for (const source of SOURCES) {
    signal?.throwIfAborted();
    try {
      return await withTimeoutSignal(async (requestSignal) => {
        const response = await fetch(source.url, {
          signal: requestSignal,
          credentials: "omit",
          referrerPolicy: "no-referrer",
        });
        if (!response.ok) throw new Error(`访客信息请求失败：${response.status}`);
        // 超时覆盖响应正文的读取，避免接口已连接但一直不返回 JSON。
        return source.parse(await response.json());
      }, 4_000, signal);
    } catch {
      // 关闭卡片或离开页面时立即结束；单个来源不可用才切换到下一项。
      signal?.throwIfAborted();
    }
  }
  return null;
}
