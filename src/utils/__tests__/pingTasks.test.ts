import { describe, expect, it } from "vitest";
import {
  applyHomepageMultiPingBatchPatch,
  createHomepageMultiPingTaskOverride,
  normalizeHomepageMultiPingNodeTaskIds,
  normalizeHomepageMultiPingTaskIds,
  invertHomepagePingTaskBindings,
  hasHomepagePingTaskBinding,
  normalizeHomepagePingTaskBindings,
  resolveHomepagePingSelections,
  resolveHomepageMultiPingTaskIds,
} from "@/utils/pingTasks";

describe("批量设置三网探测点", () => {
  it("分别保留每台服务器不更改的线路，只更新所选服务器", () => {
    const overrides = {
      "node-a": [4, 5, 6],
      "node-b": [7, 8, 9],
      "node-c": [10, 11, 12],
    };
    const result = applyHomepageMultiPingBatchPatch(
      ["node-a", "node-b"], [1, 2, 3], overrides, [13, null, 14],
    );

    expect(result.nodeTaskIds).toEqual({
      "node-a": [13, 5, 14],
      "node-b": [13, 8, 14],
      "node-c": [10, 11, 12],
    });
    expect(result.changedCount).toBe(2);
    expect(result.issues).toEqual([]);
    expect(result.nodeTaskIds["node-c"]).toBe(overrides["node-c"]);
    expect(overrides["node-a"]).toEqual([4, 5, 6]);
    expect(overrides["node-b"]).toEqual([7, 8, 9]);
    expect(normalizeHomepageMultiPingNodeTaskIds(result.nodeTaskIds)).toEqual(result.nodeTaskIds);
  });

  it("对继承默认的服务器按当前全局线路建立覆盖", () => {
    const result = applyHomepageMultiPingBatchPatch(
      ["node-a", "node-b"], [1, 2, 3], { "node-b": [4, 5, 6] }, [null, 9, null],
    );

    expect(result.nodeTaskIds).toEqual({ "node-a": [1, 9, 3], "node-b": [4, 9, 6] });
    expect(result.changedCount).toBe(2);
  });

  it("全部不更改、未选择节点或当前线路相同时不创建额外覆盖", () => {
    const overrides = { "node-a": [4, 5, 6] };
    for (const result of [
      applyHomepageMultiPingBatchPatch(["node-a", "node-b"], [1, 2, 3], overrides, [null, null, null]),
      applyHomepageMultiPingBatchPatch([], [1, 2, 3], overrides, [7, 8, 9]),
      applyHomepageMultiPingBatchPatch(["node-b"], [1, 2, 3], overrides, [1, null, null]),
      applyHomepageMultiPingBatchPatch(["node-a"], [1, 2, 3], overrides, [null, 5, null]),
    ]) {
      expect(result.nodeTaskIds).toBe(overrides);
      expect(result.changedCount).toBe(0);
      expect(result.issues).toEqual([]);
    }
  });

  it("目标探测点与保留线路重复时阻止整批修改，不自动交换线路", () => {
    const overrides = { "node-a": [1, 2, 3], "node-b": [7, 4, 9] };
    const result = applyHomepageMultiPingBatchPatch(
      ["node-a", "node-b"], [1, 2, 3], overrides, [4, null, null],
    );

    expect(result.nodeTaskIds).toBe(overrides);
    expect(result.changedCount).toBe(0);
    expect(result.issues).toEqual([{ uuid: "node-b", reason: "duplicate" }]);
    expect(overrides).toEqual({ "node-a": [1, 2, 3], "node-b": [7, 4, 9] });
  });

  it("允许显式交换两条线路，另一条线路保持不变", () => {
    const result = applyHomepageMultiPingBatchPatch(
      ["node-a"], [1, 2, 3], {}, [3, null, 1],
    );

    expect(result.nodeTaskIds).toEqual({ "node-a": [3, 2, 1] });
    expect(result.changedCount).toBe(1);
    expect(result.issues).toEqual([]);
  });

  it("保留线路缺失时阻止修改，明确选齐三条后可以建立完整配置", () => {
    const overrides = {};
    const incomplete = applyHomepageMultiPingBatchPatch(
      ["node-a"], [], overrides, [null, 2, 3],
    );
    expect(incomplete.nodeTaskIds).toBe(overrides);
    expect(incomplete.issues).toEqual([{ uuid: "node-a", reason: "incomplete" }]);

    expect(applyHomepageMultiPingBatchPatch(["node-a"], [], overrides, [1, 2, 3])).toEqual({
      nodeTaskIds: { "node-a": [1, 2, 3] }, changedCount: 1, issues: [],
    });
  });

  it("重复选择同一服务器只更新和统计一次", () => {
    const result = applyHomepageMultiPingBatchPatch(
      ["node-a", "node-a"], [1, 2, 3], {}, [4, null, null],
    );

    expect(result.nodeTaskIds).toEqual({ "node-a": [4, 2, 3] });
    expect(result.changedCount).toBe(1);
  });
});

