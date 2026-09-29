import { createContext, useContext } from "react";
import type { NetworkResults } from "@/services/networkInfo";

export const NetworkInfoContext = createContext<NetworkResults | undefined>(undefined);

export function useNetworkInfo(uuid: string) {
  const data = useContext(NetworkInfoContext);
  return { node: data?.nodes.find((node) => node.uuid === uuid), settings: data };
}
