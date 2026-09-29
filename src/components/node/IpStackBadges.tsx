// 根据节点地址或已查询到的协议显示 V4/V6，不渲染完整 IP。
export function IpStackBadges({
  ipv4,
  ipv6,
  families = [],
}: {
  ipv4?: string | null;
  ipv6?: string | null;
  families?: number[];
}) {
  const hasV4 = Boolean(ipv4) || families.includes(4);
  const hasV6 = Boolean(ipv6) || families.includes(6);
  if (!hasV4 && !hasV6) return null;
  return (
    <>
      {hasV4 ? <span className="ip-stack-badge" data-tag="green">V4</span> : null}
      {hasV6 ? <span className="ip-stack-badge" data-tag="green">V6</span> : null}
    </>
  );
}
