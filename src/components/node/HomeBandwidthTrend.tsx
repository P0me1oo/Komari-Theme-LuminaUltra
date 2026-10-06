import { useMemo } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getHomeBandwidthHistory, type HomeBandwidthHistory } from "@/services/api";
import { aggregateHomeBandwidth, bandwidthPath, bandwidthRange } from "@/utils/homeBandwidth";

export function HomeBandwidthTrend({ uuids }: { uuids: string[] }) {
  const ids = useMemo(() => [...new Set(uuids)].sort(), [uuids]);
  const queryClient = useQueryClient();
  const queryKey = ["home-bandwidth", ids];
  const history = useQuery({
    queryKey,
    queryFn: ({ signal }) => {
      const previous = queryClient.getQueryData<HomeBandwidthHistory>(queryKey);
      const hasPrevious = previous?.series.some((item) => item.points.some((point) => point.value != null));
      return getHomeBandwidthHistory(ids, {
        signal, timeout: 8_000,
        // 首次加载逐步显示；后台刷新保留原曲线，避免稀疏中间结果造成闪烁。
        onProgress: hasPrevious ? undefined : (data) => queryClient.setQueryData(queryKey, data),
      });
    },
    enabled: ids.length > 0,
    staleTime: 0,
    gcTime: 60_000,
    refetchInterval: 1_000,
    refetchIntervalInBackground: false,
    retry: false,
  });
  const points = useMemo(() => history.data
    ? aggregateHomeBandwidth(history.data.series, ids, history.data.start, history.data.end)
    : [], [history.data, ids]);
  const hasData = points.some((point) => point.up != null || point.down != null);
  const [min, max] = bandwidthRange(points);
  return (
    <div className="home-bandwidth-trend">
      {hasData ? (
        <svg viewBox="0 0 260 44" preserveAspectRatio="none" role="img" aria-label="最近 60 秒上传与下载趋势，颜色与下方数值对应">
          <title>最近 60 秒带宽趋势；窗口结束于 {new Date(history.data!.end).toLocaleTimeString()}</title>
          <path d={bandwidthPath(points, "up", max, min)} className="home-bandwidth-up" />
          <path d={bandwidthPath(points, "down", max, min)} className="home-bandwidth-down" />
        </svg>
      ) : <div className="home-bandwidth-empty" role="status">{history.isLoading ? "正在加载…" : history.isError ? "历史更新失败" : "暂无历史"}</div>}
    </div>
  );
}
