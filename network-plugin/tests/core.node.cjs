const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.cjs");
const { parseTask } = require("../ping-targets.cjs");
const { testConfig } = require("./fixtures.cjs");

function hop(ttl, asn, ip = `203.0.113.${ttl}`) {
  return { Success: true, Address: { IP: ip, Zone: "" }, TTL: ttl, RTT: 12000000, Geo: { asnumber: asn, owner: "测试网络" } };
}

test("使用主页探测点的端口和 IP，检测间隔仍可设置", () => {
  const config = core.normalizeConfig({ interval_minutes: 27 });
  const target = parseTask({ type: "tcp", target: "[2001:db8::1]:443" });
  assert.equal(config.interval_minutes, 27);
  assert.equal(target.host, "2001:db8::1");
  assert.match(core.traceCommand(config, target), /'-T' '-p' '443' '-6'/);
  assert.match(core.traceCommand(config, target), /^LC_ALL=C timeout -k 5s 90s /);
});

test("拒绝命令注入和不合法端口，旧自定义目标不再生效", () => {
  for (const address of ["example.com;id", "$(id):80", "--help", "a:0", "a:65536", "a:80/path", "a:80\nwhoami"]) {
    assert.throws(() => core.parseAddress(address));
  }
  assert.throws(() => core.normalizeConfig({ nexttrace_path: "/bin/nexttrace;id" }));
  assert.deepEqual(core.normalizeConfig({ targets: "旧自定义配置" }).targets, []);
  assert.throws(() => core.normalizeConfig({ interval_minutes: 0 }));
});

test("按 TQ 规则返回 CN2GIA，同时保留旧主题兼容标签", () => {
  const raw = { Hops: [[hop(1, "64500")], [hop(2, "4809")], [hop(3, "AS4134")]], StopReason: { reason: "destination_reached" } };
  const result = core.parseTrace("版本提示\n" + JSON.stringify(raw), 0, "ct");
  assert.equal(result.reached, true);
  assert.equal(result.status, "ok");
  assert.deepEqual(result.networks, [{ asn: "AS4809", name: "CN2" }]);
  assert.equal(result.hops[0].rtt_ms, 12);
  assert.equal(result.route_label, "CN2GIA");
});

test("旧主题兼容标签继续保留原有选择方式", () => {
  const trace = (...asns) => JSON.stringify({ Hops: asns.map((asn, index) => [hop(index + 1, asn)]), StopReason: { reason: "destination_reached" } });
  assert.deepEqual(core.parseTrace(trace("58807", "9808"), 0, "cm").networks, [{ asn: "AS58807", name: "CMIN2" }]);
  assert.deepEqual(core.parseTrace(trace("10099", "9929", "4837"), 0, "cu").networks, [{ asn: "AS9929", name: "9929" }]);
  assert.deepEqual(core.parseTrace(trace("10099", "9929", "4134"), 0, "ct").networks, [{ asn: "AS4134", name: "163" }]);
});

test("未响应的中间跳点不影响已到达目标的判定，缺 ASN 时才用明确前缀兜底", () => {
  const raw = { Hops: [[hop(1, "9929", "210.14.1.1")], [{ Success: false, TTL: 2 }], [hop(3, null, "202.97.1.1")]], StopReason: { reason: "destination_reached" } };
  const result = core.parseTrace(JSON.stringify(raw), 0, "ct");
  assert.equal(result.status, "ok");
  assert.deepEqual(result.networks, [{ asn: "AS4134", name: "163" }]);
  raw.Hops[2] = [hop(3, "64500", "202.97.1.1")];
  assert.deepEqual(core.parseTrace(JSON.stringify(raw), 0, "ct").networks, [{ asn: "AS9929", name: "9929" }]);
});

test("未响应、未到达和非零退出保留部分路径，不伪装成功", () => {
  const raw = { Hops: [[hop(1, "58807")], [{ Success: false, TTL: 2 }]], StopReason: { reason: "max_hops" } };
  const result = core.parseTrace(JSON.stringify(raw), 0);
  assert.equal(result.status, "partial"); assert.equal(result.reached, false);
  assert.equal(result.hops[1].ip, null);
  assert.equal(result.networks[0].name, "CMIN2");
  assert.equal(core.parseTrace(JSON.stringify({ Hops: [[hop(1, "9929")]] }), 124).status, "partial");
  assert.throws(() => core.parseTrace("nexttrace: command not found", 127));
});

