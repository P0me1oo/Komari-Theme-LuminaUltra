const { test } = require("node:test");
const assert = require("node:assert/strict");
const { queryURL, parseIPInfo } = require("../ip.cjs");

const sample = (asnType, companyType) => ({ data: {
  ip: "203.0.113.1", asn: { asn: "AS64500", name: "测试机构", type: asnType }, company: { type: companyType },
} });

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
