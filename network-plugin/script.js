"use strict";

const server = require("server");
const fs = require("node:fs");
const core = require("./core.cjs");
const pingTargets = require("./ping-targets.cjs");
const ipSource = require("./ip.cjs");
const storage = typeof __storageDir__ === "string" ? __storageDir__ : ".";
// 新快照避开旧运行时可能创建的只读文件，加载时仍兼容旧文件名。
const statePath = storage + "/network-state-v2.json";
const IP_QUERY_INTERVAL_MS = 60000;
const IP_COOLDOWN_MS = 3600000;
let state = { nodes: {}, jobs: [], ip_attempts: {}, manual_routes: [], manual_ips: [], ip_next_query_at: 0, ip_cooldown_until: 0, ipregistry_retry_at: 0 };
let routeBusy = false;
let ipBusy = false;
let ipController = null;
let stopped = false;
let routeError = null;
let ipError = null;
let saveChain = Promise.resolve();
let revision = 0;
let scheduledSnapshot = null;

function saveState() {
  const serialized = JSON.stringify(state);
  if (serialized === scheduledSnapshot) return saveChain;
  scheduledSnapshot = serialized;
  const current = ++revision;
  const snapshot = JSON.stringify(Object.assign({ revision: current }, state));
  saveChain = saveChain.catch(() => {}).then(async () => {
    // 两个交替快照保留上一份完整缓存，不依赖各平台对覆盖重命名的差异。
    // 显式传入选项对象，避免旧运行时把编码字符串当成文件权限，创建只读缓存。
    await fs.promises.writeFile(statePath + "." + current % 2, snapshot, { encoding: "utf8", mode: 0o600 });
  }).catch((error) => {
    if (scheduledSnapshot === serialized) scheduledSnapshot = null;
    throw error;
  });
  return saveChain;
}

function nodeState(uuid) {
  if (!Object.prototype.hasOwnProperty.call(state.nodes, uuid)) state.nodes[uuid] = { ips: [], routes: [] };
  return state.nodes[uuid];
}

function saveRoute(job, result, now) {
  const saved = nodeState(job.uuid);
  const record = Object.assign({ key: job.target.key, checked_at: new Date(now).toISOString() }, result);
  // 失败不沿用旧线路冒充本次结果；上次成功时间保留在历史任务中。
  saved.routes = saved.routes.filter((route) => route.key !== job.target.key);
  saved.routes.push(record);
}

function failure(message) {
  return { status: "error", error: message, networks: [], asns: [], hops: [], reached: null };
}

async function collectJobs(now) {
  for (const job of state.jobs.slice()) {
    let result;
    try {
      const task = await server.call("admin:getTaskById", { task_id: job.task_id });
      result = (task.results || []).find((entry) => entry.client === job.uuid && entry.finished_at && entry.exit_code !== null);
    } catch (_) { /* 任务尚不可读时留到下一轮，超过期限后结束 */ }
    if (result) {
      try {
        const trace = core.parseTrace(result.result, result.exit_code, job.target.carrier);
        saveRoute(job, Object.assign(trace, { error: result.exit_code === 0 ? null : "探测未正常结束，显示已收到的路径" }), now);
      } catch (_) {
        const code = result.exit_code;
        const message = code === 124 || code === 137 ? "探测超时" : code === 127 ? "未找到 NextTrace 或 timeout 程序" : "探测失败，请检查 NextTrace、运行权限和节点任务日志";
        saveRoute(job, failure(message), now);
      }
    } else if (now >= job.deadline) {
      saveRoute(job, failure("未收到探针结果，请检查节点连接和远程命令功能"), now);
    } else continue;
    state.jobs = state.jobs.filter((entry) => entry.task_id !== job.task_id);
    await saveState();
  }
}

