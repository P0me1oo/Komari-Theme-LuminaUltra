const { test } = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const fs = require("node:fs");
const path = require("node:path");
const core = require("../core.cjs");
const ipSource = require("../ip.cjs");
const pingTargets = require("../ping-targets.cjs");
const source = fs.readFileSync(path.join(__dirname, "../script.js"), "utf8");

function harness(options = {}) {
  let now = 1800000000000;
  const calls = [], routes = {}, files = {};
  const config = { ip_enabled: false, ...options.config };
  const nodes = options.nodes || [{ uuid: "a", ipv4: "203.0.113.1" }, { uuid: "b" }];
  const tasks = options.tasks || [{ id: 1, name: "广东移动", target: "example.com:80", type: "tcp", clients: nodes.map((node) => node.uuid) }];
  const site = options.site || { theme: "LuminaUltra", theme_settings: { homepagePingBindings: { 1: nodes.map((node) => node.uuid) } } };
  const results = {};
  const fakeFS = { promises: {
    readFile: async (file) => { if (!files[file]) throw Object.assign(new Error("missing"), { code: "ENOENT" }); return files[file]; },
    writeFile: async (file, value, options) => {
      assert.deepEqual({ ...options }, { encoding: "utf8", mode: 0o600 });
      files[file] = value;
    },
    rename: async (from, to) => { files[to] = files[from]; delete files[from]; },
  } };
  const server = {
    getConfig: async () => config,
    call: async (method, params) => {
      calls.push({ method, params });
      if (method === "admin:listClients") return nodes;
      if (method === "public:getPublicSettings") return site;
      if (method === "admin:getAllPingTasks") return tasks;
      if (method === "admin:exec") return { task_id: String(calls.length) };
      if (method === "admin:getTaskById") return { results: results[params.task_id] || [] };
      throw new Error(method);
    },
    route: (method, url, handler) => { routes[method + " " + url] = handler; },
    cron: () => {},
  };
  const fakeDate = class extends Date { static now() { return now; } };
  const context = vm.createContext({ require: (id) => id === "server" ? server : id === "node:fs" ? fakeFS : id === "./ip.cjs" ? ipSource : id === "./ping-targets.cjs" ? pingTargets : core,
    __storageDir__: "/store", console: { error() {} }, Date: fakeDate, setTimeout: () => 1, clearTimeout() {}, AbortController,
    fetch: options.fetch || (async () => { throw new Error("不允许真实网络请求"); }),
  });
  vm.runInContext(source, context);
  return { context, calls, config, nodes, tasks, site, results, files, routes, advance: (ms) => { now += ms; }, state: () => JSON.parse(vm.runInContext("JSON.stringify(state)", context)) };
}

test("并发限制、同节点串行、按间隔自动重新检测", async () => {
  const h = harness({ config: { concurrency: 1, interval_minutes: 5 } });
  await h.context.load(); await h.context.tick();
  assert.equal(h.state().jobs.length, 1);
  await h.context.tick(); assert.equal(h.calls.filter((call) => call.method === "admin:exec").length, 1);
  const job = h.state().jobs[0];
  h.results[job.task_id] = [{ client: "a", exit_code: 0, finished_at: "2027-01-01", result: JSON.stringify({ Hops: [[{ Success: true, Address: { IP: "203.0.113.1" }, Geo: { asnumber: "4809" } }]] }) }];
  await h.context.tick();
  assert.equal(h.state().nodes.a.routes[0].networks[0].name, "CN2");
  assert.equal(h.state().jobs[0].uuid, "b");
  h.advance(301000); await h.context.tick();
  assert.ok(h.calls.filter((call) => call.method === "admin:exec" && call.params.clients[0] === "a").length >= 2);
});

