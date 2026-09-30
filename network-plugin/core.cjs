"use strict";

const { classifyRoute } = require("./route.cjs");
const ipSource = require("./ip.cjs");
const NETWORKS = {
  AS4809: "CN2", AS4134: "163", AS4847: "163", AS9929: "9929", AS10099: "10099",
  AS4837: "4837", AS4808: "4837", AS58807: "CMIN2", AS58453: "CMI", AS9808: "移动骨干",
};

function number(value, fallback, min, max, label) {
  const n = value === undefined ? fallback : Number(value);
  if (!Number.isInteger(n) || n < min || n > max) throw new Error(label + "超出允许范围");
  return n;
}

function parseAddress(input) {
  const address = String(input || "").trim();
  const match = address.match(/^(?:\[([0-9a-fA-F:]+)\]|([a-zA-Z0-9][a-zA-Z0-9.-]*))(?::([0-9]+))?$/);
  if (!match) throw new Error("测试地址应为域名:端口、IPv4:端口或 [IPv6]:端口");
  const host = match[1] || match[2];
  if (host.length > 253 || host.includes("..")) throw new Error("测试地址无效");
  const port = number(match[3], 80, 1, 65535, "端口");
  return { host, port };
}

function normalizeRouteConfig(raw) {
  raw = raw || {};
  const path = String(raw.nexttrace_path || "nexttrace").trim();
  if (!/^(?:nexttrace|\/[a-zA-Z0-9_./-]+)$/.test(path)) throw new Error("NextTrace 路径须为 nexttrace 或绝对路径");
  let nodes = raw.nodes || [];
  if (typeof nodes === "string") { try { nodes = JSON.parse(nodes); } catch (_) { nodes = []; } }
  return {
    enabled: raw.enabled !== false,
    guest_visible: raw.guest_visible === true, show_home: raw.show_home !== false,
    show_details: raw.show_details !== false, all_nodes: raw.all_nodes !== false,
    nodes: Array.isArray(nodes) ? nodes.filter((id) => typeof id === "string") : [],
    interval_minutes: number(raw.interval_minutes, 360, 5, 43200, "检测间隔（5 至 43200 分钟）"),
    concurrency: number(raw.concurrency, 2, 1, 8, "同时检测数量"),
    nexttrace_path: path, targets: [],
  };
}

function normalizeIPConfig(raw) {
  raw = raw || {};
  const source = raw.ip_source === undefined ? "ipinfo" : raw.ip_source;
  if (source !== "ipinfo" && source !== "ipregistry") throw new Error("请选择 IPinfo 或 IPregistry 数据来源");
  const key = source === "ipregistry" ? ipSource.apiKey(raw.ipregistry_api_key) : "";
  return {
    ip_enabled: raw.ip_enabled !== false, ip_source: source,
    ipregistry_api_key: key,
    ip_guest_visible: raw.ip_guest_visible === true,
    show_asn: raw.show_asn !== false, show_organization: raw.show_organization !== false,
    show_ip_type: raw.show_ip_type !== false,
    ip_interval_hours: number(raw.ip_interval_hours, 24, 1, 720, "IP 信息更新间隔"),
  };
}

function normalizeConfig(raw) {
  return { ...normalizeRouteConfig(raw), ...normalizeIPConfig(raw) };
}

