export type CapacityUnit = "auto" | "TB" | "GB" | "MB";
export type NetworkRateUnit = "auto" | "Mbps" | "MB/S";
export type AssetCurrency = "CNY" | "USD";

export function normalizeCapacityUnit(value: unknown): CapacityUnit {
  return value === "TB" || value === "GB" || value === "MB" ? value : "auto";
}

export function normalizeNetworkRateUnit(value: unknown): NetworkRateUnit {
  return value === "Mbps" || value === "MB/S" ? value : "auto";
}

export function normalizeAssetCurrency(value: unknown): AssetCurrency {
  return value === "USD" ? "USD" : "CNY";
}
