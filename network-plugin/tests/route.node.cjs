const { test } = require("node:test");
const assert = require("node:assert/strict");
const { classifyRoute, classifyRouteDetailed } = require("../route.cjs");
const core = require("../core.cjs");
const { testConfig } = require("./fixtures.cjs");
const { path, cases } = require("./route-cases.cjs");

for (const sample of cases) {
  test(sample.name, () => {
    const original = JSON.stringify(sample.hops);
    assert.equal(classifyRoute(sample.hops, sample.carrier), sample.expected);
    assert.equal(JSON.stringify(sample.hops), original, "不能修改保存的原始路径");
  });
}

test("路径按跳数排列，不按结果数组的偶然顺序判断", () => {
  assert.equal(classifyRoute([{ ttl: 3, ip: "203.0.113.3", asn: "AS4837" }, { ttl: 1, ip: "203.0.113.1", asn: "AS10099" }], "cu"), "10099->4837");
});

test("同一跳取首个回复，不再从后续回复拼接 ASN", () => {
  const hops = [{ ttl: 1, ip: "203.0.113.1", asn: null }, { ttl: 1, ip: "203.0.113.1", asn: "AS10099" }, { ttl: 2, ip: "203.0.113.2", asn: "AS4837" }];
  assert.equal(classifyRoute(hops, "cu"), "4837");
});

test("同一跳的不同地址只取首个有效回复，不伪造串联网络", () => {
  const hops = [
    { ttl: 1, ip: null, asn: null },
    { ttl: 1, ip: "203.0.113.1", asn: "AS10099" },
    { ttl: 1, ip: "203.0.113.2", asn: "AS9929" },
    { ttl: 2, ip: "203.0.113.3", asn: "AS4837" },
  ];
  const result = classifyRouteDetailed(hops, "cu");
  assert.equal(result.route_label, "10099->4837");
  assert.deepEqual(result.evidence.asns, ["AS10099", "AS4837"]);
  assert.equal(result.evidence.visible_hops, 2);
  assert.equal(result.evidence.hidden_hops, 0);
});

test("不同跳数的相同地址保留位置，不能删除 CN2 后的 163 转接", () => {
  const hops = path(["202.97.1.1", "AS4134"], ["59.43.1.1", "AS4809"], ["202.97.1.1", "AS4134"]);
  const result = classifyRouteDetailed(hops, "ct");
  assert.equal(result.route_label, "CN2GT");
  assert.equal(result.evidence.visible_hops, 3);
});

for (const [name, hops, expected] of [
  ["CN2 后转入 202.97，无需固定特征出口", path(["59.43.1.1", null], ["202.97.1.1", null]), "CN2GT"],
  ["CN2 的 ASN 回复也参与转接判断", path("AS4809", ["202.97.1.1", "AS4134"]), "CN2GT"],
  ["连续 CN2 和电信国际段后转入 202.97", path(["59.43.1.1", null], "AS23764", ["202.97.1.1", null]), "CN2GT"],
  ["电信国际段后转入 202.97", path("AS23764", ["202.97.1.1", null]), "CN2GT"],
  ["202.97 只出现在 CN2 前面不能倒推 GT", path(["202.97.1.1", null], ["59.43.1.1", null]), "CN2GIA"],
  ["不能越过其他网络寻找后面的 202.97", path(["59.43.1.1", null], "AS64500", ["202.97.1.1", null]), "CN2GIA"],
  ["特征出口后的电信国际段不会截断转接判断", path(["59.43.245.1", null], "AS23764", "AS4134"), "CN2GT"],
]) {
  test(name, () => assert.equal(classifyRoute(hops, "ct"), expected));
}

for (const [ip, expected] of [
  ["210.14.1.1", "210.14.0.0/16"],
  ["210.51.1.1", "210.51.0.0/16"],
  ["210.78.64.1", "210.78.0.0/16"],
  ["218.105.1.1", "218.105.0.0/16"],
  ["2408:8120::1", "2408:8120::/32"],
  ["103.214.1.1", "103.214.0.0/16"],
  ["162.219.39.1", "162.219.32.0/21"],
  ["162.219.85.1", "162.219.85.0/24"],
  ["2401:8a00::1", "2401:8a00::/32"],
  ["203.22.178.1", "203.22.178.0/24"],
  ["69.194.1.1", "69.194.0.0/16"],
  ["2400:9380::1", "2400:9380::/32"],
]) {
  test("前缀证据只列出实际命中的规则范围：" + ip, () => {
    const result = classifyRouteDetailed([{ ttl: 1, ip, asn: null }], "cu");
    assert.deepEqual(result.evidence.prefixes, [expected]);
    assert.equal(result.confidence, undefined);
  });
}

