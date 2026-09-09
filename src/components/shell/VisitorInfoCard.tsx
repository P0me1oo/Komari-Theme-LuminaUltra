import { useEffect, useId, useLayoutEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  IconBrandSocketIo,
  IconBrowser,
  IconBuildingSkyscraper,
  IconClockHour4,
  IconDeviceDesktop,
  IconWorldPin,
} from "@tabler/icons-react";
import { getVisitorGeoInfo } from "@/services/visitorInfo";
import { detectVisitorClient, formatVisitTime, maskVisitorIp } from "@/utils/visitorInfo";

function VisitorLocationIcon({ countryCode = "" }: { countryCode?: string }) {
  const [failedCode, setFailedCode] = useState("");
  if (!countryCode || countryCode === failedCode) return <IconWorldPin size={14} />;

  return (
    <img
      className="visitor-info-flag"
      src={`/assets/flags/${countryCode}.svg`}
      alt=""
      width={16}
      height={16}
      onError={() => setFailedCode(countryCode)}
    />
  );
}

function VisitorInfoSkeleton() {
  return <span className="visitor-info-skeleton" aria-hidden="true" />;
}

export function VisitorInfoCard() {
  const [expanded, setExpanded] = useState(false);
  const [client] = useState(() => detectVisitorClient(navigator.userAgent, navigator.maxTouchPoints));
  const [visitTime] = useState(() => formatVisitTime(new Date(performance.timeOrigin || Date.now())));
  const rootRef = useRef<HTMLElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const hasMeasuredRef = useRef(false);
  const summaryId = useId();
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

  useLayoutEffect(() => {
    const root = rootRef.current;
    const panel = expanded ? detailsRef.current : summaryRef.current;
    if (!root || !panel) return;

    const measure = () => {
      const { width, height } = panel.getBoundingClientRect();
      // 内容按目标宽度排版，外壳单独过渡，避免动画中反复换行。
      if (!hasMeasuredRef.current) root.style.transition = "none";
      root.style.setProperty("--visitor-card-width", `${width}px`);
      root.style.setProperty("--visitor-card-height", `${height}px`);
      if (!hasMeasuredRef.current) {
        // 首次挂载直接显示正常尺寸，后续切换才启用过渡。
        void root.offsetWidth;
        root.style.removeProperty("transition");
        hasMeasuredRef.current = true;
      }
    };

    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(panel);
    return () => observer.disconnect();
  }, [expanded]);

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

  const loading = !data && isFetching;
  const location = data?.location ?? "网络信息不可用";
  const ip = data?.ip ?? "暂无法获取";
  const isp = data?.isp ?? "暂无法获取";
  const rows = [
    {
      id: "location", label: "来源", value: location, summary: true,
      icon: <VisitorLocationIcon countryCode={data?.countryCode} />,
    },
    { id: "device", label: "设备", value: client.device, icon: <IconDeviceDesktop size={14} /> },
    {
      id: "ip", label: "IP", value: expanded ? ip : maskVisitorIp(ip),
      summary: true, summaryValue: maskVisitorIp(ip), numeric: true,
      icon: <IconBrandSocketIo size={14} />,
    },
    { id: "browser", label: "浏览器", value: client.browser, summary: true, icon: <IconBrowser size={14} /> },
    { id: "isp", label: "运营商", value: isp, icon: <IconBuildingSkyscraper size={14} /> },
    { id: "time", label: "访问时间", value: visitTime, numeric: true, icon: <IconClockHour4 size={14} /> },
  ];

  return (
    <div className="visitor-info-dock">
      <section
        className="visitor-info-card"
        data-expanded={expanded}
        aria-label="来源与网络信息"
        aria-busy={loading}
        ref={rootRef}
        onPointerDown={() => triggerRef.current?.blur()}
        onClick={() => setExpanded((value) => !value)}
      >
        <button
          type="button"
          className="visitor-info-trigger"
          ref={triggerRef}
          aria-expanded={expanded}
          aria-controls={detailsId}
          aria-describedby={expanded ? detailsId : summaryId}
          aria-label={`${expanded ? "收起" : "展开"}来源与网络信息`}
        />
        <div className="visitor-info-viewport">
          <div
            id={summaryId}
            ref={summaryRef}
            className="visitor-info-panel visitor-info-summary"
            aria-hidden={expanded}
          >
            {rows.filter((row) => row.summary).map((row) => (
              <span className={`visitor-info-summary-item visitor-info-${row.id}`} key={row.id}>
                <span className="visitor-info-icon" aria-hidden="true">{row.icon}</span>
                <span
                  className={`visitor-info-summary-value${row.numeric ? " visitor-info-numeric" : ""}`}
                  title={!loading && row.id === "location" ? location : undefined}
                >
                  <span className="sr-only">{row.label}：</span>
                  {loading ? <VisitorInfoSkeleton /> : row.summaryValue ?? row.value}
                </span>
              </span>
            ))}
          </div>
          <div
            id={detailsId}
            ref={detailsRef}
            className="visitor-info-panel visitor-info-details"
            aria-hidden={!expanded}
            inert={!expanded}
          >
            <dl className="visitor-info-grid">
              {rows.map((row) => (
                <div className="visitor-info-row" key={row.id}>
                  <dt className="visitor-info-label">
                    <span className="visitor-info-icon" aria-hidden="true">{row.icon}</span>
                    <span className="sr-only">{row.label}</span>
                  </dt>
                  <dd className={`visitor-info-value${row.numeric ? " visitor-info-numeric" : ""}`}>
                    {loading ? <VisitorInfoSkeleton /> : row.value}
                  </dd>
                </div>
              ))}
            </dl>
            {!data && !isFetching && (
              <button
                type="button"
                className="visitor-info-retry"
                onClick={(event) => {
                  event.stopPropagation();
                  void refetch();
                }}
              >
                重新获取网络信息
              </button>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
