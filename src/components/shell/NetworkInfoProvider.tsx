import type { ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/hooks/useAuth";
import { NetworkInfoContext } from "@/hooks/useNetworkInfo";
import { getNetworkResults } from "@/services/networkInfo";

export function NetworkInfoProvider({ children }: { children: ReactNode }) {
  const auth = useAuth();
  const identity = auth.data?.logged_in ? auth.data.uuid || "admin" : "guest";
  // 全站只保留一个轮询器，节点数量增加时不增加请求数量。
  const query = useQuery({
    queryKey: ["network-info", identity], queryFn: ({ signal }) => getNetworkResults(signal),
    enabled: !auth.isPending, staleTime: 30000,
    refetchInterval: (current) => current.state.data?.available === false ? 300000 : 30000,
    retry: false, refetchOnWindowFocus: true,
  });
  const data = !auth.isPending && !query.isError && query.data?.available ? query.data : undefined;
  return <NetworkInfoContext.Provider value={data}>{children}</NetworkInfoContext.Provider>;
}
