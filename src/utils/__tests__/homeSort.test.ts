import { describe, expect, it } from "vitest";
import type { HomeNodeSummary } from "@/services/wsStore";
import {
  reconcileSpeedOrder,
  sortHomeNodes,
  type HomeSortContext,
  type HomeSortDirection,
  type HomeSortField,
} from "@/utils/homeSort";

function node(partial: Partial<HomeNodeSummary> & Pick<HomeNodeSummary, "uuid">): HomeNodeSummary {
  return {
    group: "",
    hidden: false,
    region: "",
    online: true,
    cpuPct: 0,
    trafficDown: 0,
    trafficUp: 0,
    netDown: 0,
    netUp: 0,
    ramUsed: 0,
    ramTotal: 0,
    diskUsed: 0,
    diskTotal: 0,
    weight: 0,
    ...partial,
  };
}

function ctx(over: Partial<HomeSortContext> = {}): HomeSortContext {
  return {
    nameByUuid: new Map(),
    speedAvgByUuid: new Map(),
    priceByUuid: new Map(),
    speedActive: new Set(),
    ...over,
  };
}

function order(
  nodes: HomeNodeSummary[],
  field: HomeSortField,
  direction: HomeSortDirection,
  context: HomeSortContext = ctx(),
) {
  return sortHomeNodes(nodes, field, direction, context).map((n) => n.uuid);
}