test("IP 配置只接受当前来源，回程与 IP 配置独立校验", () => {
  assert.equal(core.normalizeIPConfig({ targets: "无效回程", nexttrace_path: ";id" }).ip_source, "ipinfo");
  assert.equal(core.normalizeRouteConfig({ ip_source: "无效来源", ip_interval_hours: -1 }).enabled, true);
  assert.throws(() => core.normalizeIPConfig({ ip_source: "ipapi" }));
  assert.throws(() => core.normalizeIPConfig({ ip_interval_hours: 0 }));
  const config = core.normalizeConfig({ guest_visible: true, show_asn: false, show_organization: true, show_ip_type: false });
  assert.equal(config.ip_guest_visible, false);
  assert.equal(config.show_asn, false);
  assert.equal(config.show_organization, true);
  assert.equal(config.show_ip_type, false);
});

test("游客开关在后台生效，隐藏节点、节点 IP 和详细跳点不对游客返回", () => {
  const nodes = [{ uuid: "visible", ipv4: "203.0.113.1" }, { uuid: "hidden", hidden: true, ipv4: "203.0.113.2" }];
  const config = testConfig();
  const state = { jobs: [], nodes: { visible: { ips: [{ address: "203.0.113.1", family: 4, provider: "ipinfo", asn: "AS7018", checked_at: "2026-01-01T00:00:00Z" }], routes: [{ key: config.targets[0].key, checked_at: "2026-01-01T00:00:00Z", status: "ok", networks: [], asns: [], hops: [hop(1, "4809")] }] } } };
  assert.equal(core.visibleData(nodes, state, config, false, Date.now()).available, false);
  const guest = core.visibleData(nodes, state, { ...config, guest_visible: true, ip_guest_visible: true }, false, Date.now());
  assert.equal(guest.nodes.length, 1);
  assert.equal(guest.nodes[0].ips[0].address, undefined);
  assert.equal(guest.nodes[0].routes[0].hops, undefined);
  assert.equal(guest.nodes[0].routes[0].stale, true);
  const admin = core.visibleData(nodes, state, config, true, Date.now());
  assert.equal(admin.nodes.length, 2); assert.equal(admin.nodes[0].ips[0].address, "203.0.113.1");
});

test("地址或目标改变后不会沿用不相关的旧结果", () => {
  const config = testConfig();
  const state = { jobs: [], nodes: { a: { ips: [{ address: "203.0.113.1" }], routes: [{ key: "old-target" }] } } };
  const result = core.visibleData([{ uuid: "a", ipv4: "203.0.113.9" }], state, config, true, Date.now());
  assert.equal(result.nodes[0].ips.length, 0);
  assert.ok(result.nodes[0].routes.every((route) => route.status === "pending"));
});

test("IP 标签覆盖全部节点，不受回程选择和展示开关影响", () => {
  const nodes = [{ uuid: "a", ipv4: "203.0.113.1" }, { uuid: "b", ipv4: "203.0.113.2" }];
  const state = { jobs: [], nodes: Object.fromEntries(nodes.map((node) => [node.uuid, { ips: [{ address: node.ipv4, family: 4, provider: "ipinfo", checked_at: new Date().toISOString() }] }])) };
  const config = core.normalizeConfig({ all_nodes: false, nodes: ["a"], show_home: false, show_details: false, ip_guest_visible: true });
  const result = core.visibleData(nodes, state, config, true, Date.now());
  assert.equal(result.nodes.length, 2);
  assert.equal(result.nodes[1].ips.length, 1);
  assert.equal(result.nodes[1].routes.length, 0);
  assert.equal(result.show_home, false);
  assert.equal(result.show_asn, true);
  const guest = core.visibleData(nodes, state, config, false, Date.now());
  assert.equal(guest.nodes[0].ips.length, 1);
  assert.equal(guest.nodes[0].routes.length, 0);
  assert.equal(guest.show_home, false);
  const routesOnly = core.visibleData(nodes, state, { ...config, ip_guest_visible: false, guest_visible: true }, false, Date.now());
  assert.equal(routesOnly.nodes[0].ips.length, 0);
  assert.equal(routesOnly.show_asn, false);
});

test("旧来源缓存不冒充 IPinfo，显示开关不删除后台已保存数据", () => {
  const config = core.normalizeConfig({ show_asn: false, show_organization: false, show_ip_type: false });
  const state = { jobs: [], nodes: { a: { ips: [{ address: "203.0.113.1", family: 4, source: "ipapi.is", asn: "AS64500" }] } } };
  const result = core.visibleData([{ uuid: "a", ipv4: "203.0.113.1" }], state, config, true, Date.now());
  assert.equal(result.nodes[0].ips.length, 0);
  assert.equal(state.nodes.a.ips[0].asn, "AS64500");
  assert.equal(result.show_asn, false);
  assert.equal(result.show_organization, false);
  assert.equal(result.show_ip_type, false);
});
