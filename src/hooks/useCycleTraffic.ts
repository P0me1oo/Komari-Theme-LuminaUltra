import { useMemo } from "react";
import { queryOptions, useQueries, useQuery } from "@tanstack/react-query";
import { useMinuteClock } from "@/hooks/useClock";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { getCycleTrafficUsage } from "@/services/api";
import { getNodeMetaSnapshot, getNodeMetricsSnapshot, type HomeNodeSummary } from "@/services/wsStore";
import type { NodeMetrics } from "@/types/komari";
import { getTrafficCycle } from "@/utils/trafficReset";
import type { CycleTrafficUsage } from "@/utils/trafficCycle";

interface CycleQueryData extends CycleTrafficUsage {
  observedUp?: number;
  observedDown?: number;
  end: number;
}

// 多台服务器的周期独立，共用四个查询名额；同一节点由查询缓存去重。
let activeRequests = 0;
const waitingRequests: Array<() => void> = [];

async function loadWithLimit<T>(signal: AbortSignal, run: () => Promise<T>): Promise<T> {
  signal.throwIfAborted();
  if (activeRequests >= 4) await new Promise<void>((resolve, reject) => {
    const resume = () => { signal.removeEventListener("abort", cancel); resolve(); };
    const cancel = () => {
      const index = waitingRequests.indexOf(resume);
      if (index >= 0) waitingRequests.splice(index, 1);
      reject(signal.reason);
    };
    waitingRequests.push(resume);
    signal.addEventListener("abort", cancel, { once: true });
  });
  else activeRequests += 1;
  try {
    signal.throwIfAborted();
    return await run();
  } finally {
    const next = waitingRequests.shift();
    if (next) next();
    else activeRequests -= 1;
  }
}

function cycleQueryOptions(uuid: string, now: number, settings: ReturnType<typeof useThemeSettings>, enabled: boolean) {
  const meta = getNodeMetaSnapshot(uuid);
  const cycle = enabled && settings.trafficMode === "theme" && meta ? getTrafficCycle(meta.expired_at, now,
    settings.trafficResetDays[uuid], { defaultDay: settings.trafficResetDefault,
      utcOffset: settings.trafficResetTz[uuid] ?? settings.trafficResetUtcOffset }) : null;
  return { cycle, options: queryOptions({
    queryKey: ["traffic-cycle", uuid, cycle?.start ?? null],
    enabled: cycle != null,
    staleTime: 60_000,
    refetchInterval: 60_000,
    retry: false,
    queryFn: ({ signal }): Promise<CycleQueryData> => loadWithLimit(signal, async () => {
      const metrics = getNodeMetricsSnapshot(uuid);
      const end = metrics && metrics.updatedAt >= cycle!.start && metrics.updatedAt <= Date.now()
        ? metrics.updatedAt : Date.now();
      const usage = await getCycleTrafficUsage(uuid, cycle!.start, end, { signal });
      return { ...usage, end, observedUp: metrics?.trafficObservedUp, observedDown: metrics?.trafficObservedDown };
    }),
  }) };
}

export function applyCycleTrafficUsage<T extends Pick<NodeMetrics, "trafficUp" | "trafficDown" | "trafficObservedUp" | "trafficObservedDown">>(
  raw: T, active: boolean, data: CycleQueryData | undefined,
): T & { trafficApproximate?: boolean; trafficPending?: boolean } {
  if (!active) return raw;
  // 周期还未加载时先显示零和估算标记，不能把上周期计数冒充本周期用量。
  if (!data) return { ...raw, trafficUp: 0, trafficDown: 0, trafficApproximate: true, trafficPending: true };
  return { ...raw,
    trafficUp: data.up + (data.observedUp != null && raw.trafficObservedUp != null
      ? Math.max(0, raw.trafficObservedUp - data.observedUp) : 0),
    trafficDown: data.down + (data.observedDown != null && raw.trafficObservedDown != null
      ? Math.max(0, raw.trafficObservedDown - data.observedDown) : 0),
    trafficApproximate: data.approximate,
    trafficPending: false,
  };
}

export function useCycleNodeMetrics(uuid: string, raw: NodeMetrics | undefined, enabled = true): NodeMetrics | undefined {
  const settings = useThemeSettings();
  const now = useMinuteClock(enabled && settings.trafficMode === "theme");
  const { cycle, options } = cycleQueryOptions(uuid, now, settings, enabled);
  const query = useQuery(options);
  const active = cycle != null;
  return useMemo(() => raw ? applyCycleTrafficUsage(raw, active, query.data) : undefined,
    [raw, active, query.data]);
}

export function useCycleHomeSummaries(raw: HomeNodeSummary[]): HomeNodeSummary[] {
  const settings = useThemeSettings();
  const now = useMinuteClock(settings.trafficMode === "theme");
  const plans = settings.trafficMode === "theme" ? raw.map((node) => cycleQueryOptions(node.uuid, now, settings, true)).filter((plan) => plan.cycle != null) : [];
  const queries = useQueries({ queries: plans.map((plan) => plan.options) });
  if (plans.length === 0) return raw;
  const byUuid = new Map(plans.map((plan, index) => [plan.options.queryKey[1], queries[index].data]));
  return raw.map((node) => applyCycleTrafficUsage(node, byUuid.has(node.uuid), byUuid.get(node.uuid)));
}