async function dispatchJobs(nodes, config, now) {
  if (!config.targets.length) { state.manual_routes = []; return; }
  const selected = core.selectedNodes(nodes, config);
  const selectedById = new Map(selected.map((node) => [node.uuid, node]));
  const targetsByNode = new Map(selected.map((node) => [node.uuid, new Map(core.targetsForNode(config, node.uuid).filter((target) => !target.error).map((target) => [target.key, target]))]));
  state.manual_routes = state.manual_routes.filter((item) => selectedById.has(item.uuid) && targetsByNode.get(item.uuid).has(item.key));
  const occupied = new Set(state.jobs.map((job) => job.uuid));
  const due = state.manual_routes.map((item) => ({ node: selectedById.get(item.uuid), target: targetsByNode.get(item.uuid).get(item.key), manual: true }));
  if (config.enabled) {
    const automatic = [];
    for (const node of selected) {
      if (occupied.has(node.uuid)) continue;
      for (const target of targetsByNode.get(node.uuid).values()) {
        const record = nodeState(node.uuid).routes.find((route) => route.key === target.key);
        const checked = record ? Date.parse(record.checked_at) : 0;
        if (!checked || now - checked >= config.interval_minutes * 60000) automatic.push({ node, target, checked });
      }
    }
    // 最久未检测的目标优先，手动请求始终排在自动任务前面。
    automatic.sort((a, b) => a.checked - b.checked);
    due.push(...automatic);
  }
  let attempts = 0;
  for (const item of due) {
    if (stopped || state.jobs.length >= config.concurrency) break;
    const uuid = item.node.uuid;
    if (occupied.has(uuid)) continue;
    if (attempts++ >= config.concurrency) break;
    occupied.add(uuid);
    try {
      const accepted = await server.call("admin:exec", { clients: [uuid], command: core.traceCommand(config, item.target) });
      if (!accepted || !accepted.task_id) throw new Error("未返回任务编号");
      state.jobs.push({ uuid, target: item.target, task_id: accepted.task_id, deadline: now + 180000 });
    } catch (_) {
      saveRoute({ uuid, target: item.target }, failure("节点离线或无法下发探测任务"), now);
    }
    if (item.manual) state.manual_routes = state.manual_routes.filter((entry) => entry.uuid !== uuid || entry.key !== item.target.key);
    await saveState();
  }
}

function nodeIPs(nodes) {
  const items = [];
  for (const node of nodes) {
    for (const family of [4, 6]) {
      const address = String(node[family === 4 ? "ipv4" : "ipv6"] || "").trim();
      if (address && /^[0-9a-fA-F:.]+$/.test(address)) items.push({ uuid: node.uuid, family, address });
    }
  }
  return items;
}

function ipKey(item) { return item.provider + ":" + item.family + ":" + item.address; }

function enqueueRoutes(nodes, config) {
  const selected = core.selectedNodes(nodes, config);
  if (!selected.length) throw new Error("没有参与回程检测的节点，请选择节点或开启检测全部节点");
  if (!config.targets.length) throw new Error("请先在主题设置的主页延迟检测中选择探测点");
  if (!selected.some((node) => core.targetsForNode(config, node.uuid).some((target) => !target.error))) {
    throw new Error("没有可用的主页探测点，请检查目标地址和后台节点绑定");
  }
  const queued = new Set(state.manual_routes.map((item) => item.uuid + ":" + item.key));
  const running = new Set(state.jobs.map((job) => job.uuid + ":" + job.target.key));
  let added = 0;
  for (const node of selected) {
    for (const target of core.targetsForNode(config, node.uuid)) {
      if (target.error) continue;
      const key = node.uuid + ":" + target.key;
      if (queued.has(key) || running.has(key)) continue;
      state.manual_routes.push({ uuid: node.uuid, key: target.key });
      queued.add(key);
      added++;
    }
  }
  return { added, queued: state.manual_routes.length, running: state.jobs.length, ip_added: 0, ip_queued: 0 };
}

function enqueueIPs(nodes, config) {
  const ips = nodeIPs(nodes).map((item) => ({ ...item, provider: config.ip_source }));
  if (!ips.length) throw new Error("没有可查询的 IP 地址，请先为节点配置 IPv4 或 IPv6");
  const queued = new Set(state.manual_ips.map(ipKey));
  let added = 0;
  for (const item of ips) {
    if (queued.has(ipKey(item))) continue;
    state.manual_ips.push(item);
    queued.add(ipKey(item));
    added++;
  }
  return { added: 0, queued: 0, running: 0, ip_added: added, ip_queued: state.manual_ips.length };
}

