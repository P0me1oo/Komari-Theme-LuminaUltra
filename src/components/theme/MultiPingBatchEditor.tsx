import { useEffect, useMemo, useState } from "react";
import type { AdminClient, PingTask } from "@/types/komari";
import {
  applyHomepageMultiPingBatchPatch,
  type HomepageMultiPingBatchPatch,
  type HomepageMultiPingNodeTaskIds,
} from "@/utils/pingTasks";

interface MultiPingBatchEditorProps {
  clients: AdminClient[];
  tasks: PingTask[];
  globalTaskIds: number[];
  nodeTaskIds: HomepageMultiPingNodeTaskIds;
  fakePingForUnbound: boolean;
  saving: boolean;
  onChange: (next: HomepageMultiPingNodeTaskIds) => void;
  onPendingChange: (pending: boolean) => void;
  onBack: () => void;
}

export function MultiPingBatchEditor({
  clients,
  tasks,
  globalTaskIds,
  nodeTaskIds,
  fakePingForUnbound,
  saving,
  onChange,
  onPendingChange,
  onBack,
}: MultiPingBatchEditorProps) {
  const [patch, setPatch] = useState<HomepageMultiPingBatchPatch>([null, null, null]);
  const [appliedCount, setAppliedCount] = useState<number | null>(null);
  const hasChanges = patch.some((taskId) => taskId !== null);
  const result = useMemo(
    () => applyHomepageMultiPingBatchPatch(
      clients.map((client) => client.uuid),
      globalTaskIds,
      nodeTaskIds,
      patch,
    ),
    [clients, globalTaskIds, nodeTaskIds, patch],
  );
  const clientsByUuid = useMemo(
    () => new Map(clients.map((client) => [client.uuid, client])),
    [clients],
  );
  const taskClientsById = useMemo(
    () => new Map(tasks.map((task) => [task.id, new Set(task.clients)])),
    [tasks],
  );
  const unboundCountByTask = useMemo(
    () => new Map(tasks.map((task) => [
      task.id,
      clients.filter((client) => !taskClientsById.get(task.id)?.has(client.uuid)).length,
    ])),
    [clients, taskClientsById, tasks],
  );
  const hasUnavailableTask = patch.some(
    (taskId) => taskId !== null && !taskClientsById.has(taskId),
  );
  const unboundClientCount = useMemo(
    () => clients.filter((client) => {
      const nextTaskIds = result.nodeTaskIds[client.uuid] ?? globalTaskIds;
      return nextTaskIds.some((taskId) => !taskClientsById.get(taskId)?.has(client.uuid));
    }).length,
    [clients, globalTaskIds, result.nodeTaskIds, taskClientsById],
  );
  const applyDisabled = saving || !hasChanges || clients.length === 0 ||
    result.issues.length > 0 || hasUnavailableTask;

  useEffect(() => {
    onPendingChange(hasChanges);
    return () => onPendingChange(false);
  }, [hasChanges, onPendingChange]);

  const changeLine = (slot: number, value: string) => {
    setPatch((current) => {
      const next: HomepageMultiPingBatchPatch = [...current];
      next[slot] = value === "" ? null : Number(value);
      return next;
    });
    setAppliedCount(null);
  };
  const reset = () => {
    setPatch([null, null, null]);
    setAppliedCount(null);
  };
  const apply = () => {
    if (applyDisabled) return;
    if (result.changedCount > 0) onChange(result.nodeTaskIds);
    setAppliedCount(result.changedCount);
    setPatch([null, null, null]);
  };

  return (
    <>
      <div className="multi-ping-config-editor-head">
        <button type="button" onClick={onBack} className="multi-ping-config-mobile-back">
          返回选择服务器
        </button>
        <h3 className="text-[17px] font-semibold text-[var(--text-primary)]">批量设置线路</h3>
        <p className="mt-1 text-[13px] text-[var(--text-secondary)]">
          已选择 {clients.length} 台服务器
        </p>
      </div>
      <div className="multi-ping-config-editor-content">
        <p className="text-[13px] text-[var(--text-secondary)]">
          “不更改”保留每台服务器当前对应线路的探测点。
        </p>
        <div className="multi-ping-config-lines">
          {patch.map((taskId, slot) => (
            <label key={slot} className="multi-ping-config-line">
              <span className="multi-ping-config-line-number">{slot + 1}</span>
              <span className="min-w-0 flex-1">
                <span className="block text-[12px] font-medium text-[var(--text-secondary)]">
                  线路 {slot + 1}
                </span>
                <select
                  value={taskId ?? ""}
                  onChange={(event) => changeLine(slot, event.target.value)}
                  disabled={saving}
                  aria-label={`批量设置线路 ${slot + 1}`}
                  className="surface-inset mt-1.5 w-full px-3 py-2 text-[13px] text-[var(--text-primary)] outline-none"
                >
                  <option value="">不更改</option>
                  {taskId !== null && !taskClientsById.has(taskId) && (
                    <option value={taskId} disabled>任务 #{taskId}（当前不可用）</option>
                  )}
                  {tasks.map((task) => {
                    const unboundCount = unboundCountByTask.get(task.id) ?? 0;
                    return (
                      <option
                        key={task.id}
                        value={task.id}
                        disabled={patch.some((otherId, otherSlot) => otherSlot !== slot && otherId === task.id)}
                      >
                        {task.name || `任务 #${task.id}`}
                        {unboundCount > 0 ? `（${unboundCount} 台未绑定）` : ""}
                      </option>
                    );
                  })}
                </select>
              </span>
            </label>
          ))}
        </div>

        {result.issues.length > 0 && (
          <div className="multi-ping-config-warning" role="alert">
            <div>
              <strong>{result.issues.length} 台服务器的线路配置有冲突，请调整后再应用。</strong>
              <ul className="mt-2 space-y-1">
                {result.issues.slice(0, 5).map(({ uuid, reason }) => (
                  <li key={uuid} className="break-words">
                    {clientsByUuid.get(uuid)?.name || uuid}：
                    {reason === "duplicate" ? "多条线路使用了同一探测点" : "尚未配齐 3 条线路"}
                  </li>
                ))}
              </ul>
              {result.issues.length > 5 && <span>另有 {result.issues.length - 5} 台服务器存在相同问题。</span>}
            </div>
          </div>
        )}
        {hasUnavailableTask && (
          <p role="alert" className="text-[13px] text-[var(--status-error)]">
            所选探测点已不可用，请重新选择。
          </p>
        )}
        {hasChanges && result.issues.length === 0 && !hasUnavailableTask && unboundClientCount > 0 && (
          <div className="multi-ping-config-warning" role="status">
            <div>
              <strong>{unboundClientCount} 台服务器含后台未绑定的探测点。</strong>
              <span>
                {fakePingForUnbound
                  ? "这些线路将按现有设置显示模拟数据。"
                  : "这些线路需要在 Komari 后台绑定后才有真实延迟数据。"}
              </span>
            </div>
          </div>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            disabled={applyDisabled}
            onClick={apply}
            className="theme-manage-button is-primary"
          >
            应用到所选服务器
          </button>
          <button
            type="button"
            disabled={saving || !hasChanges}
            onClick={reset}
            className="theme-manage-button"
          >
            重置线路选择
          </button>
        </div>
        {appliedCount !== null && (
          <p role="status" className="text-[13px] text-[var(--text-secondary)]">
            {appliedCount > 0
              ? `已应用到 ${appliedCount} 台服务器，保存设置后生效。`
              : "所选服务器已使用这些探测点，无需修改。"}
          </p>
        )}
      </div>
    </>
  );
}