test("隐藏跳点按跳数统计，同一跳的多次未响应只算一跳", () => {
  const result = classifyRouteDetailed([
    { ttl: 1, ip: null }, { ttl: 1, ip: null },
    { ttl: 2, ip: "59.43.1.1" }, { ttl: 2, ip: null },
    { ttl: 3, ip: null },
  ], "ct");
  assert.equal(result.evidence.visible_hops, 1);
  assert.equal(result.evidence.hidden_hops, 2);
});

test("私网、无效地址和空路径不作为骨干证据", () => {
  const ips = [null, "", "10.0.0.1", "172.16.1.1", "192.168.1.1", "127.0.0.1", "100.64.0.1", "169.254.1.1", "198.18.1.1", "239.1.1.1", "59.43.999.1", "::1", "fe80::1%eth0", "fd00::1"];
  assert.equal(classifyRoute(ips.map((ip) => ({ ip, asn: "AS4809" })), "ct"), null);
  assert.equal(classifyRoute(undefined, "cu"), null);
});

test("ASN 大小写与 IPv6 大写前缀可正常识别", () => {
  assert.equal(classifyRoute([{ ip: "2001:DB8::1", asn: "as10099" }, { ip: "2408:8120::1", asn: null }], "cu"), "10099->9929");
});

test("升级后按旧缓存跳点重算，管理员与游客结论一致且不改变时间和状态", () => {
  const config = testConfig({ guest_visible: true });
  const route = { key: config.targets[0].key, status: "partial", reached: false, checked_at: "2026-01-01T00:00:00Z", networks: [{ asn: "AS4134", name: "163" }], asns: ["AS4134"], hops: path(["59.43.1.1", null], "AS4134", "AS136958") };
  const state = { jobs: [], nodes: { a: { routes: [route] } } };
  const original = JSON.stringify(state);
  const admin = core.visibleData([{ uuid: "a" }], state, config, true, Date.parse("2026-01-02T00:00:00Z")).nodes[0].routes[0];
  const guest = core.visibleData([{ uuid: "a" }], state, config, false, Date.parse("2026-01-02T00:00:00Z")).nodes[0].routes[0];
  assert.equal(admin.route_label, "CN2GIA");
  assert.equal(admin.rule_version, "2026.10.18.1");
  assert.equal(admin.confidence, undefined);
  assert.deepEqual(admin.matched_asns, ["AS4809", "AS4134", "AS136958"]);
  assert.equal(guest.confidence, undefined);
  assert.equal(guest.rule_version, undefined);
  assert.equal(guest.route_label, admin.route_label);
  assert.equal(guest.hops, undefined);
  assert.equal(admin.checked_at, route.checked_at);
  assert.equal(admin.status, "partial");
  assert.equal(admin.reached, false);
  assert.equal(admin.stale, true);
  assert.equal(JSON.stringify(state), original);
});

test("没有跳点的老记录继续兼容，不能用旧标签覆盖有跳点的新判断", () => {
  const config = testConfig();
  const route = { key: config.targets[0].key, status: "ok", reached: true, networks: [{ asn: "AS58453", name: "CMI" }], asns: [] };
  const state = { jobs: [], nodes: { a: { routes: [route] } } };
  const read = () => core.visibleData([{ uuid: "a" }], state, config, true, Date.now()).nodes[0].routes[0];
  assert.equal(read().route_label, undefined);
  assert.equal(read().networks[0].name, "CMI");
  route.hops = path("AS64500");
  assert.equal(read().route_label, null);
});

test("JSON 解析后返回新线路结论，未到达时仍保留部分路径状态", () => {
  const raw = { Hops: [[{ TTL: 1, Success: true, Address: { IP: "59.43.1.1" }, Geo: { asnumber: "" } }], [{ TTL: 2, Success: true, Address: { IP: "202.97.1.1" }, Geo: { asnumber: "4134" } }]], StopReason: { reason: "max_hops" } };
  const result = core.parseTrace(JSON.stringify(raw), 0, "cu");
  assert.equal(result.route_label, "CN2GT");
  assert.equal(result.status, "partial");
  assert.equal(result.reached, false);
});
