import { useEffect, useId, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getVisitorGeoInfo } from "@/services/visitorInfo";
import { detectVisitorClient, formatVisitTime, maskVisitorIp } from "@/utils/visitorInfo";

export function VisitorInfoCard() {
  const [expanded, setExpanded] = useState(false);
  const [client] = useState(() => detectVisitorClient(navigator.userAgent, navigator.maxTouchPoints));
  const [visitTime] = useState(() => formatVisitTime(new Date(performance.timeOrigin || Date.now())));
  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const detailsId = useId();
  const { data, isFetching, refetch } = useQuery({
    queryKey: ["visitor-geo-info"],
    queryFn: ({ signal }) => getVisitorGeoInfo(signal),
    staleTime: 10 * 60_000,
    gcTime: 30 * 60_000,
    retry: false,
    refetchOnWindowFocus: false,
    refetchOnReconnect: false,
  });

  useEffect(() => {
    if (!expanded) return;
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setExpanded(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setExpanded(false);
      triggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [expanded]);

  const location = data?.location ?? (isFetching ? "正在获取来源" : "网络信息不可用");
  const ip = data?.ip ?? (isFetching ? "获取中" : "暂无法获取");
  const isp = data?.isp ?? (isFetching ? "获取中" : "暂无法获取");
  const rows = [
    { label: "来源", value: location },
    { label: "设备", value: client.device },
    { label: "IP", value: ip, numeric: true },
    { label: "浏览器", value: client.browser },
    { label: "运营商", value: isp },
    { label: "访问时间", value: visitTime, numeric: true },
  ];

  return (
    <div className="visitor-info-dock">
      <section
        className="visitor-info-card"
        data-expanded={expanded}
        aria-label="来源与网络信息"
        ref={rootRef}
      >
        <button
          type="button"
          className="visitor-info-trigger"
          ref={triggerRef}
          aria-expanded={expanded}
          aria-controls={expanded ? detailsId : undefined}
          aria-describedby={detailsId}
          aria-label={`${expanded ? "收起" : "展开"}来源与网络信息`}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? (
            <span id={detailsId} className="visitor-info-grid">
              {rows.map((row) => (
                <span className="visitor-info-row" key={row.label}>
                  <span className="visitor-info-label">{row.label}</span>
                  <span className={`visitor-info-value${row.numeric ? " visitor-info-numeric" : ""}`}>
                    {row.value}
                  </span>
                </span>
              ))}
            </span>
          ) : (
            <span id={detailsId} className="visitor-info-summary">
              <span className="visitor-info-location" title={location} aria-live="polite">{location}</span>
              <span className="visitor-info-ip">{maskVisitorIp(ip)}</span>
              <span className="visitor-info-browser">{client.browser}</span>
            </span>
          )}
        </button>
        {expanded && !data && (
          <button
            type="button"
            className="visitor-info-retry"
            disabled={isFetching}
            onClick={() => void refetch()}
          >
            {isFetching ? "正在获取网络信息" : "重新获取网络信息"}
          </button>
        )}
      </section>
    </div>
  );
}
