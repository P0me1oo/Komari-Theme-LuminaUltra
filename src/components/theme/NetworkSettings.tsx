import { useState, type RefObject } from "react";
import { InstancePanel } from "@/components/instance/InstancePanel";
import { useNetworkDetection } from "@/hooks/useNetworkDetection";
import { type NetworkConfig, type NetworkDetectionKind } from "@/services/networkInfo";
import type { AdminClient } from "@/types/komari";

interface NetworkSettingsProps {
  config?: NetworkConfig;
  loading: boolean;
  loadError: Error | null;
  clients: AdminClient[];
  clientsLoading: boolean;
  clientsError: Error | null;
  saving: boolean;
  dirty: boolean;
  formRef: RefObject<HTMLFormElement | null>;
  onChange: (config: NetworkConfig) => void;
  onReload: () => void;
  onSave: () => Promise<boolean>;
}

export function NetworkSettings({
  config, loading, loadError, clients, clientsLoading, clientsError,
  saving, dirty, formRef, onChange, onReload, onSave,
}: NetworkSettingsProps) {
  const [search, setSearch] = useState("");
  const [saveFirst, setSaveFirst] = useState<NetworkDetectionKind | null>(null);
  const detection = useNetworkDetection("route");
  const ipDetection = useNetworkDetection("ip");
  const keyword = search.trim().toLowerCase();
  const visibleClients = clients.filter((client) =>
    [client.name, client.uuid, client.group, client.region].some((value) =>
      String(value || "").toLowerCase().includes(keyword),
    ),
  );
  const selected = new Set(config?.nodes);
  function patch(patch: Partial<NetworkConfig>) {
    if (!config) return;
    detection.reset();
    ipDetection.reset();
    setSaveFirst(null);
    onChange({ ...config, ...patch });
  }
  function detect(kind: NetworkDetectionKind) {
    if (dirty) { setSaveFirst(kind); return; }
    setSaveFirst(null);
    (kind === "ip" ? ipDetection : detection).run();
  }
  if (loading || !config) return (
    <InstancePanel title="网络识别插件">
      {loading ? <p>正在读取设置…</p> : <div className="network-settings-unavailable">
        <p>请先在 Komari 后台安装并启用“Lumina 网络识别”插件 0.5.0 或更新版本。</p>
        {loadError && <p role="alert">{loadError.message}</p>}
        <button className="theme-manage-button" type="button" onClick={onReload}>重新读取</button>
      </div>}
    </InstancePanel>
  );
  return (
    <form ref={formRef} onSubmit={(event) => { event.preventDefault(); void onSave(); }} className="network-settings-form">
      <InstancePanel title="IP 信息与标签">
        <fieldset disabled={saving} aria-label="IP 信息设置">
          <div className="network-settings-switches">
            {([
              ["ip_enabled", "自动查询全部节点"], ["ip_guest_visible", "允许游客查看 IP 信息"],
              ["show_asn", "显示 ASN"], ["show_organization", "显示运营商 / 机构"], ["show_ip_type", "显示 IP 类型"],
            ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={config[key]} onChange={(event) => patch({ [key]: event.target.checked })} />{label}</label>)}
          </div>
          <div className="network-settings-fields">
            <label>数据来源<select value={config.ip_source} onChange={(event) => patch({ ip_source: event.target.value as NetworkConfig["ip_source"] })}><option value="ipinfo">IPinfo</option><option value="ipregistry">IPregistry</option></select></label>
            {config.ip_source === "ipregistry" && <label>IPregistry API 密钥<input type="password" autoComplete="new-password" required value={config.ipregistry_api_key ?? ""} onChange={(event) => patch({ ipregistry_api_key: event.target.value })} /></label>}
            <label>更新间隔（小时）<input type="number" min={1} max={720} required value={config.ip_interval_hours} onChange={(event) => patch({ ip_interval_hours: Number(event.target.value) })} /></label>
          </div>
          <div className="network-settings-actions">
            <button type="button" className="theme-manage-button" disabled={ipDetection.running} onClick={() => detect("ip")}>{ipDetection.running ? "正在提交…" : "刷新 IP 信息"}</button>
          </div>
        </fieldset>
        {saveFirst === "ip" && dirty && <p role="alert">请先点击页面顶部的“保存设置”，再刷新 IP 信息。</p>}
        {ipDetection.notice && <p role={ipDetection.notice.error ? "alert" : "status"}>{ipDetection.notice.message}</p>}
      </InstancePanel>
      <InstancePanel title="三网回程检测">
        <fieldset disabled={saving} aria-label="回程检测设置">
          <p>检测目标跟随“主页延迟检测”的探测点。</p>
          <div className="network-settings-switches">
            {([
              ["enabled", "自动检测回程"], ["guest_visible", "允许游客查看回程"],
              ["show_home", "首页显示回程"], ["show_details", "详情页显示回程"], ["all_nodes", "检测全部节点"],
            ] as const).map(([key, label]) => <label key={key}><input type="checkbox" checked={config[key]} onChange={(event) => patch({ [key]: event.target.checked })} />{label}</label>)}
          </div>
          {!config.all_nodes && (
            <div className="network-node-picker">
              <div className="network-node-toolbar">
                <h3>指定回程节点</h3>
                <span>已选 {selected.size} 台</span>
                <button type="button" className="theme-manage-button is-compact" disabled={!visibleClients.length || Boolean(clientsError) || clientsLoading} onClick={() => patch({ nodes: [...new Set([...selected, ...visibleClients.map((client) => client.uuid)])] })}>{keyword ? "全选当前结果" : "全选"}</button>
                <button type="button" className="theme-manage-button is-compact" disabled={!selected.size} onClick={() => patch({ nodes: [] })}>清空</button>
              </div>
              <input type="search" className="network-node-search" aria-label="搜索回程节点" placeholder="搜索节点名称、分组或地区" value={search} onChange={(event) => setSearch(event.target.value)} />
              {clientsLoading ? <p>正在读取节点…</p> : clientsError ? <p role="alert">节点读取失败：{clientsError.message}</p> : (
                <div className="network-node-list" role="group" aria-label="参与回程检测的节点">
                  {visibleClients.map((client) => (
                    <label key={client.uuid} className="network-node-option">
                      <input type="checkbox" checked={selected.has(client.uuid)} onChange={(event) => patch({ nodes: event.target.checked ? [...selected, client.uuid] : config.nodes.filter((id) => id !== client.uuid) })} />
                      <span>{client.name || client.uuid}</span>
                      {client.group && <span className="network-node-group">{client.group}</span>}
                    </label>
                  ))}
                  {!visibleClients.length && <p>{clients.length ? "没有匹配的节点" : "暂无节点"}</p>}
                </div>
              )}
            </div>
          )}
          <div className="network-settings-fields">
            <label>检测间隔（分钟）<input type="number" min={5} max={43200} required value={config.interval_minutes} onChange={(event) => patch({ interval_minutes: Number(event.target.value) })} /></label>
            <label>同时检测的节点数量<input type="number" min={1} max={8} required value={config.concurrency} onChange={(event) => patch({ concurrency: Number(event.target.value) })} /></label>
            <label>NextTrace 程序路径<input required value={config.nexttrace_path} onChange={(event) => patch({ nexttrace_path: event.target.value })} /></label>
          </div>
          <div className="network-settings-actions">
            <button type="button" className="theme-manage-button" disabled={detection.running} onClick={() => detect("route")}>{detection.running ? "正在提交…" : "检测回程"}</button>
          </div>
        </fieldset>
        {saveFirst === "route" && dirty && <p role="alert">请先点击页面顶部的“保存设置”，再检测回程。</p>}
        {detection.notice && <p role={detection.notice.error ? "alert" : "status"}>{detection.notice.message}</p>}
      </InstancePanel>
    </form>
  );
}