describe("homepage ping task bindings", () => {
  it("accepts only positive decimal safe integers", () => {
    expect(
      normalizeHomepagePingTaskBindings({
        "1e3": ["exponent"],
        "1.5": ["fraction"],
        "0x10": ["hex"],
        "9007199254740992": ["unsafe"],
        "42": ["valid"],
      }),
    ).toEqual({ "42": ["valid"] });
  });

  it("merges IDs that normalize to the same decimal integer", () => {
    expect(
      normalizeHomepagePingTaskBindings({
        "01": ["node-a", "node-b"],
        "1": ["node-b", "node-c"],
      }),
    ).toEqual({ "1": ["node-b", "node-c", "node-a"] });
  });

  it("inverts normalized bindings and gives the lowest task ID precedence", () => {
    expect(
      invertHomepagePingTaskBindings({
        "02": ["node-a"],
        "1": ["node-a", "node-b"],
      }),
    ).toEqual(
      new Map([
        ["node-a", 1],
        ["node-b", 1],
      ]),
    );
  });

  it("reuses the inverted binding index for a stable bindings object", () => {
    const bindings = { "8": ["node-a"], "9": ["node-b"] };
    expect(invertHomepagePingTaskBindings(bindings)).toBe(
      invertHomepagePingTaskBindings(bindings),
    );
  });

  it("reports a binding before overview data has loaded", () => {
    const bindings = { "8": ["node-a"], "9": ["node-b"] };
    expect(hasHomepagePingTaskBinding("node-a", bindings)).toBe(true);
    expect(hasHomepagePingTaskBinding("node-c", bindings)).toBe(false);
  });

  it("normalizes the global three-task selection in display order", () => {
    expect(normalizeHomepageMultiPingTaskIds(["3", 1, 3, 2, 4])).toEqual([3, 1, 2]);
  });

  it("keeps only complete per-node three-task overrides", () => {
    expect(
      normalizeHomepageMultiPingNodeTaskIds({
        " node-a ": [3, 1, 2],
        "node-b": [1, 1, 2],
        "node-c": ["4", "5", "6", "7"],
        "": [1, 2, 3],
      }),
    ).toEqual({
      "node-a": [3, 1, 2],
      "node-c": [4, 5, 6],
    });
  });

  it("prefers a node override and otherwise inherits the global order", () => {
    const overrides = { "node-a": [7, 8, 9] };
    expect(resolveHomepageMultiPingTaskIds("node-a", [1, 2, 3], overrides)).toEqual([
      7, 8, 9,
    ]);
    expect(resolveHomepageMultiPingTaskIds("node-b", [1, 2, 3], overrides)).toEqual([
      1, 2, 3,
    ]);
  });

  it("initializes an override once without replacing an existing selection", () => {
    expect(
      createHomepageMultiPingTaskOverride(undefined, [1, 2, 3], [2, 3, 4, 5]),
    ).toEqual([2, 3, 4]);
    expect(
      createHomepageMultiPingTaskOverride([4, 5, 6], [1, 2, 3], [1, 2, 3, 4, 5, 6]),
    ).toBeNull();
    expect(
      createHomepageMultiPingTaskOverride(undefined, [1, 2, 3], [1, 2]),
    ).toBeNull();
  });

  it("uses multi-ping when available and falls back to each node's single binding", () => {
    const multiSelections = resolveHomepagePingSelections(
      ["node-a", "node-b"],
      { "8": ["node-a"], "9": ["node-b"] },
      [3, 1, 2],
    );

    expect(multiSelections.singleTaskIdsByClient).toEqual(new Map());
    expect(multiSelections.multiTaskIdsByClient).toEqual(
      new Map([
        ["node-a", [3, 1, 2]],
        ["node-b", [3, 1, 2]],
      ]),
    );
    expect(multiSelections.requestedTaskIdsByClient).toEqual(
      multiSelections.multiTaskIdsByClient,
    );

    const singleSelections = resolveHomepagePingSelections(
      ["node-a", "node-b"],
      { "8": ["node-a"], "9": ["node-b"] },
    );
    expect(singleSelections.singleTaskIdsByClient).toEqual(
      new Map([
        ["node-a", [8]],
        ["node-b", [9]],
      ]),
    );
    expect(singleSelections.multiTaskIdsByClient).toEqual(new Map());
    expect(singleSelections.requestedTaskIdsByClient).toEqual(
      singleSelections.singleTaskIdsByClient,
    );

    const mixedSelections = resolveHomepagePingSelections(
      ["node-a", "node-b"],
      { "8": ["node-a"], "9": ["node-b"] },
      [],
      { "node-a": [3, 1, 2] },
    );
    expect(mixedSelections.multiTaskIdsByClient).toEqual(
      new Map([["node-a", [3, 1, 2]]]),
    );
    expect(mixedSelections.singleTaskIdsByClient).toEqual(
      new Map([["node-b", [9]]]),
    );
  });
});
