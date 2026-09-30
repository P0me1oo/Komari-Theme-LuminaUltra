// 在 Komari 源码根目录执行：go run ../Komari-Theme-LuminaUltra/network-plugin/tests/goja-check.go
// 使用真实插件运行时验证模块加载、定时任务、缓存和路由；探针与外网请求使用替身。
package main

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/dop251/goja"
	"github.com/dop251/goja_nodejs/require"
	"github.com/komari-monitor/komari/pkg/jsruntime"
)

func main() {
	base, err := filepath.Abs("../Komari-Theme-LuminaUltra/network-plugin")
	if err != nil {
		panic(err)
	}
	storage, err := os.MkdirTemp("", "lumina-network-check-")
	if err != nil {
		panic(err)
	}
	rel, err := filepath.Rel(os.TempDir(), storage)
	if err != nil || strings.HasPrefix(rel, "..") || filepath.IsAbs(rel) {
		panic("临时目录不在预期范围内")
	}
	defer os.RemoveAll(storage)
	// 预置旧版只读快照，验证兼容读取后迁移到新文件并多次覆盖写入。
	if err := os.WriteFile(filepath.Join(storage, "network-state.json.1"), []byte(`{"revision":1,"nodes":{},"jobs":[]}`), 0o400); err != nil {
		panic(err)
	}
	code, err := os.ReadFile(filepath.Join(base, "script.js"))
	if err != nil {
		panic(err)
	}
	code = append(code, []byte(`
async function verify() {
  await tick();
  if (state.jobs.length !== 1) throw new Error("未派发探测任务");
  const command = server.commands[0];
  if (!command.includes("'-T' '-p' '80'")) throw new Error("TCP 端口参数不正确");
  const info = core.parseTrace(JSON.stringify({Hops: [[{Success: true, Address: {IP: "203.0.113.1"}, Geo: {asnumber: "4809"}}]]}), 0);
  if (info.networks[0].name !== "CN2" || info.route_label !== "CN2GIA") throw new Error("线路解析失败");
  const mixed = core.parseTrace(JSON.stringify({Hops: [[{Success: true, Address: {IP: "59.43.1.1"}}], [{Success: true, Address: {IP: "202.97.1.1"}, Geo: {asnumber: "4134"}}], [{Success: true, Address: {IP: "203.0.113.2"}, Geo: {asnumber: "136958"}}]]}), 0, "cu");
  if (mixed.route_label !== "CN2GIA") throw new Error("联通目标覆盖了 CN2 路径");
  const res = {statusCode: 200, setHeader: function(){}, end: function(body){this.body = JSON.parse(body);}};
  await server.routes["GET /api/public/lumina-network/v1/results"]({context: {}}, res);
  if (res.body.available !== false) throw new Error("游客开关失效");
  await server.routes["POST /api/admin/lumina-network/v1/validate"]({context: {role: "admin"}, body: "{}"}, res);
  if (!res.body.ok) throw new Error("配置校验失败");
  await server.routes["POST /api/admin/lumina-network/v1/run"]({context: {}}, res);
  if (res.statusCode !== 403) throw new Error("游客可以触发回程检测");
  await server.routes["POST /api/admin/lumina-network/v1/run"]({context: {role: "admin"}}, res);
  if (res.statusCode !== 202 || res.body.added !== 2 || state.manual_routes.length !== 2) throw new Error("手动检测请求失败或重复派发");
  globalThis.fetch = async function() { return {ok: true, json: async function() { return {data: {asn: {asn: 64500, name: "测试机构", type: "hosting"}}}; }}; };
  await server.routes["POST /api/admin/lumina-network/v1/ip-refresh"]({context: {role: "admin"}}, res);
  if (res.statusCode !== 202 || res.body.added !== 0 || res.body.ip_added !== 1) throw new Error("独立 IP 刷新请求失败：" + JSON.stringify(res.body));
  await tickIPs();
  if (state.manual_ips.length !== 0 || state.nodes["test-node"].ips[0].asn !== "AS64500") throw new Error("手动 IP 查询未完成");
  await server.routes["GET /api/public/lumina-network/v1/results"]({context: {role: "admin"}}, res);
  if (res.body.nodes[0].ips[0].type !== "机房" || res.body.nodes[0].routes[0].checked_at !== null) throw new Error("完整结果格式不正确");
  const registryConfig = core.normalizeIPConfig({ip_source: "ipregistry", ipregistry_api_key: "example-key"});
  if (ipSource.queryHeaders(registryConfig.ip_source, registryConfig.ipregistry_api_key).Authorization !== "ApiKey example-key") throw new Error("IPregistry 请求头不正确");
  const registryData = ipSource.parseIPregistry({connection: {asn: 64501, organization: "测试网络", type: "hosting"}});
  if (registryData.asn !== "AS64501" || registryData.type !== "机房") throw new Error("IPregistry 解析失败");
  await fs.promises.readFile(statePath + "." + revision % 2, "utf8");
  return true;
}
`)...)
	runtime, err := jsruntime.New(string(code), jsruntime.Options{
		BaseDir: base, StorageDir: storage, NodeJS: true, Timeout: 10 * time.Second,
		ConfigureRequire: func(registry *require.Registry) {
			registry.RegisterNativeModule("server", func(vm *goja.Runtime, module *goja.Object) {
				value, err := vm.RunString(`({
  commands: [], routes: {},
  getConfig: async function(){ return {ip_enabled: false, concurrency: 1}; },
  call: async function(method, params){
    if (method === "admin:listClients") return [{uuid: "test-node", ipv4: "203.0.113.1"}];
    if (method === "public:getPublicSettings") return {theme: "LuminaUltra", theme_settings: {enableHomepageMultiPing: true, homepageMultiPingTaskIds: [1, 2, 3]}};
    if (method === "admin:getAllPingTasks") return [1, 2, 3].map(function(id) { return {id: id, name: "电信 " + id, target: "example.com:80", type: "tcp", clients: ["test-node"]}; });
    if (method === "admin:exec") {this.commands.push(params.command); return {task_id: "task-1"};}
    if (method === "admin:getTaskById") return {results: []};
    throw new Error(method);
  },
  route: function(method, path, callback){this.routes[method + " " + path] = callback;},
  cron: function(){}
})`)
				if err != nil {
					panic(err)
				}
				if err := module.Set("exports", value); err != nil {
					panic(err)
				}
			})
		},
	})
	if err != nil {
		panic(err)
	}
	defer runtime.Close()
	if err := runtime.CallVoid("load"); err != nil {
		panic(err)
	}
	if err := runtime.Call("verify"); err != nil {
		panic(err)
	}
	if err := runtime.CallVoid("unload"); err != nil {
		panic(err)
	}
	fmt.Println("Komari 插件运行时检查通过")
}