async function updateOneIP(nodes, config, now) {
  if (stopped) return;
  const ips = nodeIPs(nodes).map((item) => ({ ...item, provider: config.ip_source }));
  const current = new Set(ips.map(ipKey));
  state.manual_ips = state.manual_ips.filter((item) => current.has(ipKey(item)));
  const manual = state.manual_ips[0];
  const registry = config.ip_source === "ipregistry";
  // IPregistry 只遵守服务端限流时间，手动刷新也不能绕过；旧固定等待仅用于 IPinfo。
  if (registry ? now < state.ipregistry_retry_at : now < state.ip_next_query_at || (!manual && now < state.ip_cooldown_until)) return;
  // 失败地址没有额外冷却，按上次尝试时间轮转，避免它一直占据队首。
  if (registry) ips.sort((a, b) => (state.ip_attempts[ipKey(a)] || 0) - (state.ip_attempts[ipKey(b)] || 0));
  const item = manual || (config.ip_enabled ? ips.find((entry) => {
    const cached = nodeState(entry.uuid).ips.find((ip) => ip.address === entry.address && ip.provider === config.ip_source);
    const attempted = state.ip_attempts[ipKey(entry)];
    return !(cached && now - Date.parse(cached.checked_at) < config.ip_interval_hours * 3600000) &&
      (registry || !(attempted && now - attempted < IP_COOLDOWN_MS));
  }) : undefined);
  if (!item) return;
  const { family, address } = item;
  state.ip_attempts[ipKey(item)] = now;
  await saveState();
  const controller = new AbortController();
  ipController = controller;
  const timer = setTimeout(() => controller.abort(), 15000);
  let data, error, rateLimited = false, registryRetryAt = 0;
  const sourceName = ipSource.sourceName(config.ip_source);
  try {
    const response = await fetch(ipSource.queryURL(config.ip_source, address), {
      signal: controller.signal, headers: ipSource.queryHeaders(config.ip_source, config.ipregistry_api_key),
    });
    rateLimited = response.status === 429;
    if (registry && rateLimited) registryRetryAt = ipSource.registryRetryAt(response.headers, Date.now());
    if (!response.ok) error = ipSource.httpError(config.ip_source, response.status);
    else {
      const payload = await response.json();
      data = config.ip_source === "ipregistry" ? ipSource.parseIPregistry(payload) : ipSource.parseIPInfo(payload);
    }
  } catch (_) {
    error = sourceName + " 暂时无法查询，请稍后重试";
  } finally {
    clearTimeout(timer);
    ipController = null;
  }
  if (stopped) return;
  const completed = Date.now();
  state.ip_attempts[ipKey(item)] = completed;
  if (registry) state.ipregistry_retry_at = registryRetryAt;
  else {
    state.ip_next_query_at = completed + IP_QUERY_INTERVAL_MS;
    // IPinfo 保留固定一小时冷却，手动查询成功不提前解除。
    if (rateLimited) state.ip_cooldown_until = completed + IP_COOLDOWN_MS;
  }
  await saveState();
  const latestConfig = core.normalizeIPConfig(await server.getConfig());
  if (latestConfig.ip_source !== config.ip_source || latestConfig.ipregistry_api_key !== config.ipregistry_api_key) return;
  const latestNodes = await server.call("admin:listClients", {});
  // 同一地址的节点共用一次查询；请求期间移除节点或更换地址，不写回旧结果。
  for (const entry of nodeIPs(latestNodes).filter((entry) => entry.family === family && entry.address === address)) {
    const saved = nodeState(entry.uuid);
    const cached = saved.ips.find((ip) => ip.address === address && ip.provider === config.ip_source);
    const record = data
      ? { ...data, address, family, checked_at: new Date(completed).toISOString(), error: null }
      : cached ? { ...cached, error }
        : { address, family, asn: null, organization: "未知", type: "未知", source: sourceName, provider: config.ip_source, checked_at: new Date(0).toISOString(), error };
    saved.ips = saved.ips.filter((ip) => ip.family !== family);
    saved.ips.push(record);
  }
  if (manual && !(registry && rateLimited)) state.manual_ips = state.manual_ips.filter((entry) => ipKey(entry) !== ipKey(manual));
  await saveState();
}

