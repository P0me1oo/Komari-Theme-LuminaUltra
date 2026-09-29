"use strict";

// 三网主规则参考 TcpQuality c2295ae；探测和 ASN 查询仍由现有 NextTrace 完成。
const CT_ACCESS = new Set(["4134", "4811", "4812", "4847", "23724", "134756", "133776", "139201", "139203", "148969", "38283", "58540", "58563"]);
const CU_BACKBONE = new Set(["9929", "4837", "4808"]);
const CU_ACCESS = new Set(["17816", "135061", "136958", "140979"]);
const CM_ACCESS = new Set(["24547", "132510"]);
const EDUCATION = { "23911": "CERNET2", "23910": "CERNET2", "4538": "CERNET", "7497": "CSTNET" };
const CN2_IP = /^59\.43\./;
const CTG_IP = /^(?:203\.22\.(?:182|178|179)\.|203\.128\.224\.|69\.194\.|2400:9380:)/;
const CT_IP = /^(?:202\.(?:96|97)\.|219\.14[12]\.|106\.37\.|240e:)/;
const CT_ACCESS_IP = /^(?:1\.202\.|27\.129\.|36\.(?:110|112)\.|58\.213\.|101\.(?:95|226)\.|106\.227\.|111\.74\.|117\.(?:21|68)\.|124\.127\.|140\.249\.|180\.102\.|183\.47\.|219\.148\.|220\.181\.)/;
const CU_INTL_IP = /^(?:103\.(?:214\.|228\.68\.|239\.176\.)|118\.26\.151\.|162\.219\.(?:3[2-9]|85)\.|162\.245\.124\.|202\.77\.23\.|203\.160\.(?:66|75)\.|2401:8a00:)/;
const CU_PREMIUM_IP = /^(?:210\.(?:14|51|78)\.|218\.105\.|2408:8120:)/;
const CU_IP = /^(?:219\.158\.|2408:)/;
const CMI_IP = /^223\.(?:119|120)\./;
const CM_IP = /^(?:221\.183\.|111\.(?:24|13)\.|2409:8080:)/;
const CMIN2_IP = /^2402:4f00:f000:/;
const CM_ACCESS_IP = /^(?:111\.63\.|183\.(?:201|203)\.)/;
const CERNET_IP = /^(?:59\.64\.|101\.(?:4|76)\.|111\.114\.|113\.54\.|115\.(?:24|156)\.|183\.172\.|202\.(?:38\.19|11[2-9]\.|120\.|19[4678]\.|20[0127]\.)|210\.(?:2[6-9]|3[0-9]|4[0-7])\.|219\.22[4-9]\.|222\.(?:1[6-9]|2[0-3]|19[2-9]|20[0-7])\.)/;

function asnNumber(value) {
  const match = String(value || "").trim().match(/^(?:AS)?([1-9][0-9]*)$/i);
  return match ? match[1] : "";
}

function publicIP(value) {
  const ip = String(value || "").trim().toLowerCase().split("%")[0];
  if (ip.includes(":")) {
    return /^[0-9a-f:]+$/.test(ip) && !/^(?:::1$|::$|fe80:|fc|fd)/.test(ip) ? ip : "";
  }
  const parts = ip.split(".");
  if (parts.length !== 4 || parts.some((part) => !/^\d{1,3}$/.test(part) || Number(part) > 255)) return "";
  const [a, b] = parts.map(Number);
  if (a === 0 || a === 10 || a === 127 || a >= 224 ||
      (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) ||
      (a === 198 && (b === 18 || b === 19))) return "";
  return parts.map(Number).join(".");
}

function inferASN(ip) {
  if (CN2_IP.test(ip)) return "4809";
  if (CTG_IP.test(ip)) return "23764";
  if (CT_IP.test(ip)) return "4134";
  // 保留更具体的 IPv6 精品前缀，不能被普通联通的 2408: 覆盖。
  if (CU_PREMIUM_IP.test(ip)) return "9929";
  if (CU_IP.test(ip)) return "4837";
  if (CMI_IP.test(ip)) return "58453";
  if (CM_IP.test(ip)) return "9808";
  if (CMIN2_IP.test(ip)) return "58807";
  if (CU_INTL_IP.test(ip)) return "10099";
  if (CERNET_IP.test(ip)) return "4538";
  if (/^2001:252:/.test(ip)) return "23911";
  if (/^(?:2001:(?:da8|250):|2402:f000:)/.test(ip)) return "23910";
  if (/^159\.226\./.test(ip)) return "7497";
  return "";
}

function routeHops(hops) {
  const unique = new Map();
  const ordered = (Array.isArray(hops) ? hops : []).filter(Boolean).slice(0, 320)
    .sort((a, b) => (Number(a.ttl) || 0) - (Number(b.ttl) || 0));
  for (const hop of ordered) {
    const ip = publicIP(hop.ip);
    if (!ip) continue;
    const asn = asnNumber(hop.asn);
    if (!unique.has(ip)) unique.set(ip, { ip, asn });
    else if (asn) unique.get(ip).asn = asn;
  }
  return [...unique.values()].map((hop) => ({ ...hop, asn: hop.asn || inferASN(hop.ip) }));
}

