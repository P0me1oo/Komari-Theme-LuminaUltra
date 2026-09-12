export type HomepagePingTaskBindings = Record<string, string[]>;
export type HomepageMultiPingNodeTaskIds = Record<string, number[]>;
export const HOMEPAGE_MULTI_PING_TASK_COUNT = 3;

export type HomepageMultiPingBatchPatch = [number | null, number | null, number | null];

interface HomepageMultiPingBatchResult {
  nodeTaskIds: HomepageMultiPingNodeTaskIds;
  changedCount: number;
  issues: { uuid: string; reason: "incomplete" | "duplicate" }[];
}

const invertedBindingsCache = new WeakMap<HomepagePingTaskBindings, Map<string, number>>();

function parseTaskId(taskId: string) {
  if (!/^\d+$/.test(taskId)) return null;
  const parsed = Number(taskId);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : null;
}

export function normalizeHomepageMultiPingTaskIds(value: unknown): number[] {
  if (!Array.isArray(value)) return [];

  const normalized: number[] = [];
  for (const raw of value) {
    const taskId =
      typeof raw === "number" && Number.isSafeInteger(raw) && raw > 0
        ? raw
        : typeof raw === "string"
          ? parseTaskId(raw)
          : null;
    if (taskId == null || normalized.includes(taskId)) continue;
    normalized.push(taskId);
    if (normalized.length === HOMEPAGE_MULTI_PING_TASK_COUNT) break;
  }
  return normalized;
}

export function normalizeHomepageMultiPingNodeTaskIds(
  value: unknown,
): HomepageMultiPingNodeTaskIds {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: HomepageMultiPingNodeTaskIds = {};
  const entries = Object.entries(value).sort(([left], [right]) =>
    left.trim().localeCompare(right.trim()),
  );
  for (const [rawUuid, rawTaskIds] of entries) {
    const uuid = rawUuid.trim();
    const taskIds = normalizeHomepageMultiPingTaskIds(rawTaskIds);
    if (!uuid || taskIds.length !== HOMEPAGE_MULTI_PING_TASK_COUNT) continue;
    normalized[uuid] = taskIds;
  }
  return normalized;
}

export function resolveHomepageMultiPingTaskIds(
  clientUuid: string,
  globalTaskIds: number[],
  nodeTaskIds: HomepageMultiPingNodeTaskIds = {},
): number[] {
  const overrideTaskIds = normalizeHomepageMultiPingTaskIds(nodeTaskIds[clientUuid]);
  if (overrideTaskIds.length === HOMEPAGE_MULTI_PING_TASK_COUNT) {
    return overrideTaskIds;
  }

  const normalizedGlobalTaskIds = normalizeHomepageMultiPingTaskIds(globalTaskIds);
  return normalizedGlobalTaskIds.length === HOMEPAGE_MULTI_PING_TASK_COUNT
    ? normalizedGlobalTaskIds
    : [];
}

export function createHomepageMultiPingTaskOverride(
  currentTaskIds: number[] | undefined,
  globalTaskIds: number[],
  availableTaskIds: number[],
): number[] | null {
  if (currentTaskIds) return null;

  const available = new Set(
    availableTaskIds.filter(
      (taskId) => Number.isSafeInteger(taskId) && taskId > 0,
    ),
  );
  const nextTaskIds = normalizeHomepageMultiPingTaskIds([
    ...globalTaskIds.filter((taskId) => available.has(taskId)),
    ...available,
  ]);
  return nextTaskIds.length === HOMEPAGE_MULTI_PING_TASK_COUNT
    ? nextTaskIds
    : null;
}

