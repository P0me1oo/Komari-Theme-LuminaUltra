const { test } = require("node:test");
const assert = require("node:assert/strict");
const core = require("../core.cjs");
const { selections, parseTask, resolveConfig } = require("../ping-targets.cjs");

const nodes = [{ uuid: "a" }, { uuid: "b" }];
const tasks = [1, 2, 3, 4].map((id) => ({ id, name: "探测点 " + id, type: "tcp", target: `probe${id}.example.com:443`, clients: ["a", "b"] }));
const site = (settings) => ({ theme: "LuminaUltra", theme_settings: settings });

test("回程跟随三网全局、节点覆盖和单线路配置，同一探测点只检测一次", () => {
  const selected = selections(nodes, { enableHomepageMultiPing: true, homepageMultiPingTaskIds: [1, 2, 3],
    homepageMultiPingNodeTaskIds: { a: [3, 4, 2] }, homepagePingBindings: { 2: ["a"], 4: ["b"] } });
  assert.deepEqual(selected.get("a"), [3, 4, 2]);
  assert.deepEqual(selected.get("b"), [1, 2, 3, 4]);
});

test("未启用三网时只读取单线路，重复绑定沿用最小任务编号", () => {
  const selected = selections(nodes, { homepageMultiPingTaskIds: [1, 2, 3], homepagePingBindings: { 4: [" a ", "b"], 2: ["a"] } });
  assert.deepEqual(selected.get("a"), [2]);
  assert.deepEqual(selected.get("b"), [4]);
});

test("不完整覆盖回退全局，全局也不完整时回退单线路", () => {
  const settings = { enableHomepageMultiPing: true, homepageMultiPingTaskIds: ["1", 2, 3], homepageMultiPingNodeTaskIds: { a: [3, 3, 4] }, homepagePingBindings: { 2: ["a"] } };
  assert.deepEqual(selections(nodes, settings).get("a"), [1, 2, 3]);
  settings.homepageMultiPingTaskIds = [1, 2];
  assert.deepEqual(selections(nodes, settings).get("a"), [2]);
});

for (const [type, address, host, port, family] of [
  ["tcp", "example.com:8443", "example.com", 8443, 0],
  ["http", "https://example.com/path?q=1#part", "example.com", 443, 0],
  ["http", "http://example.com:8080/path", "example.com", 8080, 0],
  ["http", "https://[2001:db8::1]/", "2001:db8::1", 443, 6],
  ["tcp", "192.0.2.1:80", "192.0.2.1", 80, 4],
  ["tcp", "[2001:db8::1]:443", "2001:db8::1", 443, 6],
  ["icmp", "2001:db8::1", "2001:db8::1", 80, 6],
  ["icmp", "example.com", "example.com", 80, 0],
]) {
  test(`主页 ${type} 地址 ${address} 只生成一次探测参数`, () => {
    const target = parseTask({ type, target: address });
    assert.equal(target.host, host);
    assert.equal(target.port, port);
    assert.equal(target.family, family);
    const command = core.traceCommand(core.normalizeRouteConfig({}), target);
    assert.equal(command.includes("'-T'"), type !== "icmp");
    if (family === 0) assert.doesNotMatch(command, /'-[46]'/);
    assert.equal(command.split("timeout").length, 2);
    if (type === "http") assert.doesNotMatch(command, /https?:|\/path|\?q=/);
  });
}

test("地址中命令片段、无效端口和不支持的协议不会派发", () => {
  for (const task of [
    { type: "tcp", target: "example.com;whoami" },
    { type: "tcp", target: "example.com:65536" },
    { type: "http", target: "https://example.com$(whoami)/" },
    { type: "http", target: "https://example.com:0/" },
    { type: "icmp", target: "example.com:80" },
    { type: "tcp", target: "[::::]:80" },
    { type: "unknown", target: "example.com" },
  ]) assert.throws(() => parseTask(task));
});

test("后台读取真实目标，旧自定义地址不参与，指定节点范围仍生效", () => {
  const config = resolveConfig({ targets: "旧地址", all_nodes: false, nodes: ["a"] }, nodes,
    site({ homepagePingBindings: { 1: ["a", "b"] } }), tasks);
  assert.equal(core.targetsForNode(config, "a")[0].address, tasks[0].target);
  assert.equal(core.targetsForNode(config, "a")[0].carrier, null);
  assert.deepEqual(core.targetsForNode(config, "b"), []);
});

test("任务删除、未绑定和地址无效各自返回原因，不影响其他目标", () => {
  const config = resolveConfig({}, nodes, site({ enableHomepageMultiPing: true, homepageMultiPingTaskIds: [1, 2, 3] }), [
    tasks[0], { ...tasks[1], clients: ["b"] },
  ]);
  const selected = core.targetsForNode(config, "a");
  assert.equal(selected[0].error, undefined);
  assert.match(selected[1].error, /未在后台绑定/);
  assert.match(selected[2].error, /已删除/);
  assert.equal(core.targetsForNode(config, "b")[1].error, undefined);
});

test("同一任务地址或协议改变时更换缓存标识，改名只更新显示名称", () => {
  const settings = site({ homepagePingBindings: { 1: ["a"] } });
  const original = resolveConfig({}, nodes, settings, tasks).targets[0];
  const renamed = resolveConfig({}, nodes, settings, [{ ...tasks[0], name: "新名称" }]).targets[0];
  const changed = resolveConfig({}, nodes, settings, [{ ...tasks[0], target: "new.example.com:443" }]).targets[0];
  assert.equal(original.key, renamed.key);
  assert.equal(renamed.task_name, "新名称");
  assert.notEqual(original.key, changed.key);
  assert.throws(() => resolveConfig({}, nodes, { theme: "other" }, tasks), /LuminaUltra/);
});