function telecom(hop) { return hop.asn === "4134" || hop.asn === "4847" || CT_IP.test(hop.ip); }
function telecomAccess(hop) { return CT_ACCESS.has(hop.asn) || CT_ACCESS_IP.test(hop.ip); }
function unicom(hop) { return CU_BACKBONE.has(hop.asn) || CU_ACCESS.has(hop.asn) || CU_PREMIUM_IP.test(hop.ip) || CU_IP.test(hop.ip); }
function unicomIntl(hop) { return hop.asn === "10099" || (!hop.asn && CU_INTL_IP.test(hop.ip)); }
function ctg(hop) { return hop.asn === "23764" || CTG_IP.test(hop.ip); }
function cmi(hop) { return hop.asn === "58453" || hop.asn === "9808" || /^5604[0-8]$/.test(hop.asn); }
function mobileAccess(hop) { return CM_ACCESS.has(hop.asn) || CM_ACCESS_IP.test(hop.ip); }

function unicomDomestic(hops) {
  if (hops.some((hop) => hop.asn === "9929" || CU_PREMIUM_IP.test(hop.ip))) return "9929";
  return hops.some((hop) => hop.asn === "4837" || hop.asn === "4808" || CU_ACCESS.has(hop.asn) || CU_IP.test(hop.ip)) ? "4837" : null;
}

function unicomRoute(hops, carrier) {
  const first = hops.findIndex((hop) => unicomIntl(hop) || unicom(hop));
  if (first < 0) return null;
  if (unicomIntl(hops[first])) {
    const domestic = unicomDomestic(hops.slice(first + 1));
    return domestic ? "10099->" + domestic : "10099";
  }
  const domestic = unicomDomestic(hops.slice(first));
  if (carrier === "cu" && domestic) {
    const before = hops.slice(0, first);
    // TQ 的三段组合压缩为首尾段；移动转联通优先于电信转联通。
    if (before.some((hop) => hop.asn === "58807")) return "CMIN2->" + domestic;
    if (before.some(cmi)) return "CMI->" + domestic;
    if (before.some(telecom)) return "163->" + domestic;
  }
  return domestic;
}

function cn2To163(hops, first, carrier) {
  for (let i = first; i < hops.length; i++) {
    if (!/^59\.43\.245\./.test(hops[i].ip)) continue;
    const next = hops.slice(i + 1).find((hop) => !CN2_IP.test(hop.ip));
    if (next) return telecom(next) || (carrier === "ct" && telecomAccess(next));
  }
  return false;
}

function mainland(hop, carrier) {
  if (unicomIntl(hop) || CU_BACKBONE.has(hop.asn)) return true;
  if (hop.asn === "4809") return !/^2605:9d80:/.test(hop.ip);
  if (telecom(hop) || (carrier === "ct" && telecomAccess(hop))) return true;
  // TQ 将电信国际段留到后续组合或兜底，不提前截断路径。
  if (ctg(hop)) return false;
  return hop.asn === "58807" || cmi(hop) || (carrier === "cm" && mobileAccess(hop)) || !!EDUCATION[hop.asn];
}

function mainlandLabel(hops, index, carrier) {
  const hop = hops[index];
  if (unicomIntl(hop)) return "10099";
  if (hop.asn === "9929") return "9929";
  if (hop.asn === "4837" || hop.asn === "4808") return "4837";
  if (telecom(hop) || (carrier === "ct" && telecomAccess(hop))) return "163";
  if (ctg(hop)) return null;
  if (hop.asn === "4809") {
    if (cn2To163(hops, index, carrier)) return "CN2GT";
    return hops.slice(index).some(ctg) ? "CTGGIA" : "CN2GIA";
  }
  if (hop.asn === "58807") return "CMIN2";
  if (cmi(hop) || (carrier === "cm" && mobileAccess(hop))) return "CMI";
  return EDUCATION[hop.asn] || null;
}

function classifyRoute(rawHops, carrier) {
  const hops = routeHops(rawHops);
  const firstCN2 = hops.findIndex((hop) => CN2_IP.test(hop.ip));
  const hasCTG = hops.some(ctg);
  // 先判断整条路径中的 CN2 特征，避免被目标运营商或末端 163 覆盖。
  if (firstCN2 >= 0) {
    if (cn2To163(hops, firstCN2, carrier)) return "CN2GT";
    return hasCTG ? "CTGGIA" : "CN2GIA";
  }
  const unicomLabel = unicomRoute(hops, carrier);
  if (unicomLabel) return unicomLabel;
  if (hops.some((hop) => hop.asn === "58807")) return "CMIN2";
  for (let i = 0; i < hops.length; i++) {
    if (!mainland(hops[i], carrier)) continue;
    const label = mainlandLabel(hops, i, carrier);
    if (label) return label;
  }
  const asns = new Set(hops.map((hop) => hop.asn));
  if (asns.has("23911")) return "CERNET2";
  if (asns.has("9929")) return "9929";
  if (asns.has("4837") || asns.has("4808")) return "4837";
  if (asns.has("4847")) return "163";
  if (["58453", "9808", "56040", "56041", "56042", "56044", "56045", "56046", "56047", "56048"].some((asn) => asns.has(asn))) return "CMI";
  if (hasCTG) return "CTGGIA";
  if (asns.has("23910")) return "CERNET2";
  if (asns.has("4538")) return "CERNET";
  if (asns.has("7497")) return "CSTNET";
  return null;
}

module.exports = { classifyRoute };