test("重新加载后继续接收已派发任务，避免重复检测", async () => {
  const h = harness({ config: { concurrency: 1 } });
  await h.context.load(); await h.context.tick();
  const job = h.state().jobs[0];
  assert.ok(Object.values(h.files).some((value) => value.includes(job.task_id)));
  const fresh = harness({ config: { concurrency: 1 } });
  Object.assign(fresh.files, h.files);
  await fresh.context.load(); await fresh.context.tick();
  assert.equal(fresh.state().jobs[0].task_id, job.task_id);
  assert.equal(fresh.calls.filter((call) => call.method === "admin:exec").length, 0);
});

test("缺少 NextTrace 时显示明确失败，不沿用上次成功线路", async () => {
  const h = harness({ nodes: [{ uuid: "a" }] });
  await h.context.load(); await h.context.tick();
  const job = h.state().jobs[0];
  h.results[job.task_id] = [{ client: "a", exit_code: 127, finished_at: "2027-01-01", result: "command not found" }];
  await h.context.tick();
  assert.equal(h.state().nodes.a.routes[0].status, "error");
  assert.match(h.state().nodes.a.routes[0].error, /NextTrace/);
  assert.equal(h.state().jobs.length, 0);
});

test("关闭自动检测后不派发新任务", async () => {
  const h = harness({ config: { enabled: false } });
  await h.context.load(); await h.context.tick();
  assert.equal(h.calls.filter((call) => call.method === "admin:exec").length, 0);
});

test("没有结果变化时不重复写缓存，最新快照损坏时使用另一份", async () => {
  const h = harness({ config: { concurrency: 1 } });
  await h.context.load(); await h.context.tick();
  const files = JSON.stringify(h.files);
  await h.context.tick();
  assert.equal(JSON.stringify(h.files), files);
  const first = h.state().jobs[0];
  h.results[first.task_id] = [{ client: "a", exit_code: 127, finished_at: "2027-01-01", result: "command not found" }];
  await h.context.tick();
  const fresh = harness({ config: { concurrency: 1 } });
  Object.assign(fresh.files, h.files);
  const latest = Object.entries(fresh.files).sort((a, b) => JSON.parse(b[1]).revision - JSON.parse(a[1]).revision)[0];
  fresh.files[latest[0]] = "{broken";
  await fresh.context.load();
  assert.equal(fresh.state().nodes.a.routes[0].status, "error");
});

test("接口拒绝游客校验配置，游客读取不会触发后台检测", async () => {
  const h = harness(); await h.context.load();
  let body;
  const res = { statusCode: 200, setHeader() {}, end(value) { body = JSON.parse(value); } };
  await h.routes["POST /api/admin/lumina-network/v1/validate"]({ context: {}, body: "{}" }, res);
  assert.equal(res.statusCode, 403);
  await h.routes["GET /api/public/lumina-network/v1/results"]({ context: {} }, res);
  assert.equal(body.available, false); assert.equal(h.calls.length, 0);
});

