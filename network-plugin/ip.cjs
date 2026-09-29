"use strict";

const SOURCE = "ipinfo";

function text(value) {
  return typeof value === "string" && value !== "null" ? value.trim() : "";
}

function normalizeASN(value) {
  const match = String(value || "").trim().match(/^(?:AS)?([1-9][0-9]*)$/i);
  return match ? "AS" + match[1] : null;
}

function queryURL(source, address) {
  if (source !== SOURCE) throw new Error("请选择 IPinfo 数据来源");
  return "https://ipinfo.io/widget/demo/" + encodeURIComponent(address);
}

function parseIPInfo(response) {
  const data = response && response.data;
  if (!data || typeof data !== "object" || response.error || data.error) {
    throw new Error("IPinfo 未返回有效的 IP 信息");
  }
  const asn = data.asn && typeof data.asn === "object" ? data.asn : {};
  const company = data.company && typeof data.company === "object" ? data.company : {};
  const org = text(data.org).match(/^(AS[1-9][0-9]*)\s+(.+)$/i);
  const number = normalizeASN(asn.asn || (org && org[1]));
  const organization = text(asn.name) || (org && text(org[2])) || text(company.name);
  // 与 IPQuality 的使用类型口径一致；缺少使用类型时才参考公司类型。
  const kind = (text(asn.type) || text(company.type)).toLowerCase();
  const labels = {
    isp: "家宽", residential: "住宅网络", hosting: "机房", business: "商业",
    education: "教育", government: "政府", mobile: "移动网络",
  };
  const type = Object.prototype.hasOwnProperty.call(labels, kind) ? labels[kind] : kind ? "其他" : "未知";
  if (!number && !organization && type === "未知") throw new Error("IPinfo 未返回可用的 ASN、机构或类型");
  return { asn: number, organization: (organization || "未知").slice(0, 160), type, source: "IPinfo", provider: SOURCE };
}

module.exports = { SOURCE, queryURL, parseIPInfo };
