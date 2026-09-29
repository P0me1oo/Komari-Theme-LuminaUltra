"use strict";

const { isIP } = require("node:net");
const core = require("./core.cjs");

// 与主题的主页选择规则保持一致：三项完整才启用覆盖，单线路按编号取首个绑定。
function taskIds(value) {
  const ids = [];
  for (const raw of Array.isArray(value) ? value : []) {
    const id = typeof raw === "number" ? raw : typeof raw === "string" && /^\d+$/.test(raw) ? Number(raw) : 0;
    if (Number.isSafeInteger(id) && id > 0 && !ids.includes(id)) ids.push(id);
    if (ids.length === 3) break;
  }
  return ids;
}

function selections(nodes, settings) {
  const single = new Map();
  const bindings = settings.homepagePingBindings;
  if (bindings && typeof bindings === "object" && !Array.isArray(bindings)) {
    for (const [rawId, clients] of Object.entries(bindings).sort(([a], [b]) => Number(a) - Number(b))) {
      const [id] = taskIds([rawId]);
      if (!id || !Array.isArray(clients)) continue;
      for (const rawUuid of clients) {
        const uuid = typeof rawUuid === "string" ? rawUuid.trim() : "";
        if (uuid && !single.has(uuid)) single.set(uuid, id);
      }
    }
  }
  const overrides = new Map();
  const rawOverrides = settings.homepageMultiPingNodeTaskIds;
  if (rawOverrides && typeof rawOverrides === "object" && !Array.isArray(rawOverrides)) {
    for (const [uuid, value] of Object.entries(rawOverrides).sort(([a], [b]) => a.trim().localeCompare(b.trim()))) {
      const ids = taskIds(value);
      if (uuid.trim() && ids.length === 3) overrides.set(uuid.trim(), ids);
    }
  }
  const global = taskIds(settings.homepageMultiPingTaskIds);
  return new Map(nodes.map((node) => {
    const ids = settings.enableHomepageMultiPing === true ? overrides.get(node.uuid) || global : [];
    // 迷你卡片和列表仍使用单线路；同一个探测点只检测一次。
    return [node.uuid, [...new Set([...(ids.length === 3 ? ids : []), ...(single.has(node.uuid) ? [single.get(node.uuid)] : [])])]];
  }));
}

function parseTask(task) {
  const address = String(task.target || "").trim();
  const type = String(task.type || "icmp").toLowerCase();
  let endpoint = address;
  let protocol = type;
  let defaultPort = 80;
  if (type === "http") {
    const url = address.match(/^(https?):\/\/([^/?#]+)(?:[/?#].*)?$/i);
    if (!url) throw new Error("HTTP 探测点地址无效");
    endpoint = url[2];
    defaultPort = url[1].toLowerCase() === "https" ? 443 : 80;
    protocol = "tcp";
  } else if (type !== "icmp" && type !== "tcp") {
    throw new Error("暂不支持此探测类型");
  }
  let host, port;
  if (type === "icmp" && isIP(endpoint)) {
    host = endpoint;
    port = 80;
  } else {
    const parsed = core.parseAddress(endpoint);
    host = parsed.host;
    port = /:\d+$/.test(endpoint) ? parsed.port : defaultPort;
    if (type === "icmp" && /:\d+$/.test(endpoint)) throw new Error("ICMP 探测点不能包含端口");
  }
  if (host.includes(":") && isIP(host) !== 6) throw new Error("IPv6 探测点地址无效");
  return { host, port, protocol, family: isIP(host) };
}

function carrierFromName(name) {
  const matches = [
    ["ct", /电信|telecom|(?:^|[\s_-])ct(?:$|[\s_-])/i],
    ["cu", /联通|unicom|(?:^|[\s_-])cu(?:$|[\s_-])/i],
    ["cm", /移动|mobile|(?:^|[\s_-])cm(?:$|[\s_-])/i],
  ].filter(([, pattern]) => pattern.test(name));
  return matches.length === 1 ? matches[0][0] : null;
}

function resolveConfig(raw, nodes, site, tasks) {
  // 升级后忽略旧的自定义地址，始终从当前主题和 Komari 探测任务读取。
  const config = core.normalizeRouteConfig(raw);
  config.targets_by_node = new Map();
  if (!site || site.theme !== "LuminaUltra") throw new Error("请先启用 LuminaUltra 主题并设置主页延迟检测");
  if (!Array.isArray(tasks)) throw new Error("未能读取主页延迟探测任务");
  const selected = selections(core.selectedNodes(nodes, config), site.theme_settings || {});
  const byId = new Map(tasks.map((task) => [Number(task.id), task]));
  for (const [uuid, ids] of selected) {
    const targets = ids.map((id) => {
      const task = byId.get(id);
      const name = String(task?.name || "探测点 #" + id);
      const address = String(task?.target || "").trim();
      const target = {
        key: JSON.stringify(["ping", id, task?.type || "icmp", address]),
        task_id: id, task_name: name, region: "", carrier: carrierFromName(name),
        address, family: 0,
      };
      try {
        if (!task) throw new Error("主页选择的探测点已删除，请重新选择");
        Object.assign(target, parseTask(task));
        if (!Array.isArray(task.clients) || !task.clients.includes(uuid)) throw new Error("探测点未在后台绑定此服务器");
      } catch (error) { target.error = String(error.message); }
      return target;
    });
    config.targets_by_node.set(uuid, targets);
  }
  config.targets = [...new Map([...config.targets_by_node.values()].flat().map((target) => [target.key, target])).values()];
  return config;
}

module.exports = { selections, parseTask, resolveConfig };
