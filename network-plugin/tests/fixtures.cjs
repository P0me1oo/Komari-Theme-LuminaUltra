const core = require("../core.cjs");
const { resolveConfig } = require("../ping-targets.cjs");

function testConfig(raw = {}) {
  const nodes = ["a", "b", "visible", "hidden"].map((uuid) => ({ uuid }));
  const ids = nodes.map((node) => node.uuid);
  return {
    ...resolveConfig(raw, nodes, { theme: "LuminaUltra", theme_settings: { homepagePingBindings: { 1: ids } } },
      [{ id: 1, name: "广东移动", type: "tcp", target: "example.com:80", clients: ids }]),
    ...core.normalizeIPConfig(raw),
  };
}

module.exports = { testConfig };
