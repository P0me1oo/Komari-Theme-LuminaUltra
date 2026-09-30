const { test } = require("node:test");
const assert = require("node:assert/strict");
const { queryURL, queryHeaders, parseIPInfo, parseIPregistry, registryRetryAt } = require("../ip.cjs");
const { normalizeIPConfig } = require("../core.cjs");

const sample = (asnType, companyType) => ({ data: {
  ip: "203.0.113.1", asn: { asn: "AS64500", name: "测试机构", type: asnType }, company: { type: companyType },
} });

test("IPregistry 限流时间优先读取建议等待秒数，兼容日期及窗口剩余秒数", () => {
  const now = Date.parse("2026-10-01T00:00:00Z");
  const read = (values) => registryRetryAt(new Headers(values), now);
  assert.equal(read({ "Retry-After": "15", "X-Rate-Limit-Reset": "600" }), now + 15000);
  assert.equal(read({ "Retry-After": "0" }), now);
  assert.equal(read({ "Retry-After": "Thu, 01 Oct 2026 00:00:30 GMT" }), now + 30000);
  assert.equal(read({ "Retry-After": "Wed, 30 Sep 2026 23:00:00 GMT" }), now);
  assert.equal(read({ "Retry-After": "invalid", "X-Rate-Limit-Reset": "25" }), now + 25000);
  assert.equal(read({ "X-Rate-Limit-Reset": "90" }), now + 90000);
  for (const value of ["", "invalid", "-1", "Infinity", "9".repeat(100)]) {
    assert.equal(read({ "Retry-After": value }), 0);
  }
  assert.equal(read({}), 0);
  assert.equal(registryRetryAt(undefined, now), 0);
});

test("只构造所选 IPinfo 请求，不添加其他来源或凭据", () => {
  assert.equal(queryURL("ipinfo", "203.0.113.1"), "https://ipinfo.io/widget/demo/203.0.113.1");
  assert.equal(queryURL("ipinfo", "2001:db8::1"), "https://ipinfo.io/widget/demo/2001%3Adb8%3A%3A1");
  assert.throws(() => queryURL("ipapi", "203.0.113.1"));
});

test("解析 IPinfo 演示接口的 ASN、机构和机房类型", () => {
  assert.deepEqual(parseIPInfo(sample("hosting", "business")), {
    asn: "AS64500", organization: "测试机构", type: "机房", source: "IPinfo", provider: "ipinfo",
  });
});

test("类型沿用 IPQuality 的使用类型口径，商业不改成商宽", () => {
  for (const [kind, label] of Object.entries({ isp: "家宽", business: "商业", hosting: "机房", education: "教育", government: "政府", mobile: "移动网络", residential: "住宅网络", unusual: "其他" })) {
    assert.equal(parseIPInfo(sample(kind, "hosting")).type, label);
  }
  assert.equal(parseIPInfo(sample("", "hosting")).type, "机房");
  assert.equal(parseIPInfo(sample(undefined, undefined)).type, "未知");
});

test("缺少扩展类型时保留基础 ASN，不根据机构名称猜测类型", () => {
  assert.deepEqual(parseIPInfo({ data: { org: "AS64501 示例住宅运营商" } }), {
    asn: "AS64501", organization: "示例住宅运营商", type: "未知", source: "IPinfo", provider: "ipinfo",
  });
  assert.equal(parseIPInfo({ data: { company: { name: "另一机构", type: "hosting" } } }).asn, null);
});

test("拒绝空响应、错误响应和旧来源格式，不把查询失败缓存成成功", () => {
  for (const payload of [null, {}, { data: {} }, { data: "" }, { error: "quota", data: { org: "AS64500 测试机构" } }, { data: { error: true } }, { asn: "AS64500 旧来源" }]) {
    assert.throws(() => parseIPInfo(payload));
  }
});

test("IPregistry 支持双栈地址，密钥只放请求头，未填写时拒绝配置", () => {
  assert.equal(queryURL("ipregistry", "203.0.113.1"), "https://api.ipregistry.co/203.0.113.1");
  assert.equal(queryURL("ipregistry", "2001:db8::1"), "https://api.ipregistry.co/2001%3Adb8%3A%3A1");
  assert.deepEqual(queryHeaders("ipregistry", " example-key "), { Authorization: "ApiKey example-key" });
  assert.deepEqual(queryHeaders("ipinfo", "example-key"), {});
  for (const key of [undefined, "", "  ", "key\nheader", 123]) {
    assert.throws(() => normalizeIPConfig({ ip_source: "ipregistry", ipregistry_api_key: key }));
  }
  assert.equal(normalizeIPConfig({ ip_source: "ipregistry", ipregistry_api_key: " example-key " }).ipregistry_api_key, "example-key");
  assert.equal(normalizeIPConfig({}).ip_source, "ipinfo");
});

test("IPregistry 读取网络 ASN 和机构，网络类型优先于公司类型", () => {
  assert.deepEqual(parseIPregistry({ connection: { asn: 64500, organization: "测试网络", type: "hosting" }, company: { name: "测试公司", type: "isp" } }), {
    asn: "AS64500", organization: "测试网络", type: "机房", source: "IPregistry", provider: "ipregistry",
  });
  for (const [kind, label] of Object.entries({ business: "商业", education: "教育", government: "政府", hosting: "机房", isp: "家宽", inactive: "未活跃网络", unusual: "其他" })) {
    assert.equal(parseIPregistry({ connection: { type: kind } }).type, label);
  }
  assert.equal(parseIPregistry({ connection: { asn: 64500 } }).type, "未知");
  assert.equal(parseIPregistry({ connection: null, company: { name: "公司", type: "hosting" } }).type, "机房");
  for (const payload of [null, {}, { connection: null, company: null }, { code: "INVALID_API_KEY" }, { error: true }, sample("hosting", "isp")]) {
    assert.throws(() => parseIPregistry(payload));
  }
});
