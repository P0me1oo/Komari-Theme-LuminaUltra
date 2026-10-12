import { useMemo, useRef, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronUp, RefreshCw } from "lucide-react";
import { useQuery } from "@tanstack/react-query";
import { Flag } from "@/components/ui/Flag";
import { Spinner } from "@/components/ui/Spinner";
import { useThemeSettings } from "@/hooks/useThemeSettings";
import { useAuth } from "@/hooks/useAuth";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { useHourlyClock } from "@/hooks/useClock";
import { useVisibleNodes } from "@/hooks/useVisibleNodes";
import { calculateCostSummary, convertAssetAmount, formatAssetMoney, formatSignedAssetMoney, getExchangeRates } from "@/utils/cost";
import type { AssetCurrency } from "@/utils/units";
import { formatRenewalPrice, normalizeBillingCycle } from "@/utils/billing";
import { canAccessAssets } from "@/utils/assetsAccess";
import { getAssetExpiry } from "@/utils/assetExpiry";

type AssetDetail = ReturnType<typeof calculateCostSummary>["details"][number];
type AssetsSortField = "weight" | "price" | "monthly" | "remaining" | "premium" | "premiumMonthly" | "expiry";
type AssetsSortDirection = "asc" | "desc";
type AssetsFilter = "all" | "expiring" | "expired";

const NATURAL_DIRECTION: Record<AssetsSortField, AssetsSortDirection> = {
  weight: "asc", price: "desc", monthly: "desc", remaining: "desc",
  premium: "desc", premiumMonthly: "desc", expiry: "asc",
};
const TABLE_COLUMNS: Array<{ field: AssetsSortField; label: string; numeric?: boolean; premium?: boolean }> = [
  { field: "weight", label: "节点" },
  { field: "price", label: "原价 / 周期", numeric: true },
  { field: "monthly", label: "月均成本", numeric: true },
  { field: "remaining", label: "剩余价值", numeric: true },
  { field: "premium", label: "溢价", numeric: true, premium: true },
  { field: "premiumMonthly", label: "溢价月摊", numeric: true, premium: true },
  { field: "expiry", label: "到期时间" },
];

function sortValue(detail: AssetDetail, field: AssetsSortField, expiry: ReturnType<typeof getAssetExpiry>): number {
  switch (field) {
    case "price": return detail.priceCny;
    case "monthly": return detail.monthlyCny;
    case "remaining": return detail.remainingCny;
    case "premium": return detail.premiumCny;
    case "premiumMonthly": return detail.premiumMonthlyCny;
    case "expiry": return expiry.timestamp ?? Number.POSITIVE_INFINITY;
    default: return detail.weight;
  }
}

function premiumTone(value: number) {
  return value > 0 ? "var(--status-error)" : value < 0 ? "var(--status-success)" : "var(--text-tertiary)";
}

function ExpiryStatus({ expiry }: { expiry: ReturnType<typeof getAssetExpiry> }) {
  const date = expiry.timestamp != null && !expiry.longTerm
    ? new Date(expiry.timestamp).toLocaleDateString("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit" }).replaceAll("/", "-")
    : null;
  return (
    <div className="assets-expiry" data-tone={expiry.tone}>
      <div className="assets-expiry-labels">
        {date && <time dateTime={new Date(expiry.timestamp!).toISOString()}>{date}</time>}
        <span>{expiry.label}</span>
      </div>
      {expiry.progress != null && (
        <div
          className="assets-expiry-track"
          role="progressbar"
          aria-label="本周期剩余时间"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(expiry.progress)}
          aria-valuetext={expiry.label + "，占账单周期 " + Math.round(expiry.progress) + "%"}
        >
          <span style={{ width: expiry.progress + "%" }} />
        </div>
      )}
    </div>
  );
}

