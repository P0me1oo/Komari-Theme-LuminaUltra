import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getHomeBandwidthHistory } from "@/services/api";
import { aggregateHomeBandwidth, bandwidthPath } from "@/utils/homeBandwidth";

export function HomeBandwidthTrend({ uuids }: { uuids: string[] }) {
  const ids = useMemo(() => [...new Set(uuids)].sort(), [uuids]);
  const history = useQuery({
    queryKey: ["home-bandwidth", ids],
    queryFn: ({ signal }) => getHomeBandwidthHistory(ids, { signal, timeout: 8_000 }),
    enabled: ids.length > 0,
    staleTime: 0,
    gcTime: 60_000,
    refetchInterval: 5_000,
    refetchIntervalInBackground: false,
    retry: 1,
  });
  const points = useMemo(() => history.data
    ? aggregateHomeBandwidth(history.data.series, ids, history.data.start, history.data.end)
    : [], [history.data, ids]);
  const hasData = points.some((point) => point.up != null || point.down != null);
  const max = Math.max(1, ...points.flatMap((point) => [point.up ?? 0, point.down ?? 0]));
  return (
    <div className="home-bandwidth-trend">
      {hasData ? (
        <svg viewBox="0 0 260 44" preserveAspectRatio="none" role="img" aria-label="最近 60 秒带宽趋势：实线为上传，虚线为下载">
          <title>最近 60 秒带宽趋势；窗口结束于 {new Date(history.data!.end).toLocaleTimeString()}</title>
          <path d={bandwidthPath(points, "up", max)} className="home-bandwidth-up" />
          <path d={bandwidthPath(points, "down", max)} className="home-bandwidth-down" strokeDasharray="3 3" />
        </svg>
      ) : <div className="home-bandwidth-empty" role="status">{history.isLoading ? "正在加载…" : history.isError ? "历史更新失败" : "暂无历史"}</div>}
    </div>
  );
}