test("手动回程请求仅允许管理员，并提示没有参与检测的节点", async () => {
  const h = harness({ config: { all_nodes: false, nodes: [] } });
  await h.context.load();
  let body;
  const res = { statusCode: 200, setHeader() {}, end(value) { body = JSON.parse(value); } };
  const run = h.routes["POST /api/admin/lumina-network/v1/run"];
  await run({ context: {} }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(h.calls.length, 0);
  await run({ context: { role: "admin" } }, res);
  assert.equal(res.statusCode, 400);
  assert.match(body.error, /没有参与回程检测的节点/);
});

test("手动请求跳过回程间隔，仅检测已选节点，重复点击不重复派发或查询 IP", async () => {
  let ipRequests = 0;
  const h = harness({
    config: { enabled: false, ip_enabled: true, all_nodes: false, nodes: ["a"], concurrency: 1 },
    fetch: async () => { ipRequests++; throw new Error("不应查询 IP"); },
  });
  await h.context.load();
  let body;
  const res = { statusCode: 200, setHeader() {}, end(value) { body = JSON.parse(value); } };
  const run = h.routes["POST /api/admin/lumina-network/v1/run"];
  await run({ context: { role: "admin" } }, res);
  assert.equal(res.statusCode, 202);
  assert.equal(body.added, 1);
  await h.context.tick(false);
  assert.equal(h.state().jobs.length, 1);
  assert.equal(ipRequests, 0);
  assert.deepEqual(h.calls.filter((call) => call.method === "admin:exec").map((call) => call.params.clients[0]), ["a"]);
  await run({ context: { role: "admin" } }, res);
  assert.equal(body.added, 0);
  await h.context.tick(false);
  assert.equal(h.calls.filter((call) => call.method === "admin:exec").length, 1);
  const job = h.state().jobs[0];
  h.results[job.task_id] = [{ client: "a", exit_code: 0, finished_at: "2027-01-01", result: JSON.stringify({ Hops: [[{ Success: true, Address: { IP: "203.0.113.1" }, Geo: { asnumber: "4809" } }]] }) }];
  await h.context.tick(false);
  await run({ context: { role: "admin" } }, res);
  assert.equal(body.added, 1);
  await h.context.tick(false);
  assert.equal(h.calls.filter((call) => call.method === "admin:exec").length, 2);
  assert.equal(ipRequests, 0);
});

test("手动队列在插件重载后继续遵守并发限制", async () => {
  const h = harness({ config: { enabled: false, concurrency: 1 } });
  await h.context.load();
  const res = { statusCode: 200, setHeader() {}, end() {} };
  await h.routes["POST /api/admin/lumina-network/v1/run"]({ context: { role: "admin" } }, res);
  await h.context.tick(false);
  assert.equal(h.state().manual_routes.length, 1);
  const fresh = harness({ config: { enabled: false, concurrency: 1 } });
  Object.assign(fresh.files, h.files);
  await fresh.context.load();
  await fresh.context.tick(false);
  assert.equal(fresh.state().jobs.length, 1);
  assert.equal(fresh.state().manual_routes.length, 1);
  assert.equal(fresh.calls.filter((call) => call.method === "admin:exec").length, 0);
  const job = fresh.state().jobs[0];
  fresh.results[job.task_id] = [{ client: job.uuid, exit_code: 127, finished_at: "2027-01-01", result: "command not found" }];
  await fresh.context.tick(false);
  assert.equal(fresh.calls.filter((call) => call.method === "admin:exec").length, 1);
  assert.equal(fresh.state().manual_routes.length, 0);
});

const ipResponse = (asn = 64500) => ({ ok: true, json: async () => ({ data: { asn: { asn, name: "测试机构", type: "hosting" } } }) });

function request(h, path, context = { role: "admin" }) {
  const res = { statusCode: 200, setHeader() {}, end(value) { this.body = JSON.parse(value); } };
  return h.routes[path]({ context }, res).then(() => res);
}
const refresh = (h, context) => request(h, "POST /api/admin/lumina-network/v1/ip-refresh", context);
const results = (h, context) => request(h, "GET /api/public/lumina-network/v1/results", context);

test("每台服务器只检测自己主页的目标，关闭自定义地址，重复请求不增加任务", async () => {
  const h = harness({ config: { enabled: false, targets: [{ address: "old.example.com" }] },
    tasks: [{ id: 1, name: "电信", target: "https://ct.example.com/test", type: "http", clients: ["a"] },
      { id: 2, name: "联通", target: "cu.example.com:8080", type: "tcp", clients: ["b"] }],
    site: { theme: "LuminaUltra", theme_settings: { homepagePingBindings: { 1: ["a"], 2: ["b"] } } } });
  await h.context.load();
  assert.equal((await request(h, "POST /api/admin/lumina-network/v1/run")).body.added, 2);
  assert.equal((await request(h, "POST /api/admin/lumina-network/v1/run")).body.added, 0);
  await h.context.tickRoutes();
  const dispatched = h.calls.filter((call) => call.method === "admin:exec");
  assert.equal(dispatched.length, 2);
  assert.match(dispatched[0].params.command, /'-p' '443'.*'ct.example.com'/);
  assert.match(dispatched[1].params.command, /'-p' '8080'.*'cu.example.com'/);
  assert.deepEqual((await results(h)).body.nodes.map((node) => node.routes.map((route) => route.task_id)), [[1], [2]]);
});

test("主页目标变更后旧结果和排队目标失效，新目标独立检测", async () => {
  const h = harness({ nodes: [{ uuid: "a" }], config: { enabled: false } });
  await h.context.load();
  await request(h, "POST /api/admin/lumina-network/v1/run");
  await h.context.tickRoutes();
  const job = h.state().jobs[0];
  h.results[job.task_id] = [{ client: "a", exit_code: 0, finished_at: "2027-01-01", result: JSON.stringify({ Hops: [[{ Success: true, Address: { IP: "59.43.1.1" } }]], StopReason: { reason: "destination_reached" } }) }];
  await h.context.tickRoutes();
  assert.equal((await results(h)).body.nodes[0].routes[0].route_label, "CN2GIA");
  await request(h, "POST /api/admin/lumina-network/v1/run");
  h.tasks[0].target = "new.example.com:443";
  const updated = (await results(h)).body.nodes[0].routes[0];
  assert.equal(updated.status, "pending");
  assert.equal(updated.route_label, null);
  await h.context.tickRoutes();
  assert.equal(h.state().manual_routes.length, 0);
  assert.equal(h.state().jobs.length, 0);
  await request(h, "POST /api/admin/lumina-network/v1/run");
  await h.context.tickRoutes();
  assert.match(h.calls.filter((call) => call.method === "admin:exec").at(-1).params.command, /new.example.com/);
});

test("主页没有探测点时不使用内置地址，IP 查询仍可独立运行", async () => {
  const h = harness({ site: { theme: "LuminaUltra", theme_settings: {} }, fetch: async () => ipResponse() });
  await h.context.load();
  const result = await request(h, "POST /api/admin/lumina-network/v1/run");
  assert.equal(result.statusCode, 400);
  assert.match(result.body.error, /主页延迟检测/);
  await h.context.tickRoutes();
  assert.equal(h.calls.filter((call) => call.method === "admin:exec").length, 0);
  assert.equal((await refresh(h)).statusCode, 202);
  await h.context.tickIPs();
  assert.equal((await results(h)).body.nodes[0].ips[0].asn, "AS64500");
});

test("IP 查询失败按小时退避，成功结果缓存后不重复查询，只请求 IPinfo", async () => {
  const requests = [];
  const h = harness({ config: { enabled: false, ip_enabled: true }, nodes: [{ uuid: "a", ipv4: "203.0.113.1" }], fetch: async (url) => {
    requests.push(url);
    if (requests.length === 1) throw new Error("quota");
    return ipResponse();
  } });
  await h.context.load(); await h.context.tickIPs(); await h.context.tickIPs();
  assert.equal(requests.length, 1);
  h.advance(3600001); await h.context.tickIPs(); await h.context.tickIPs();
  assert.equal(requests.length, 2);
  assert.equal(h.state().nodes.a.ips[0].asn, "AS64500");
  assert.ok(requests.every((url) => url === "https://ipinfo.io/widget/demo/203.0.113.1"));
});

test("升级后旧来源新鲜缓存也重新查询，不冒充 IPinfo", async () => {
  let requests = 0;
  const h = harness({ config: { enabled: false, ip_enabled: true }, nodes: [{ uuid: "a", ipv4: "203.0.113.1" }], fetch: async () => { requests++; return ipResponse(); } });
  h.files["/store/network-state.json.1"] = JSON.stringify({
    revision: 1, jobs: [], ip_attempts: { "a:203.0.113.1": 1800000000000 },
    nodes: { a: { ips: [{ address: "203.0.113.1", family: 4, asn: "AS64501", source: "ipapi.is", checked_at: new Date(1800000000000).toISOString() }], routes: [] } },
  });
  await h.context.load();
  assert.equal((await results(h)).body.nodes[0].ips.length, 0);
  await h.context.tickIPs();
  assert.equal(requests, 1);
  assert.equal(h.state().nodes.a.ips[0].asn, "AS64500");
  assert.equal(h.state().nodes.a.ips[0].source, "IPinfo");
});

test("IP 刷新只允许管理员，没有回程选择也可以查询全部 IPv4、IPv6", async () => {
  const requests = [];
  const h = harness({
    config: { enabled: false, ip_enabled: false, all_nodes: false, nodes: [] },
    nodes: [{ uuid: "a", ipv4: "203.0.113.1", ipv6: "2001:db8::1" }, { uuid: "b", ipv4: "203.0.113.2" }],
    fetch: async (url) => { requests.push(url); return ipResponse(); },
  });
  await h.context.load();
  assert.equal((await refresh(h, {})).statusCode, 403);
  assert.equal(h.calls.length, 0);
  const result = await refresh(h);
  assert.equal(result.statusCode, 202);
  assert.equal(result.body.added, 0);
  assert.equal(result.body.ip_added, 3);
  assert.equal((await refresh(h)).body.ip_added, 0);
  await h.context.tickIPs();
  h.advance(60000); await h.context.tickIPs();
  h.advance(60000); await h.context.tickIPs();
  assert.equal(requests.length, 3);
  assert.equal(h.state().manual_ips.length, 0);
  assert.equal(h.state().nodes.b.ips[0].asn, "AS64500");
  assert.deepEqual(h.state().nodes.a.ips.map((ip) => ip.family), [4, 6]);
  assert.equal(h.calls.filter((call) => call.method === "admin:exec").length, 0);
  const visible = (await results(h)).body;
  assert.equal(visible.nodes[1].ips.length, 1);
  assert.equal(visible.nodes[0].routes.length, 0);
});

test("IP 手动刷新跳过缓存与退避，失败保留同来源旧值并显示错误", async () => {
  let count = 0;
  const h = harness({ config: { enabled: false, ip_enabled: true }, nodes: [{ uuid: "a", ipv4: "203.0.113.1" }], fetch: async () => {
    count++;
    if (count === 2) return { ok: false, status: 403 };
    return ipResponse(64500 + count);
  } });
  await h.context.load(); await h.context.tickIPs(); await h.context.tickIPs();
  assert.equal(count, 1);
  await refresh(h); h.advance(60000); await h.context.tickIPs();
  assert.equal(count, 2);
  assert.equal(h.state().nodes.a.ips[0].asn, "AS64501");
  assert.match(h.state().nodes.a.ips[0].error, /IPinfo.*403/);
  assert.equal(h.state().manual_ips.length, 0);
  await refresh(h); h.advance(60000); await h.context.tickIPs();
  assert.equal(count, 3);
  assert.equal(h.state().nodes.a.ips[0].asn, "AS64503");
  assert.equal(h.state().nodes.a.ips[0].error, null);
});

test("IP 请求未完成不重复入队，也不阻塞回程调度", async () => {
  let finish, started;
  const ready = new Promise((resolve) => { started = resolve; });
  const h = harness({
    config: { ip_enabled: false, concurrency: 1 }, nodes: [{ uuid: "a", ipv4: "203.0.113.1" }],
    fetch: () => { started(); return new Promise((resolve) => { finish = resolve; }); },
  });
  await h.context.load(); await refresh(h);
  const pending = h.context.tickIPs();
  await ready;
  const duplicate = await refresh(h);
  assert.equal(duplicate.body.ip_added, 0);
  assert.equal(duplicate.body.ip_queued, 1);
  await h.context.tickRoutes();
  assert.equal(h.state().jobs.length, 1);
  finish(ipResponse()); await pending;
  assert.equal(h.state().manual_ips.length, 0);
});

test("IP 手动队列重载后继续，移除或换 IP 的任务跳过，不受回程取消选择影响", async () => {
  const config = { enabled: false, ip_enabled: false, all_nodes: false, nodes: ["a", "b", "c", "d"] };
  const h = harness({ config, nodes: ["a", "b", "c", "d"].map((uuid, i) => ({ uuid, ipv4: `203.0.113.${i + 1}` })) });
  await h.context.load(); await refresh(h);
  assert.equal(h.state().manual_ips.length, 4);
  const requests = [];
  const fresh = harness({
    config: { ...config, nodes: [] },
    nodes: [{ uuid: "a", ipv4: "203.0.113.1" }, { uuid: "c", ipv4: "203.0.113.9" }, { uuid: "d", ipv4: "203.0.113.4" }],
    fetch: async (url) => { requests.push(url); return ipResponse(); },
  });
  Object.assign(fresh.files, h.files);
  await fresh.context.load(); await fresh.context.tickIPs();
  fresh.advance(60000); await fresh.context.tickIPs();
  assert.equal(requests.length, 2);
  assert.match(requests[0], /203\.0\.113\.1$/);
  assert.match(requests[1], /203\.0\.113\.4$/);
  assert.equal(fresh.state().manual_ips.length, 0);
});

test("回程配置无效或没有目标不影响 IP 刷新与读取", async () => {
  const h = harness({ config: { targets: "无效配置", nexttrace_path: ";bad", enabled: false, ip_enabled: false }, fetch: async () => ipResponse() });
  await h.context.load();
  const result = await refresh(h);
  assert.equal(result.statusCode, 202);
  assert.equal(result.body.added, 0);
  assert.equal(result.body.ip_added, 1);
  await h.context.tickIPs();
  const visible = (await results(h)).body;
  assert.equal(visible.nodes[0].ips[0].asn, "AS64500");
  assert.equal(visible.nodes[0].routes.length, 0);
  assert.equal(visible.ip_error, null);
  assert.ok(visible.error);
});

test("自动 IP 查询覆盖回程未选节点，三个显示开关不控制查询", async () => {
  let count = 0;
  const h = harness({
    config: { enabled: false, ip_enabled: true, all_nodes: false, nodes: [], show_asn: false, show_organization: false, show_ip_type: false },
    fetch: async () => { count++; return ipResponse(); },
  });
  await h.context.load(); await h.context.tickIPs();
  assert.equal(count, 1);
  assert.equal(h.state().nodes.a.ips[0].type, "机房");
  const visible = (await results(h)).body;
  assert.equal(visible.show_asn, false);
  assert.equal(visible.show_organization, false);
  assert.equal(visible.show_ip_type, false);
});

test("两个回程入口都只派发回程，不要求 IP 配置有效", async () => {
  const h = harness({ config: { enabled: false, ip_source: "无效来源", ip_interval_hours: -1 } });
  await h.context.load();
  for (const path of ["run", "detect"]) {
    const result = await request(h, "POST /api/admin/lumina-network/v1/" + path);
    assert.equal(result.statusCode, 202);
    assert.equal(result.body.ip_added, 0);
    assert.equal(h.state().manual_ips.length, 0);
  }
  await h.context.tickRoutes();
  assert.equal(h.state().jobs.length, 2);
  const visible = (await results(h)).body;
  assert.equal(visible.nodes[0].ips.length, 0);
  assert.ok(visible.nodes[0].routes.length);
});

test("多个节点使用相同 IP 时共用一次查询和手动任务", async () => {
  let count = 0;
  const h = harness({ config: { enabled: false, ip_enabled: true }, nodes: [{ uuid: "a", ipv4: "203.0.113.1" }, { uuid: "b", ipv4: "203.0.113.1" }], fetch: async () => { count++; return ipResponse(); } });
  await h.context.load();
  assert.equal((await refresh(h)).body.ip_added, 1);
  await h.context.tickIPs(); await h.context.tickIPs();
  assert.equal(count, 1);
  assert.equal(h.state().nodes.a.ips[0].asn, "AS64500");
  assert.equal(h.state().nodes.b.ips[0].asn, "AS64500");
});

test("请求期间节点换 IP，不写回旧地址查询结果", async () => {
  const nodes = [{ uuid: "a", ipv4: "203.0.113.1" }];
  const h = harness({ config: { enabled: false, ip_enabled: true }, nodes, fetch: async () => { nodes[0].ipv4 = "203.0.113.2"; return ipResponse(); } });
  await h.context.load(); await h.context.tickIPs();
  assert.equal(h.state().nodes.a.ips.length, 0);
  assert.equal((await results(h)).body.nodes[0].ips.length, 0);
});

test("游客分别授权，IP 可见不会同时开放回程或隐藏节点", async () => {
  const h = harness({
    config: { enabled: false, ip_enabled: true, ip_guest_visible: true, guest_visible: false },
    nodes: [{ uuid: "a", ipv4: "203.0.113.1" }, { uuid: "hidden", hidden: true, ipv4: "203.0.113.1" }],
    fetch: async () => ipResponse(),
  });
  await h.context.load(); await h.context.tickIPs();
  const visible = (await results(h, {})).body;
  assert.equal(visible.nodes.length, 1);
  assert.equal(visible.nodes[0].ips[0].address, undefined);
  assert.equal(visible.nodes[0].routes.length, 0);
  assert.equal(visible.show_home, false);
  h.config.ip_guest_visible = false;
  h.config.guest_visible = true;
  const routeOnly = (await results(h, {})).body;
  assert.equal(routeOnly.nodes[0].ips.length, 0);
  assert.equal(routeOnly.ip_available, false);
});

test("查询间隔从响应完成起计算，未满 60 秒不查询下一个地址", async () => {
  const requests = [];
  const h = harness({
    config: { enabled: false, ip_enabled: true },
    nodes: [{ uuid: "a", ipv4: "203.0.113.1" }, { uuid: "b", ipv4: "203.0.113.2" }],
    fetch: async (url) => { requests.push(url); h.advance(5000); return ipResponse(); },
  });
  await h.context.load(); await h.context.tickIPs();
  h.advance(59999); await h.context.tickIPs();
  assert.equal(requests.length, 1);
  h.advance(1); await h.context.tickIPs();
  assert.equal(requests.length, 2);
  assert.match(requests[1], /203\.0\.113\.2$/);
  h.advance(60000); await h.context.tickIPs();
  assert.equal(requests.length, 2);
});

test("429 暂停全部自动 IP 查询，连续限流仍只冷却一小时，不影响回程", async () => {
  const requests = [];
  const h = harness({
    config: { ip_enabled: true, ip_guest_visible: true },
    nodes: [{ uuid: "a", ipv4: "203.0.113.1" }, { uuid: "b", ipv4: "203.0.113.2" }],
    fetch: async (url) => {
      requests.push(url);
      h.advance(3000);
      return requests.length <= 2 ? { ok: false, status: 429 } : ipResponse();
    },
  });
  await h.context.load(); await h.context.tickIPs();
  const admin = (await results(h)).body;
  assert.match(admin.ip_error, /IPinfo 请求受限.*UTC.*手动刷新可绕过冷却/);
  assert.equal((await results(h, {})).body.ip_error, undefined);
  await h.context.tickRoutes();
  assert.ok(h.state().jobs.length);
  for (let i = 0; i < 2; i++) {
    h.advance(3599999); await h.context.tickIPs();
    assert.equal(requests.length, i + 1);
    h.advance(1); await h.context.tickIPs();
    assert.equal(requests.length, i + 2);
  }
  assert.equal((await results(h)).body.ip_error, null);
  h.advance(60000); await h.context.tickIPs();
  assert.equal(requests.length, 4);
  assert.match(requests[3], /203\.0\.113\.2$/);
});

test("普通错误只暂停当前地址，其他地址仍按 60 秒间隔查询", async () => {
  const requests = [];
  const h = harness({
    config: { enabled: false, ip_enabled: true },
    nodes: [{ uuid: "a", ipv4: "203.0.113.1" }, { uuid: "b", ipv4: "203.0.113.2" }],
    fetch: async (url) => { requests.push(url); return requests.length === 1 ? { ok: false, status: 403 } : ipResponse(); },
  });
  await h.context.load(); await h.context.tickIPs();
  h.advance(60000); await h.context.tickIPs();
  assert.equal(requests.length, 2);
  assert.match(requests[1], /203\.0\.113\.2$/);
  assert.equal((await results(h)).body.ip_error, null);
  h.advance(3539999); await h.context.tickIPs();
  assert.equal(requests.length, 2);
  h.advance(1); await h.context.tickIPs();
  assert.equal(requests.length, 3);
  assert.match(requests[2], /203\.0\.113\.1$/);
});

test("手动队列绕过全局冷却但保留 60 秒间隔，成功不提前恢复自动查询", async () => {
  const requests = [];
  const h = harness({
    config: { enabled: false, ip_enabled: true },
    nodes: [{ uuid: "a", ipv4: "203.0.113.1" }, { uuid: "b", ipv4: "203.0.113.2" }],
    fetch: async (url) => { requests.push(url); return requests.length <= 2 ? { ok: false, status: 429 } : ipResponse(); },
  });
  await h.context.load(); await h.context.tickIPs();
  assert.equal((await refresh(h)).body.ip_added, 2);
  assert.equal((await refresh(h)).body.ip_added, 0);
  h.advance(59999); await h.context.tickIPs();
  assert.equal(requests.length, 1);
  h.advance(1); await h.context.tickIPs();
  assert.equal(requests.length, 2);
  h.advance(60000); await h.context.tickIPs();
  assert.equal(requests.length, 3);
  assert.match(requests[2], /203\.0\.113\.2$/);
  assert.equal(h.state().manual_ips.length, 0);
  assert.match((await results(h)).body.ip_error, /IPinfo 请求受限/);
  h.advance(3539999); await h.context.tickIPs();
  assert.equal(requests.length, 3);
  h.advance(1); await h.context.tickIPs();
  assert.equal(requests.length, 4);
  assert.match(requests[3], /203\.0\.113\.1$/);
  assert.equal((await results(h)).body.ip_error, null);
});

test("全局冷却在重载后保留，恢复时间不因重载延长", async () => {
  const options = {
    config: { enabled: false, ip_enabled: true },
    nodes: [{ uuid: "a", ipv4: "203.0.113.1" }, { uuid: "b", ipv4: "203.0.113.2" }],
  };
  const h = harness({ ...options, fetch: async () => ({ ok: false, status: 429 }) });
  await h.context.load(); await h.context.tickIPs(); await h.context.unload();
  let requests = 0;
  const fresh = harness({ ...options, fetch: async () => { requests++; return ipResponse(); } });
  Object.assign(fresh.files, h.files);
  fresh.advance(1800000); await fresh.context.load(); await fresh.context.tickIPs();
  assert.equal(requests, 0);
  assert.match((await results(fresh)).body.ip_error, /IPinfo 请求受限/);
  fresh.advance(1799999); await fresh.context.tickIPs();
  assert.equal(requests, 0);
  fresh.advance(1); await fresh.context.tickIPs();
  assert.equal(requests, 1);
});

test("重载后手动队列继续绕过冷却，但不能跳过已保存的查询间隔", async () => {
  const options = {
    config: { enabled: false, ip_enabled: false },
    nodes: [{ uuid: "a", ipv4: "203.0.113.1" }, { uuid: "b", ipv4: "203.0.113.2" }],
  };
  const h = harness({ ...options, fetch: async () => ({ ok: false, status: 429 }) });
  await h.context.load(); await refresh(h); await h.context.tickIPs(); await h.context.unload();
  const requests = [];
  const fresh = harness({ ...options, fetch: async (url) => { requests.push(url); return ipResponse(); } });
  Object.assign(fresh.files, h.files);
  await fresh.context.load(); await fresh.context.tickIPs();
  fresh.advance(59999); await fresh.context.tickIPs();
  assert.equal(requests.length, 0);
  fresh.advance(1); await fresh.context.tickIPs();
  assert.equal(requests.length, 1);
  assert.match(requests[0], /203\.0\.113\.2$/);
  assert.equal(fresh.state().manual_ips.length, 0);
});
