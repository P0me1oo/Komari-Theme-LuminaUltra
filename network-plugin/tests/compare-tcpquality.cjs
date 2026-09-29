"use strict";

// 仅提取并执行参考项目的纯判断函数，不运行其安装、探测或上传逻辑。
// 用法：node network-plugin/tests/compare-tcpquality.cjs ../TcpQuality/runTcpQuality-core.sh
const fs = require("node:fs");
const { spawnSync } = require("node:child_process");
const assert = require("node:assert/strict");
const { classifyRoute } = require("../route.cjs");
const { cases } = require("./route-cases.cjs");

if (!process.argv[2]) throw new Error("请提供 TcpQuality 主脚本路径");
const source = fs.readFileSync(process.argv[2], "utf8");
const start = source.indexOf("route_label_from_ip_trace() {");
const end = source.indexOf("\neducation_route_label_from_ip_trace()", start);
if (start < 0 || end < 0) throw new Error("参考项目的判断函数已变化，请先核对源码");
const classifier = source.slice(start, end);
const quote = (value) => "'" + String(value).replace(/'/g, "'\\''") + "'";
const carriers = { ct: "电信", cu: "联通", cm: "移动" };
let differences = 0;

for (const sample of cases) {
  const visible = sample.hops.filter((hop) => hop.ip);
  const trace = visible.map((hop) => `${hop.ttl} ${hop.ip} 1 ms`).join("\n") + "\n";
  const map = visible.filter((hop) => hop.asn).map((hop) => `${hop.ip}|${hop.asn.replace(/^AS/i, "")}|`).join("\n") + "\n";
  const ips = visible.map((hop) => hop.ip).join("\n") + "\n";
  const command = classifier + "\nroute_label_from_ip_trace " + [trace, map, ips].map((text) => `<(printf '%s' ${quote(text)})`).join(" ") + " " + quote(carriers[sample.carrier]) + "\n";
  const result = spawnSync("bash", ["-s"], { input: command, encoding: "utf8", timeout: 10000 });
  if (result.error || result.status !== 0) throw new Error(result.error?.message || result.stderr || "参考判断执行失败");
  const reference = result.stdout.trim();
  const expected = sample.tqExpected ?? sample.expected ?? "Hidden";
  assert.equal(reference, expected, sample.name + "：TQ 参考结果不符");
  assert.equal(classifyRoute(sample.hops, sample.carrier), sample.expected, sample.name + "：插件结果不符");
  if (sample.tqExpected !== undefined) {
    differences++;
    console.log("保留差异：" + sample.name + "，TQ=" + reference + "，插件=" + sample.expected);
  }
}
console.log(`已对照 ${cases.length} 组路径，${cases.length - differences} 组一致，${differences} 组为明确保留的精确前缀修正。`);