async function loadRouteConfig(raw, nodes) {
  const [site, tasks] = await Promise.all([
    server.call("public:getPublicSettings", {}),
    server.call("admin:getAllPingTasks", {}),
  ]);
  return pingTargets.resolveConfig(raw, nodes, site, tasks);
}

async function tickRoutes() {
  if (routeBusy || stopped) return;
  routeBusy = true;
  try {
    const now = Date.now();
    await collectJobs(now);
    const raw = await server.getConfig();
    const nodes = await server.call("admin:listClients", {});
    const config = await loadRouteConfig(raw, nodes);
    await dispatchJobs(nodes, config, now);
    const ids = new Set(nodes.map((node) => node.uuid));
    for (const uuid of Object.keys(state.nodes)) {
      if (!ids.has(uuid)) delete state.nodes[uuid];
      else state.nodes[uuid].routes = state.nodes[uuid].routes.filter((route) => core.targetsForNode(config, uuid).some((target) => target.key === route.key));
    }
    routeError = null;
    await saveState();
  } catch (error) {
    routeError = String(error.message || "回程检测配置无效");
    console.error("三网回程：" + routeError);
  } finally { routeBusy = false; }
}

async function tickIPs() {
  if (ipBusy || stopped) return;
  ipBusy = true;
  try {
    const config = core.normalizeIPConfig(await server.getConfig());
    const nodes = await server.call("admin:listClients", {});
    const now = Date.now();
    await updateOneIP(nodes, config, now);
    for (const key of Object.keys(state.ip_attempts)) {
      if (now - state.ip_attempts[key] > 86400000) delete state.ip_attempts[key];
    }
    ipError = null;
    await saveState();
  } catch (error) {
    ipError = String(error.message || "IP 查询配置无效");
    console.error("IP 信息：" + ipError);
  } finally { ipBusy = false; }
}

async function tick(refreshIP = true) {
  await Promise.all([tickRoutes(), refreshIP ? tickIPs() : Promise.resolve()]);
}

function isAdmin(req) {
  const context = req.context || {};
  const principal = context.principal || {};
  return context.role === "admin" || Array.isArray(principal.roles) && principal.roles.includes("admin");
}

function respond(res, status, data) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.setHeader("Cache-Control", "no-store");
  res.end(JSON.stringify(data));
}

