import { ArrowRight } from "lucide-react";

function segmentNetwork(label: string) {
  switch (label.trim().toUpperCase()) {
    case "CN2":
    case "CN2GIA":
    case "CN2GT":
      return "CN2";
    case "CTGGIA":
    case "电信国际":
      return "电信国际";
    case "CMI":
      return "CMI";
    case "CMIN2":
      return "CMIN2";
    case "9929":
      return "9929";
    case "10099":
      return "10099";
    default:
      return undefined;
  }
}

export function NetworkRouteSegments({ label }: { label: string }) {
  return label.split(/\s*(?:->|→)\s*/).filter(Boolean).map((segment, index) => (
    <span className="network-route-segment" key={index}>
      {index > 0 && <ArrowRight size={13} aria-label="转接至" />}
      <span className="network-route-badge" data-network={segmentNetwork(segment)}>{segment}</span>
    </span>
  ));
}
