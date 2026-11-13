import type { ControllerConnectionV3, ControllerInstanceV3, TopologyV3 } from "@/lib/domain-api";

export const emptyTopology: TopologyV3 = {
  assets: [],
  links: [],
  counts: { assets: 0, controllers: 0, connections: 0, links: 0 },
};

export function errorText(error: unknown) {
  return error instanceof Error ? error.message : "Falha na operação.";
}

export type ControllerRow = ControllerInstanceV3 & {
  legacy: boolean;
  assetTag: string;
};

export type ConnectionRow = ControllerConnectionV3 & {
  legacy: boolean;
  assetTag: string;
  controllerModel: string;
};
