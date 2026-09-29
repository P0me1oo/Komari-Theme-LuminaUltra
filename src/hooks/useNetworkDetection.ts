import { useMutation, useQueryClient } from "@tanstack/react-query";
import { networkDetectionMessage, runNetworkDetection, type NetworkDetectionKind } from "@/services/networkInfo";

export function useNetworkDetection(kind: NetworkDetectionKind = "route") {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () => runNetworkDetection(kind),
    onSuccess: () => { void queryClient.invalidateQueries({ queryKey: ["network-info"] }); },
  });
  const notice = mutation.error
    ? { message: mutation.error.message, error: true }
    : mutation.data ? { message: networkDetectionMessage(mutation.data, kind), error: false } : null;
  return { run: mutation.mutate, running: mutation.isPending, notice, reset: mutation.reset };
}
