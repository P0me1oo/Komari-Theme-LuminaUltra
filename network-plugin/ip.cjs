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
  if (source === "ipregistry") return "https://api.ipregistry.co/" + encodeURIComponent(address);
  if (source !== SOURCE) throw new Error("请选择有效的 IP 数据来源");
  return "https://ipinfo.io/widget/demo/" + encodeURIComponent(address);
}

function sourceName(source) {
  return source === "ipregistry" ? "IPregistry" : "IPinfo";
}

function apiKey(value) {
  const key = text(value);
  if (!key) throw new Error("请填写 IPregistry API 密钥");
  if (/\s|[^\x21-\x7e]/.test(key)) throw new Error("IPregistry API 密钥格式无效");
  return key;
}

function queryHeaders(source, key) {
  return source === "ipregistry" ? { Authorization: "ApiKey " + apiKey(key) } : {};
}

function parseIPregistry(data) {
  if (!data || typeof data !== "object" || data.code || data.error) {
    throw new Error("IPregistry 未返回有效的 IP 信息");
  }
  const connection = data.connection || {};
  const company = data.company || {};
  const asn = normalizeASN(connection.asn);
  const organization = text(connection.organization) || text(company.name);
  // 优先使用网络类型，缺失时才参考公司类型；不以机构名称或安全标签推断。
  const kind = (text(connection.type) || text(company.type)).toLowerCase();
  const labels = { isp: "家宽", hosting: "机房", business: "商业", education: "教育", government: "政府", inactive: "未活跃网络" };
  const type = Object.prototype.hasOwnProperty.call(labels, kind) ? labels[kind] : kind ? "其他" : "未知";
  if (!asn && !organization && type === "未知") throw new Error("IPregistry 未返回可用的 ASN、机构或类型");
  return { asn, organization: (organization || "未知").slice(0, 160), type, source: "IPregistry", provider: "ipregistry" };
}

function httpError(source, status) {
  const hints = { 401: "请检查 API 密钥", 402: "查询额度不足", 403: "请检查 API 密钥及访问限制", 429: "请求过于频繁", 451: "API 密钥已停用" };
  const hint = source === "ipregistry" && hints[status];
  return sourceName(source) + " 查询失败（HTTP " + status + "）" + (hint ? "：" + hint : "");
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

module.exports = { SOURCE, queryURL, queryHeaders, sourceName, apiKey, httpError, parseIPInfo, parseIPregistry };
