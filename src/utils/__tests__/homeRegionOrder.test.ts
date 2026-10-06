import { expect, it } from "vitest";
import { getHomeRegionOptions, normalizeHomeRegionOrder } from "@/utils/homeNodes";
import { normalizeThemeSettings } from "@/utils/themeSettings";

it("自定义地区顺序持久化并归一化，新增地区沿用默认顺序追加", () => {
  const order = normalizeThemeSettings({ homeRegionOrder: [" us ", "JP", "US", null, 123] }).homeRegionOrder;
  expect(order).toEqual(["US", "JP"]);
  const nodes = ["CN", "US", "JP", "SG", "US"].map((region) => ({ region }));
  expect(getHomeRegionOptions(nodes, order)).toEqual([
    { code: "US", count: 2 }, { code: "JP", count: 1 }, { code: "CN", count: 1 }, { code: "SG", count: 1 },
  ]);
  expect(getHomeRegionOptions(nodes).map((r) => r.code)).toEqual(["CN", "SG", "JP", "US"]);
});

it("切换分组后不生成不存在的地区，未知地区可排序，旧设置保留默认", () => {
  expect(getHomeRegionOptions([{ region: "Japan" }, { region: "" }], ["US", "UN", "JP"]).map((r) => r.code)).toEqual(["UN", "JP"]);
  expect(normalizeThemeSettings({}).homeRegionOrder).toEqual([]);
  expect(normalizeHomeRegionOrder("US,JP")).toEqual([]);
});
