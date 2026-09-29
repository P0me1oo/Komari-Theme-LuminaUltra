"use strict";

// 使用文档示例地址和骨干特征前缀，不保存真实节点名称、地址或任务输出。
function path(...entries) {
  return entries.map((entry, index) => ({
    ttl: index + 1,
    ip: entry === null ? null : Array.isArray(entry) ? entry[0] : `203.0.113.${index + 1}`,
    asn: entry === null ? null : Array.isArray(entry) ? entry[1] : entry,
  }));
}

const cases = [
  { name: "联通方向的 CN2 不被末端 163 和地方联通覆盖", carrier: "cu", hops: path("AS4134", ["59.43.1.1", null], null, ["59.43.2.1", null], "AS4134", "AS17816", "AS136958"), expected: "CN2GIA" },
  { name: "电信方向保留 CN2", carrier: "ct", hops: path("AS64500", "AS4809", "AS4134"), expected: "CN2GIA" },
  { name: "CN2 地址特征优先于冲突的 ASN", carrier: "cu", hops: path(["59.43.1.1", "AS4134"], "AS4134", "AS136958"), expected: "CN2GIA" },
  { name: "CN2GT 特征出口后进入 163", carrier: "ct", hops: path(["59.43.245.1", null], null, ["59.43.1.1", null], "AS4134"), expected: "CN2GT" },
  { name: "CN2GT 出口后进入地方电信", carrier: "ct", hops: path(["59.43.245.1", null], "AS4812"), expected: "CN2GT" },
  { name: "非电信目标不套用地方电信接入判断", carrier: "cu", hops: path(["59.43.245.1", null], "AS4812"), expected: "CN2GIA" },
  { name: "CN2GT 出口后先进入其他网络不能跳过它查找 163", carrier: "ct", hops: path(["59.43.245.1", null], "AS64500", "AS4134"), expected: "CN2GIA" },
  { name: "没有特征出口不能仅凭 CN2 后出现 163 判断 GT", carrier: "ct", hops: path(["59.43.1.1", null], "AS4134"), expected: "CN2GIA" },
  { name: "CN2 与电信国际网络组成 CTGGIA", carrier: "ct", hops: path("AS23764", ["59.43.1.1", null], "AS4134"), expected: "CTGGIA" },
  { name: "GT 判断优先于电信国际组合", carrier: "ct", hops: path("AS23764", ["59.43.245.1", null], "AS4134"), expected: "CN2GT" },
  { name: "只有电信国际网络仍可识别", carrier: "ct", hops: path("AS23764"), expected: "CTGGIA" },
  { name: "电信国际地址缺少 ASN 时兜底", carrier: "ct", hops: path(["203.22.178.1", null]), expected: "CTGGIA" },
  { name: "电信国际段不能提前覆盖后续 163", carrier: "ct", hops: path("AS23764", "AS4134"), expected: "163" },
  { name: "只看到海外 CN2 IPv6 段时保留未知", carrier: "ct", hops: path(["2605:9d80::1", "AS4809"]), expected: null },
  { name: "IPv6 ASN 能识别 CN2", carrier: "ct", hops: path(["2001:db8::1", "AS4809"]), expected: "CN2GIA" },
  { name: "联通国际段接精品骨干", carrier: "cu", hops: path("AS10099", "AS9929", "AS136958"), expected: "10099->9929" },
  { name: "联通国际段接普通骨干", carrier: "cu", hops: path("AS10099", "AS4837"), expected: "10099->4837" },
  { name: "联通国际段后只看到地方接入也按 TQ 推断", carrier: "cu", hops: path("AS10099", null, "AS136958"), expected: "10099->4837" },
  { name: "联通国际地址前缀补齐缺失 ASN", carrier: "cu", hops: path(["103.214.1.1", null], ["218.105.1.1", null]), expected: "10099->9929" },
  { name: "联通国际 IPv6 前缀补齐缺失 ASN", carrier: "cu", hops: path(["2401:8a00::1", null]), expected: "10099" },
  { name: "联通国际前缀不覆盖明确的其他 ASN", carrier: "cu", hops: path(["103.214.1.1", "AS64500"]), expected: null },
  { name: "国际段出现在国内段之后不反转顺序", carrier: "cu", hops: path("AS4837", "AS10099", "AS9929"), expected: "9929" },
  { name: "只见地方联通 AS17816 时按 TQ 推断 4837", carrier: "cu", hops: path("AS64500", null, "AS17816"), expected: "4837" },
  { name: "只见联通目标 AS136958 时按 TQ 推断 4837", carrier: "cu", hops: path("AS64500", null, "AS136958"), expected: "4837" },
  { name: "识别其他地方联通网络", carrier: "cu", hops: path("AS135061", "AS140979"), expected: "4837" },
  { name: "电信转联通保留转接组合", carrier: "cu", hops: path("AS4134", "AS17816"), expected: "163->4837" },
  { name: "移动国际转联通保留转接组合", carrier: "cu", hops: path("AS58453", "AS4837"), expected: "CMI->4837" },
  { name: "移动精品转联通压缩为首尾两段", carrier: "cu", hops: path("AS58807", "AS9808", "AS9929"), expected: "CMIN2->9929" },
  { name: "混合转接按 TQ 优先保留移动段", carrier: "cu", hops: path("AS4134", "AS58453", "AS17816"), expected: "CMI->4837" },
  { name: "电信目标不覆盖前面的联通国际和精品骨干", carrier: "ct", hops: path("AS10099", "AS9929", "AS4134"), expected: "10099->9929" },
  { name: "IPv6 联通精品精确前缀优先", carrier: "cu", hops: path(["2408:8120::1", null]), expected: "9929", tqExpected: "4837" },
  { name: "IPv6 联通普通骨干前缀", carrier: "cu", hops: path(["2408:8000::1", null]), expected: "4837" },
  { name: "普通电信骨干", carrier: "ct", hops: path("AS4134"), expected: "163" },
  { name: "地方电信 ASN 兜底", carrier: "ct", hops: path("AS4812"), expected: "163" },
  { name: "地方电信地址前缀兜底", carrier: "ct", hops: path(["101.95.1.1", null]), expected: "163" },
  { name: "电信 IPv6 前缀兜底", carrier: "ct", hops: path(["240e::1", null]), expected: "163" },
  { name: "移动精品优先于普通移动段", carrier: "cm", hops: path("AS58807", "AS9808"), expected: "CMIN2" },
  { name: "移动国内骨干按 TQ 归类 CMI", carrier: "cm", hops: path("AS9808"), expected: "CMI" },
  { name: "地方移动骨干 AS56040", carrier: "cm", hops: path("AS56040"), expected: "CMI" },
  { name: "地方移动接入 ASN", carrier: "cm", hops: path("AS132510"), expected: "CMI" },
  { name: "地方移动接入地址", carrier: "cm", hops: path(["183.201.1.1", null]), expected: "CMI" },
  { name: "移动精品 IPv6 前缀", carrier: "cm", hops: path(["2402:4f00:f000::1", null]), expected: "CMIN2" },
  { name: "保留途经教育网的识别", carrier: "ct", hops: path("AS4538"), expected: "CERNET" },
  { name: "教育网 IPv6 前缀", carrier: "ct", hops: path(["2001:da8::1", null]), expected: "CERNET2" },
  { name: "没有可识别路径不猜测目标线路", carrier: "cu", hops: path("AS64500", null), expected: null },
  { name: "全部未响应保留未知", carrier: "ct", hops: path(null, null), expected: null },
];

module.exports = { path, cases };
