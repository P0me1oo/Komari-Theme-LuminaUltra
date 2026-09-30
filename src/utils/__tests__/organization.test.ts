import { describe, expect, it } from "vitest";
import { organizationLabel } from "../organization";

describe("机构标签省略公司后缀", () => {
  it.each([
    ["Hangzhou Alibaba Advertising Co., Ltd.", "Hangzhou Alibaba Advertising"],
    ["Example CO.,LTD", "Example"],
    ["Example company limited", "Example"],
    ["Example, Limited.", "Example"],
    ["Example LTD", "Example"],
    ["Cloudflare, Inc.", "Cloudflare"],
    ["Example INCORPORATED", "Example"],
    ["Google LLC", "Google"],
    ["Example l.l.c.", "Example"],
    ["Example I.N.C.", "Example"],
    ["Example Corp.", "Example"],
    ["Example CORPORATION", "Example"],
    ["Example (LLC)", "Example"],
    ["Example（Ltd.）", "Example"],
    ["Example，CO．，LTD．", "Example"],
    ["Example - LLC;", "Example"],
    ["Example Co., Ltd., Inc.", "Example"],
    ["  Example Ltd.  ", "Example"],
  ])("%s 显示为 %s", (name, expected) => {
    expect(organizationLabel(name)).toBe(expected);
  });

  it.each(["Limited Edition Networks", "Inc Networks", "LLC Hosting Services", "Example Ltd. Japan", "ExampleInc", "ExampleLLC", "Example Co.", "Lincoln", "Example (HK Ltd)", "Inc.", "LLC", "(LLC)", "有限公司", ""]) (
    "保留正文或无法安全简化的名称：%s", (name) => {
      expect(organizationLabel(name)).toBe(name);
    },
  );
});