function shellQuote(value) { return "'" + String(value).replace(/'/g, "'\\''") + "'"; }

function traceCommand(config, target) {
  // 目标和程序路径先校验，再作为单个参数引用；不接受任意命令模板。
  const args = [config.nexttrace_path, "-j"];
  if (target.protocol !== "icmp") args.push("-T", "-p", target.port);
  if (target.family === 4 || target.family === 6) args.push("-" + target.family);
  args.push("-q", 1, "-m", 30, "-n", "-M", target.host);
  return "LC_ALL=C timeout -k 5s 90s " + args.map(shellQuote).join(" ");
}

function traceJSON(output) {
  const text = String(output || "").replace(/\x1b\[[0-9;]*m/g, "");
  if (text.length > 1024 * 1024) throw new Error("探测输出过大");
  // 部分版本会在 JSON 前输出提示，逐个完整对象尝试解析，避免依赖首行位置。
  for (let start = text.indexOf("{"); start >= 0; start = text.indexOf("{", start + 1)) {
    let depth = 0, quoted = false, escaped = false, closed = false;
    for (let i = start; i < text.length; i++) {
      const c = text[i];
      if (quoted) {
        if (escaped) escaped = false;
        else if (c === "\\") escaped = true;
        else if (c === '"') quoted = false;
      } else if (c === '"') quoted = true;
      else if (c === "{") depth++;
      else if (c === "}" && --depth === 0) {
        closed = true;
        try {
          const parsed = JSON.parse(text.slice(start, i + 1));
          if (Array.isArray(parsed.Hops) || Array.isArray(parsed.hops)) return parsed;
        } catch (_) { /* 继续寻找完整结果 */ }
        start = i;
        break;
      }
    }
    if (!closed) break;
  }
  throw new Error("未收到有效的 NextTrace JSON 结果");
}

function normalizeASN(value) {
  const match = String(value || "").trim().match(/^(?:AS)?([1-9][0-9]*)$/i);
  return match ? "AS" + match[1] : null;
}

function networkForHop(hop) {
  const asn = normalizeASN(hop.asn);
  if (asn) return NETWORKS[asn] ? { asn, name: NETWORKS[asn] } : null;
  const ip = String(hop.ip || "").toLowerCase();
  // 旧主题兼容标签使用原有前缀兜底；新主题读取独立的最终线路结论。
  const inferred = /^59\.43\./.test(ip) ? "AS4809"
    : /^(?:202\.(?:96|97)\.|219\.14[12]\.|106\.37\.|240e:)/.test(ip) ? "AS4134"
      : /^(?:210\.(?:14|51|78)\.|218\.105\.|2408:8120:)/.test(ip) ? "AS9929"
        : /^(?:219\.158\.|2408:)/.test(ip) ? "AS4837"
          : /^(?:223\.(?:119|120)\.)/.test(ip) ? "AS58453"
            : /^(?:221\.183\.|111\.(?:24|13)\.|2409:8080:)/.test(ip) ? "AS9808"
              : /^2402:4f00:f000:/.test(ip) ? "AS58807" : null;
  return inferred ? { asn: inferred, name: NETWORKS[inferred] } : null;
}

// 仅供旧主题兼容；新版主题使用 classifyRoute 给出的 route_label。
function primaryNetwork(hops, carrier, savedNetworks) {
  const observed = (Array.isArray(hops) ? hops : []).map(networkForHop).filter(Boolean);
  if (!observed.length && Array.isArray(savedNetworks)) {
    for (const network of savedNetworks) {
      const asn = normalizeASN(network.asn);
      if (NETWORKS[asn]) observed.push({ asn, name: NETWORKS[asn] });
    }
  }
  const preferred = carrier === "ct" ? ["AS4809", "AS4134", "AS4847"]
    : carrier === "cu" ? ["AS9929", "AS4837", "AS4808", "AS10099"]
      : carrier === "cm" ? ["AS58807", "AS58453", "AS9808"] : [];
  for (const asn of preferred) {
    const match = observed.find((network) => network.asn === asn);
    if (match) return [match];
  }
  return observed.length ? [observed[observed.length - 1]] : [];
}

function parseTrace(output, exitCode, carrier) {
  const parsed = traceJSON(output);
  const buckets = parsed.Hops || parsed.hops;
  const hops = [];
  buckets.slice(0, 64).forEach((bucket, index) => {
    const attempts = Array.isArray(bucket) ? bucket : bucket ? bucket.attempts || [bucket] : [];
    if (!attempts.length) attempts.push({ Success: false, TTL: index + 1 });
    attempts.slice(0, 5).forEach((attempt) => {
      if (!attempt) return;
      const geo = attempt.Geo || attempt.geo || {};
      const address = attempt.Address || attempt.address;
      const ip = typeof address === "string" ? address : address && address.IP || attempt.ip || null;
      const responded = attempt.Success === true || attempt.success === true;
      hops.push({
        ttl: Number(attempt.TTL || (bucket && bucket.ttl) || index + 1),
        ip: responded ? ip : null,
        asn: responded ? normalizeASN(geo.asnumber || attempt.asn) : null,
        owner: responded ? String(geo.owner || geo.isp || "").slice(0, 120) : "",
        location: responded ? [geo.country, geo.prov, geo.city].filter(Boolean).join(" ").slice(0, 120) : "",
        rtt_ms: responded ? (typeof attempt.rtt_ms === "number" ? attempt.rtt_ms : typeof attempt.RTT === "number" ? attempt.RTT / 1e6 : null) : null,
      });
    });
  });
  const asns = [...new Set(hops.map((hop) => hop.asn).filter(Boolean))];
  const networks = primaryNetwork(hops, carrier);
  const reason = (parsed.StopReason || parsed.stop_reason || {}).reason;
  const reached = reason === "destination_reached" ? true : reason ? false : null;
  const complete = exitCode === 0 && reached === true;
  return { hops, asns, networks, route_label: classifyRoute(hops, carrier), reached, status: complete ? "ok" : "partial" };
}

function selectedNodes(nodes, config) {
  return nodes.filter((node) => config.all_nodes || config.nodes.includes(node.uuid));
}

function targetsForNode(config, uuid) {
  return config.targets_by_node ? config.targets_by_node.get(uuid) || [] : config.targets;
}

function visibleData(nodes, state, config, admin, now) {
  const routeVisible = (admin || config.guest_visible) && !config.route_unavailable;
  const ipVisible = (admin || config.ip_guest_visible) && !config.ip_unavailable;
  if (!routeVisible && !ipVisible) return { available: false, nodes: [] };
  const targets = new Set(config.targets.map((target) => target.key));
  const selected = new Set(selectedNodes(nodes, config).map((node) => node.uuid));
  return {
    available: true, independent_ip: true, homepage_targets: true, ip_available: ipVisible,
    show_home: routeVisible && config.show_home, show_details: routeVisible && config.show_details,
    show_asn: ipVisible && config.show_asn, show_organization: ipVisible && config.show_organization,
    show_ip_type: ipVisible && config.show_ip_type,
    interval_minutes: config.interval_minutes,
    nodes: nodes.filter((node) => admin || !node.hidden).map((node) => {
      const saved = state.nodes[node.uuid] || {};
      const addresses = [node.ipv4, node.ipv6].filter(Boolean).map((address) => String(address).trim());
      return {
        uuid: node.uuid,
        ips: (ipVisible ? saved.ips || [] : []).filter((ip) => addresses.includes(ip.address) && ip.provider === config.ip_source).map((ip) => ({
          family: ip.family, asn: ip.asn, organization: ip.organization, type: ip.type,
          source: ip.source, checked_at: ip.checked_at,
          stale: now - Date.parse(ip.checked_at) > config.ip_interval_hours * 3600000,
          error: ip.error || null,
          ...(admin ? { address: ip.address } : {}),
        })),
        routes: (routeVisible && selected.has(node.uuid) ? targetsForNode(config, node.uuid) : []).map((target) => {
          const route = (saved.routes || []).find((item) => item.key === target.key && targets.has(item.key));
          const running = state.jobs.some((job) => job.uuid === node.uuid && job.target.key === target.key);
          return {
            region: target.region, carrier: target.carrier, family: target.family, address: target.address,
            task_id: target.task_id, task_name: target.task_name,
            status: target.error ? "error" : route ? (route.status === "partial" && route.reached === true && !route.error ? "ok" : route.status) : "pending",
            checked_at: route ? route.checked_at || null : null,
            // 有跳点的旧缓存直接按新规则重算，不改检测时间，也不派发新任务。
            route_label: route ? (Array.isArray(route.hops) ? classifyRoute(route.hops, target.carrier) : undefined) : null,
            networks: route ? primaryNetwork(route.hops, target.carrier, route.networks) : [], asns: route ? route.asns : [],
            reached: route ? route.reached : null, error: target.error || (route ? route.error || null : null),
            running, stale: route ? now - Date.parse(route.checked_at) > config.interval_minutes * 60000 : false,
            ...(admin ? { hops: route ? route.hops : [] } : {}),
          };
        }),
      };
    }),
  };
}

module.exports = { normalizeConfig, normalizeRouteConfig, normalizeIPConfig, parseAddress, traceCommand, parseTrace, selectedNodes, targetsForNode, visibleData };