export function Assets() {
  const themeSettings = useThemeSettings();
  const auth = useAuth();
  // 非公开费用先确认登录状态，通过入口规则后才挂载汇率查询。
  if (!themeSettings.isReady || (themeSettings.costVisibility !== "public" && auth.isPending)) {
    return <div className="flex h-[60vh] items-center justify-center"><Spinner size={24} /></div>;
  }
  if (!canAccessAssets(themeSettings, auth.data?.logged_in === true)) return <Navigate to="/" replace />;
  return <AssetsContent />;
}

function AssetsContent() {
  const [sortField, setSortField] = useState<AssetsSortField>("weight");
  const [sortDirection, setSortDirection] = useState<AssetsSortDirection>("asc");
  const [filter, setFilter] = useState<AssetsFilter>("all");
  const [search, setSearch] = useState("");
  const [selectedCurrency, setSelectedCurrency] = useState<AssetCurrency | null>(null);
  const isMobileLayout = useMediaQuery("(max-width: 720px)");
  const now = useHourlyClock();
  const themeSettings = useThemeSettings();
  const assetCurrency = selectedCurrency ?? themeSettings.assetCurrency;
  const forceRateRefresh = useRef(false);
  const nodes = useVisibleNodes();
  const rateQuery = useQuery({
    queryKey: ["cost-rates", themeSettings.costRateApiUrl],
    queryFn: ({ signal }) => {
      const ignoreCache = forceRateRefresh.current;
      forceRateRefresh.current = false;
      return getExchangeRates(themeSettings.costRateApiUrl, { signal, ignoreCache });
    },
    staleTime: 60 * 60 * 1000,
    enabled: nodes.length > 0,
    retry: 1,
  });
  const summary = useMemo(() => rateQuery.data
    ? calculateCostSummary(nodes, themeSettings.costIgnoredNodes, rateQuery.data.rates, themeSettings.costPremiums, now)
    : null, [nodes, now, themeSettings.costIgnoredNodes, themeSettings.costPremiums, rateQuery.data]);
  const formatMoney = (amount: number) => formatAssetMoney(convertAssetAmount(amount, assetCurrency, rateQuery.data?.rates), assetCurrency);
  const formatSignedMoney = (amount: number) => formatSignedAssetMoney(convertAssetAmount(amount, assetCurrency, rateQuery.data?.rates), assetCurrency);
  const nodeByUuid = useMemo(() => new Map(nodes.map((node) => [node.uuid, node])), [nodes]);
  // 风险核对始终使用真实到期数据，不受首页提醒的关闭或稍后偏好影响。
  const expiryByUuid = useMemo(() => new Map(nodes.map((node) => [
    node.uuid, getAssetExpiry(node.expired_at, normalizeBillingCycle(node.billing_cycle).days, now),
  ])), [nodes, now]);
  const expiryStates = [...expiryByUuid.values()];
  const expiringCount = expiryStates.filter((expiry) => expiry.expiringSoon).length;
  const expiredCount = expiryStates.filter((expiry) => expiry.expired).length;
  const countedCount = summary?.details.filter((detail) => detail.counted).length ?? 0;
  const hasPremium = summary?.details.some((detail) => detail.premiumCny !== 0) ?? false;
  const columns = TABLE_COLUMNS.filter((column) => !column.premium || hasPremium);
  const detailRows = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    const rows = (summary?.details ?? []).filter((detail) => {
      const expiry = expiryByUuid.get(detail.uuid)!;
      const node = nodeByUuid.get(detail.uuid);
      return (filter === "all" || (filter === "expiring" ? expiry.expiringSoon : expiry.expired))
        && (!query || [detail.name, node?.group, detail.region].some((value) => value?.toLocaleLowerCase().includes(query)));
    });
    const keys = new Map(rows.map((detail) => [detail.uuid, sortValue(detail, sortField, expiryByUuid.get(detail.uuid)!)]));
    rows.sort((a, b) => {
      if (a.counted !== b.counted) return a.counted ? -1 : 1;
      const left = keys.get(a.uuid)!;
      const right = keys.get(b.uuid)!;
      // 未设置到期的节点始终放在最后，不因切换倒序而排到最前。
      if (Number.isFinite(left) !== Number.isFinite(right)) return Number.isFinite(left) ? -1 : 1;
      return (left - right) * (sortDirection === "asc" ? 1 : -1) || a.name.localeCompare(b.name, "zh-CN");
    });
    return rows;
  }, [summary, search, filter, sortField, sortDirection, expiryByUuid, nodeByUuid]);
  const exchangeRateRows = useMemo(() => {
    const rates = rateQuery.data?.rates;
    if (!rates?.CNY) return [];
    return ["CNY", "USD", "HKD", "EUR", "GBP", "JPY"]
      .filter((code) => code !== assetCurrency && Number.isFinite(rates[code]) && rates[code] > 0)
      .map((code) => ({ code, value: rates.CNY / rates[code] }));
  }, [rateQuery.data, assetCurrency]);
  const handleSort = (field: AssetsSortField) => {
    if (field === sortField) setSortDirection((value) => value === "asc" ? "desc" : "asc");
    else { setSortField(field); setSortDirection(NATURAL_DIRECTION[field]); }
  };
  const resetFilters = () => { setFilter("all"); setSearch(""); };
  const originalPrice = (detail: AssetDetail) => {
    const node = nodeByUuid.get(detail.uuid);
    return node ? formatRenewalPrice(node) ?? "价格未设置" : "价格未设置";
  };
  const ledgerRows = [
    { label: "年化总支出", value: summary ? formatMoney(summary.totalCny) : "—", tone: undefined as string | undefined, title: "月均支出 × 12" },
    ...(summary && hasPremium ? [
      { label: "溢价盈亏", value: formatSignedMoney(summary.premiumTotalCny), tone: premiumTone(summary.premiumTotalCny), title: "收购溢价合计，正数表示多花钱，负数表示折价；不计入月均成本和剩余价值" },
      ...(summary.premiumMonthlyTotalCny !== 0 ? [{ label: "真实月均", value: formatMoney(summary.effectiveMonthlyCny), tone: undefined, title: "月均成本加上溢价月摊" }] : []),
      { label: "实际剩余价值", value: formatMoney(summary.actualRemainingCny), tone: undefined, title: "剩余价值加上尚未摊销的溢价" },
    ] : []),
  ];
  const filters: Array<{ value: AssetsFilter; label: string; count: number }> = [
    { value: "all", label: "全部", count: nodes.length },
    { value: "expiring", label: "30 天内到期", count: expiringCount },
    { value: "expired", label: "已过期", count: expiredCount },
  ];

  return (
    <div className="assets-page">
      <Link to="/" className="instance-page-back assets-back"><ChevronLeft size={14} />返回</Link>
      <header className="assets-page-head">
        <h1>费用统计</h1>
        <div className="assets-page-actions">
          <label className="assets-currency-control">
            <span>统计币种</span>
            <select value={assetCurrency} onChange={(event) => setSelectedCurrency(event.target.value as AssetCurrency)}>
              <option value="CNY">CNY 人民币</option>
              <option value="USD">USD 美元</option>
            </select>
          </label>
          <button
            type="button"
            className={"assets-refresh" + (rateQuery.isFetching ? " is-spinning" : "")}
            onClick={() => { forceRateRefresh.current = true; void rateQuery.refetch(); }}
            disabled={rateQuery.isFetching || nodes.length === 0}
            aria-busy={rateQuery.isFetching}
          >
            <RefreshCw size={14} aria-hidden />{rateQuery.isFetching ? "刷新中" : "刷新汇率"}
          </button>
        </div>
      </header>

      {nodes.length === 0 ? (
        <div className="assets-empty" role="status">暂无节点数据</div>
      ) : (
        <>
          <section className="assets-overview" aria-label="费用概览">
            <dl className="assets-metric" data-tone="accent">
              <dt>月均成本</dt>
              <dd>{summary ? formatMoney(summary.monthlyCny) : "—"}</dd>
            </dl>
            <dl className="assets-metric" title={"按计入费用统计的 " + countedCount + " 台节点均摊"}>
              <dt>平均每台 / 月</dt>
              <dd>{summary ? formatMoney(countedCount ? summary.monthlyCny / countedCount : 0) : "—"}</dd>
            </dl>
            <dl className="assets-metric" data-tone="success" title="按账单价格计算，不含收购溢价">
              <dt>剩余价值</dt>
              <dd>{summary ? formatMoney(summary.remainingCny) : "—"}</dd>
            </dl>
            <button
              type="button"
              className="assets-metric assets-expiring-metric"
              data-tone="warning"
              aria-pressed={filter === "expiring"}
              aria-label={"筛选 30 天内到期的 " + expiringCount + " 台节点"}
              onClick={() => { setFilter((value) => value === "expiring" ? "all" : "expiring"); setSearch(""); }}
            >
              <span className="assets-metric-label">30 天内到期</span>
              <span className="assets-metric-value">{expiringCount}<span className="assets-metric-unit">台</span></span>
            </button>
          </section>
          <dl className="assets-ledger">
            {ledgerRows.map((row) => (
              <div key={row.label} title={row.title}>
                <dt>{row.label}</dt><dd style={{ color: row.tone }}>{row.value}</dd>
              </div>
            ))}
          </dl>
          {rateQuery.isError && (
            <p className="assets-rate-error" role="alert">
              {summary ? "汇率刷新失败，当前保留上次结果。可点击“刷新汇率”重试。" : "汇率获取失败，可点击“刷新汇率”重试。"}
            </p>
          )}

          <section className="assets-details" aria-labelledby="assets-details-title">
            <div className="assets-details-head">
              <h2 id="assets-details-title">费用明细<span>{nodes.length} 台</span></h2>
              <input
                className="assets-search"
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="搜索节点、分组或地区"
                aria-label="搜索节点、分组或地区"
              />
            </div>
            <div className="assets-toolbar">
              <div className="assets-filters" role="group" aria-label="到期筛选">
                {filters.map((item) => (
                  <button type="button" key={item.value} aria-pressed={filter === item.value} onClick={() => setFilter(item.value)}>
                    {item.label}<span>{item.count}</span>
                  </button>
                ))}
              </div>
              <div className="assets-sort-control">
                <label>
                  <span className="sr-only">排序字段</span>
                  <select value={sortField} onChange={(event) => handleSort(event.target.value as AssetsSortField)}>
                    {columns.map((column) => <option key={column.field} value={column.field}>{column.field === "weight" ? "默认排序" : "按" + (column.label === "原价 / 周期" ? "价格" : column.label)}</option>)}
                  </select>
                </label>
                <button type="button" onClick={() => setSortDirection((value) => value === "asc" ? "desc" : "asc")} aria-label={sortDirection === "asc" ? "切换为倒序" : "切换为正序"}>
                  {sortDirection === "asc" ? <ChevronUp size={15} /> : <ChevronDown size={15} />}
                </button>
              </div>
            </div>

            {!summary ? (
              <div className="assets-empty" role="status">{rateQuery.isError ? "暂时无法计算费用" : <><Spinner size={18} />费用明细加载中</>}</div>
            ) : detailRows.length === 0 ? (
              <div className="assets-empty" role="status"><span>没有符合条件的节点</span><button type="button" onClick={resetFilters}>清除筛选</button></div>
            ) : !isMobileLayout ? (
              <div className="assets-table-wrap">
                <table className="assets-table" aria-label="节点费用明细">
                  <thead><tr>
                    {columns.map((column) => (
                      <th key={column.field} data-numeric={column.numeric || undefined} aria-sort={sortField === column.field ? sortDirection === "asc" ? "ascending" : "descending" : undefined}>
                        <button type="button" onClick={() => handleSort(column.field)} data-active={sortField === column.field}>
                          {column.label}{sortField === column.field && (sortDirection === "asc" ? <ChevronUp size={12} /> : <ChevronDown size={12} />)}
                        </button>
                      </th>
                    ))}
                  </tr></thead>
                  <tbody>
                    {detailRows.map((detail) => {
                      const node = nodeByUuid.get(detail.uuid);
                      const expiry = expiryByUuid.get(detail.uuid)!;
                      return (
                        <tr key={detail.uuid} data-expired={expiry.expired}>
                          <td>
                            <Link to={"/instance/" + encodeURIComponent(detail.uuid)} className="assets-node-link" title={detail.name}>
                              <Flag region={detail.region} size={13} /><span>{detail.name}</span>
                            </Link>
                            <div className="assets-node-meta">{node?.group && <span>{node.group}</span>}{detail.note && <span className="assets-note-chip">{detail.note}</span>}</div>
                          </td>
                          <td data-numeric>{originalPrice(detail)}</td>
                          <td data-numeric>{detail.counted ? formatMoney(detail.monthlyCny) : "—"}</td>
                          <td data-numeric data-strong>{detail.counted ? formatMoney(detail.remainingCny) : "—"}</td>
                          {hasPremium && <>
                            <td data-numeric style={{ color: premiumTone(detail.premiumCny) }}>{detail.premiumCny !== 0 ? formatSignedMoney(detail.premiumCny) : "—"}</td>
                            <td data-numeric title={detail.amortMonths != null ? "摊销 " + Math.round(detail.amortMonths) + " 个月" : undefined}>{detail.premiumCny !== 0 && detail.amortMonths != null ? formatSignedMoney(detail.premiumMonthlyCny) : "—"}</td>
                          </>}
                          <td><ExpiryStatus expiry={expiry} /></td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="assets-card-list">
                {detailRows.map((detail) => (
                  <article className="assets-node-card" key={detail.uuid}>
                    <div className="assets-node-card-head">
                      <Link to={"/instance/" + encodeURIComponent(detail.uuid)} className="assets-node-link" title={detail.name}><Flag region={detail.region} size={13} /><span>{detail.name}</span></Link>
                      {detail.note && <span className="assets-note-chip">{detail.note}</span>}
                    </div>
                    <span className="assets-original-price">{originalPrice(detail)}</span>
                    <dl className="assets-card-amounts">
                      <div><dt>月均成本</dt><dd>{detail.counted ? formatMoney(detail.monthlyCny) : "—"}</dd></div>
                      <div><dt>剩余价值</dt><dd>{detail.counted ? formatMoney(detail.remainingCny) : "—"}</dd></div>
                      {detail.premiumCny !== 0 && <>
                        <div><dt>溢价</dt><dd style={{ color: premiumTone(detail.premiumCny) }}>{formatSignedMoney(detail.premiumCny)}</dd></div>
                        {detail.amortMonths != null && <div><dt>溢价月摊</dt><dd>{formatSignedMoney(detail.premiumMonthlyCny)}</dd></div>}
                      </>}
                    </dl>
                    <ExpiryStatus expiry={expiryByUuid.get(detail.uuid)!} />
                  </article>
                ))}
              </div>
            )}
            {summary && detailRows.length > 0 && <div className="assets-table-footer" role="status">显示 {detailRows.length} / {nodes.length} 台<span>已计入费用 {countedCount} 台</span></div>}
          </section>

          <details className="assets-rates">
            <summary>
              <span>换算汇率</span>
              <span>{rateQuery.data ? "更新于 " + new Date(rateQuery.data.time).toLocaleString("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }) : "暂无汇率"}</span>
              <ChevronDown size={14} aria-hidden />
            </summary>
            {exchangeRateRows.length > 0 ? <dl className="assets-rate-list">{exchangeRateRows.map((item) => <div key={item.code}><dt>1 {item.code}</dt><dd>{formatMoney(item.value)}</dd></div>)}</dl> : <div className="assets-empty is-compact">暂无可用汇率</div>}
          </details>
        </>
      )}
    </div>
  );
}