async function load() {
  const snapshots = [storage + "/network-state.json", statePath].flatMap((path) => [path + ".0", path + ".1"]);
  for (const path of snapshots) {
    try {
      const saved = JSON.parse(await fs.promises.readFile(path, "utf8"));
      if (saved && saved.nodes && Array.isArray(saved.jobs) && Number.isInteger(saved.revision) && saved.revision > revision) {
        state = {
          nodes: saved.nodes, jobs: saved.jobs, ip_attempts: saved.ip_attempts || {},
          manual_routes: Array.isArray(saved.manual_routes) ? saved.manual_routes : [],
          manual_ips: Array.isArray(saved.manual_ips) ? saved.manual_ips : [],
          ip_next_query_at: Number.isFinite(saved.ip_next_query_at) && saved.ip_next_query_at > 0 ? saved.ip_next_query_at : 0,
          ip_cooldown_until: Number.isFinite(saved.ip_cooldown_until) && saved.ip_cooldown_until > 0 ? saved.ip_cooldown_until : 0,
          ipregistry_retry_at: Number.isFinite(saved.ipregistry_retry_at) && saved.ipregistry_retry_at > 0 ? saved.ipregistry_retry_at : 0,
        };
        revision = saved.revision;
      }
    } catch (error) {
      if (error.code !== "ENOENT") console.error("一份网络识别缓存未能读取，尝试另一份快照");
    }
  }
  if (revision > 0) scheduledSnapshot = JSON.stringify(state);
  server.route("GET", "/api/public/lumina-network/v1/results", async (req, res) => {
    try {
      const raw = await server.getConfig();
      const admin = isAdmin(req);
      if (!admin && !raw.guest_visible && !raw.ip_guest_visible) return respond(res, 200, { available: false, nodes: [] });
      let routeConfig, ipConfig, routeConfigError, ipConfigError;
      const nodes = await server.call("admin:listClients", {});
      try { routeConfig = await loadRouteConfig(raw, nodes); }
      catch (error) {
        routeConfigError = String(error.message);
        routeConfig = { ...core.normalizeRouteConfig({ targets: [], enabled: false }), route_unavailable: true };
      }
      try { ipConfig = core.normalizeIPConfig(raw); }
      catch (error) {
        ipConfigError = String(error.message);
        ipConfig = { ...core.normalizeIPConfig({ ip_enabled: false }), ip_unavailable: true };
      }
      const result = core.visibleData(nodes, state, { ...routeConfig, ...ipConfig }, admin, Date.now());
      if (admin) {
        result.error = routeConfigError || routeError;
        const registry = ipConfig.ip_source === "ipregistry";
        const retryAt = registry ? state.ipregistry_retry_at : state.ip_cooldown_until;
        const cooldown = retryAt > Date.now()
          ? ipSource.sourceName(ipConfig.ip_source) + " 请求受限，" + (registry ? "查询" : "自动查询") + "暂停至 " + new Date(retryAt).toISOString().slice(0, 19).replace("T", " ") + (registry ? " UTC；按接口要求等待后重试" : " UTC；手动刷新可绕过冷却")
          : null;
        result.ip_error = ipConfigError || ipError || cooldown;
      }
      respond(res, 200, result);
    } catch (_) { respond(res, 503, { error: "网络识别数据暂时不可用" }); }
  });
  server.route("POST", "/api/admin/lumina-network/v1/validate", async (req, res) => {
    if (!isAdmin(req)) return respond(res, 403, { error: "请先登录管理员账号" });
    try {
      const body = typeof req.body === "string" ? JSON.parse(req.body) : JSON.parse(String(req.body));
      core.normalizeConfig(body);
      respond(res, 200, { ok: true, independent_ip: true, homepage_targets: true, ip_sources: ["ipinfo", "ipregistry"] });
    } catch (error) { respond(res, 400, { error: String(error.message || "配置无效") }); }
  });
  // 两个旧入口均只检测回程；IP 信息使用独立入口，不再附带触发另一项任务。
  for (const path of ["run", "detect", "ip-refresh"]) {
    server.route("POST", "/api/admin/lumina-network/v1/" + path, async (req, res) => {
      if (!isAdmin(req)) return respond(res, 403, { error: "请先登录管理员账号" });
      try {
        const ipOnly = path === "ip-refresh";
        const raw = await server.getConfig();
        const nodes = await server.call("admin:listClients", {});
        const config = ipOnly ? core.normalizeIPConfig(raw) : await loadRouteConfig(raw, nodes);
        const result = ipOnly ? enqueueIPs(nodes, config) : enqueueRoutes(nodes, config);
        await saveState();
        respond(res, 202, result);
        setTimeout(ipOnly ? tickIPs : tickRoutes, 0);
      } catch (error) { respond(res, 400, { error: String(error.message || "无法启动查询或检测") }); }
    });
  }
  server.cron("@every 10s", tickRoutes);
  server.cron("@every 10s", tickIPs);
  // load 只登记工作，不等待任何远程检测，避免占用插件初始化时限。
  setTimeout(tick, 1000);
}

async function unload() {
  stopped = true;
  if (ipController) ipController.abort();
  await saveChain;
}

globalThis.load = load;
globalThis.unload = unload;