/** null 表示保留该服务器当前线路；整批校验通过后才应用，禁止自动交换其他线路。 */
export function applyHomepageMultiPingBatchPatch(
  clientUuids: string[],
  globalTaskIds: number[],
  nodeTaskIds: HomepageMultiPingNodeTaskIds,
  patch: HomepageMultiPingBatchPatch,
): HomepageMultiPingBatchResult {
  const unchanged: HomepageMultiPingBatchResult = {
    nodeTaskIds,
    changedCount: 0,
    issues: [],
  };
  if (patch.every((taskId) => taskId === null)) return unchanged;

  const updates: HomepageMultiPingNodeTaskIds = {};
  const issues: HomepageMultiPingBatchResult["issues"] = [];
  for (const uuid of new Set(clientUuids)) {
    const currentTaskIds = nodeTaskIds[uuid] ?? globalTaskIds;
    const nextTaskIds = patch.map((taskId, slot) => taskId ?? currentTaskIds[slot]);
    if (nextTaskIds.some((taskId) => !Number.isSafeInteger(taskId) || taskId <= 0)) {
      issues.push({ uuid, reason: "incomplete" });
      continue;
    }
    if (new Set(nextTaskIds).size !== HOMEPAGE_MULTI_PING_TASK_COUNT) {
      issues.push({ uuid, reason: "duplicate" });
      continue;
    }
    if (nextTaskIds.some((taskId, slot) => taskId !== currentTaskIds[slot])) {
      updates[uuid] = nextTaskIds;
    }
  }

  if (issues.length > 0) return { ...unchanged, issues };
  const changedCount = Object.keys(updates).length;
  return changedCount === 0
    ? unchanged
    : { nodeTaskIds: { ...nodeTaskIds, ...updates }, changedCount, issues };
}

export function normalizeHomepagePingTaskBindings(
  value: unknown,
): HomepagePingTaskBindings {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  const normalized: HomepagePingTaskBindings = {};
  for (const [taskId, clients] of Object.entries(value)) {
    const numericTaskId = parseTaskId(taskId);
    if (numericTaskId == null || !Array.isArray(clients)) continue;

    const uniqueClients = Array.from(
      new Set(
        clients
          .map((client) => (typeof client === "string" ? client.trim() : ""))
          .filter(Boolean),
      ),
    );
    if (uniqueClients.length === 0) {
      continue;
    }

    const normalizedTaskId = String(numericTaskId);
    normalized[normalizedTaskId] = Array.from(
      new Set([...(normalized[normalizedTaskId] ?? []), ...uniqueClients]),
    );
  }

  return normalized;
}

export function invertHomepagePingTaskBindings(
  bindings: HomepagePingTaskBindings,
): Map<string, number> {
  const cached = invertedBindingsCache.get(bindings);
  if (cached) return cached;

  const selectedTaskByClient = new Map<string, number>();
  const entries = Object.entries(normalizeHomepagePingTaskBindings(bindings)).sort(
    ([left], [right]) => Number(left) - Number(right),
  );

  for (const [taskId, clients] of entries) {
    const numericTaskId = parseTaskId(taskId);
    if (numericTaskId == null) continue;
    for (const client of clients) {
      if (!selectedTaskByClient.has(client)) {
        selectedTaskByClient.set(client, numericTaskId);
      }
    }
  }

  invertedBindingsCache.set(bindings, selectedTaskByClient);
  return selectedTaskByClient;
}

export function hasHomepagePingTaskBinding(
  clientUuid: string,
  bindings: HomepagePingTaskBindings,
): boolean {
  return Boolean(clientUuid) && invertHomepagePingTaskBindings(bindings).has(clientUuid);
}

export function resolveHomepagePingSelections(
  clientUuids: string[],
  bindings: HomepagePingTaskBindings,
  multiTaskIds: number[] = [],
  nodeMultiTaskIds: HomepageMultiPingNodeTaskIds = {},
) {
  const singleTaskByClient = invertHomepagePingTaskBindings(bindings);
  const singleTaskIdsByClient = new Map<string, number[]>();
  const multiTaskIdsByClient = new Map<string, number[]>();

  for (const uuid of clientUuids) {
    if (!uuid) continue;
    const selectedTaskIds = resolveHomepageMultiPingTaskIds(
      uuid,
      multiTaskIds,
      nodeMultiTaskIds,
    );
    if (selectedTaskIds.length === HOMEPAGE_MULTI_PING_TASK_COUNT) {
      multiTaskIdsByClient.set(uuid, selectedTaskIds);
      continue;
    }
    const singleTaskId = singleTaskByClient.get(uuid);
    if (singleTaskId != null) singleTaskIdsByClient.set(uuid, [singleTaskId]);
  }

  const requestedTaskIdsByClient = new Map([
    ...singleTaskIdsByClient,
    ...multiTaskIdsByClient,
  ]);

  return {
    singleTaskIdsByClient,
    multiTaskIdsByClient,
    requestedTaskIdsByClient,
  };
}
