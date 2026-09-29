import batteries from "./batteries.svg";
import consumption from "./consumption.svg";
import generator from "./generator.svg";
import powerTransformer from "./power-transformer.svg";
import solarPanels from "./solar-panels.svg";

export const INDUSTRIAL_ASSETS = {
  generator,
  batteries,
  consumption,
  powerTransformer,
  solarPanels,
} as const;

export type IndustrialAssetId = keyof typeof INDUSTRIAL_ASSETS;

export function industrialAsset(id: IndustrialAssetId) {
  return INDUSTRIAL_ASSETS[id];
}