describe("sortHomeNodes", () => {
  it("离线优先将离线节点前置，同一状态内保持后端权重顺序", () => {
    const nodes = [
      node({ uuid: "online-b", weight: 2 }),
      node({ uuid: "offline-b", online: false, weight: 9 }),
      node({ uuid: "pending", online: null, weight: -1 }),
      node({ uuid: "offline-a", online: false, weight: 5 }),
      node({ uuid: "online-a", weight: 1 }),
    ];
    expect(order(nodes, "offline", "desc")).toEqual([
      "offline-a", "offline-b", "online-a", "online-b", "pending",
    ]);
    expect(order(nodes, "offline", "asc")).toEqual([
      "online-a", "online-b", "offline-a", "offline-b", "pending",
    ]);
  });

  it("高负载按在线节点 CPU 使用率排序，离线节点的旧读数不参与", () => {
    const nodes = [
      node({ uuid: "low", cpuPct: 12 }),
      node({ uuid: "offline", cpuPct: 99, online: false }),
      node({ uuid: "high", cpuPct: 91 }),
      node({ uuid: "middle", cpuPct: 48 }),
    ];
    expect(order(nodes, "load", "desc")).toEqual(["high", "middle", "low", "offline"]);
    expect(order(nodes, "load", "asc")).toEqual(["low", "middle", "high", "offline"]);
  });

  it("高负载排序将未知状态和无效读数放在有效在线节点之后", () => {
    const nodes = [
      node({ uuid: "pending", online: null, cpuPct: 99, weight: 1 }),
      node({ uuid: "invalid", cpuPct: Number.NaN, weight: 2 }),
      node({ uuid: "negative", cpuPct: -1, weight: 3 }),
      node({ uuid: "infinity", cpuPct: Number.POSITIVE_INFINITY, weight: 4 }),
      node({ uuid: "idle", cpuPct: 0, weight: 5 }),
      node({ uuid: "offline", online: false, weight: 0 }),
    ];
    for (const direction of ["asc", "desc"] as const) {
      expect(order(nodes, "load", direction)).toEqual([
        "idle", "pending", "invalid", "negative", "infinity", "offline",
      ]);
    }
  });

  it("高负载相同时以权重和 UUID 稳定排序，并保留传入数组", () => {
    const nodes = [
      node({ uuid: "z", cpuPct: 80, weight: 2 }),
      node({ uuid: "b", cpuPct: 80, weight: 1 }),
      node({ uuid: "a", cpuPct: 80, weight: 1 }),
    ];
    expect(order(nodes, "load", "desc")).toEqual(["a", "b", "z"]);
    expect(order(nodes, "load", "asc")).toEqual(["a", "b", "z"]);
    expect(nodes.map((entry) => entry.uuid)).toEqual(["z", "b", "a"]);
  });

  it("default = weight asc, offline always sinks to the bottom", () => {
    const nodes = [
      node({ uuid: "off", online: false, weight: 1 }),
      node({ uuid: "b", weight: 8 }),
      node({ uuid: "a", weight: 2 }),
    ];
    expect(order(nodes, "default", "asc")).toEqual(["a", "b", "off"]);
  });

  it("offline sinks even when direction is desc", () => {
    const nodes = [
      node({ uuid: "off", online: false, weight: 5 }),
      node({ uuid: "a", weight: 2 }),
      node({ uuid: "b", weight: 8 }),
    ];
    expect(order(nodes, "default", "desc")).toEqual(["b", "a", "off"]);
  });

  it("name sorts by injected display name in both directions", () => {
    const nodes = [node({ uuid: "1" }), node({ uuid: "2" }), node({ uuid: "3" })];
    const context = ctx({
      nameByUuid: new Map([
        ["1", "Charlie"],
        ["2", "alpha"],
        ["3", "Bravo"],
      ]),
    });
    expect(order(nodes, "name", "asc", context)).toEqual(["2", "3", "1"]);
    expect(order(nodes, "name", "desc", context)).toEqual(["1", "3", "2"]);
  });

  it("traffic sorts by total (up + down) descending", () => {
    const nodes = [
      node({ uuid: "lo", trafficUp: 1, trafficDown: 1 }),
      node({ uuid: "hi", trafficUp: 50, trafficDown: 50 }),
      node({ uuid: "mid", trafficUp: 10, trafficDown: 0 }),
    ];
    expect(order(nodes, "traffic", "desc")).toEqual(["hi", "mid", "lo"]);
  });

  it("price: priced nodes by monthly desc, then no-price by weight, then offline", () => {
    const nodes = [
      node({ uuid: "free", weight: 1 }),
      node({ uuid: "cheap", weight: 5 }),
      node({ uuid: "pricey", weight: 9 }),
      node({ uuid: "off", online: false, weight: 0 }),
    ];
    const context = ctx({
      priceByUuid: new Map<string, number | null>([
        ["free", null],
        ["cheap", 30],
        ["pricey", 100],
        ["off", 500],
      ]),
    });
    expect(order(nodes, "price", "desc", context)).toEqual(["pricey", "cheap", "free", "off"]);
  });

  it("speed: active set by avg desc, inactive online by weight, offline at bottom", () => {
    const nodes = [
      node({ uuid: "fast", weight: 9 }),
      node({ uuid: "med", weight: 1 }),
      node({ uuid: "idle", weight: 2 }),
      node({ uuid: "off", online: false, weight: 0 }),
    ];
    const context = ctx({
      speedActive: new Set(["fast", "med"]),
      speedAvgByUuid: new Map([
        ["fast", 5_000_000],
        ["med", 1_000_000],
        ["idle", 100],
      ]),
    });
    expect(order(nodes, "speed", "desc", context)).toEqual(["fast", "med", "idle", "off"]);
  });
});

describe("reconcileSpeedOrder", () => {
  it("keeps frozen rank but immediately sinks a node that went offline between resorts", () => {
    const nodes = [
      node({ uuid: "a" }),
      node({ uuid: "b", online: false }), // 冻结序里曾排第一,如今已掉线
      node({ uuid: "c" }),
    ];
    // 冻结顺序为 b,a,c —— 重新分段后 b 必须沉底,在线的 a、c 保持冻结相对序。
    expect(reconcileSpeedOrder(nodes, ["b", "a", "c"]).map((n) => n.uuid)).toEqual(["a", "c", "b"]);
  });

  it("appends nodes missing from the frozen order within their own segment", () => {
    const nodes = [
      node({ uuid: "a" }),
      node({ uuid: "fresh" }), // 还没排进冻结序
      node({ uuid: "offfresh", online: false }),
    ];
    expect(reconcileSpeedOrder(nodes, ["a"]).map((n) => n.uuid)).toEqual(["a", "fresh", "offfresh"]);
  });
});
