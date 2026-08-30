const ASSET_VERSION = "v2";

const IMAGES = {
  generic: `/controllers/generic.png?${ASSET_VERSION}`,
  dse8610: `/controllers/dse8610.png?${ASSET_VERSION}`,
  dse7320: `/controllers/dse7320.png?${ASSET_VERSION}`,
  dse4520: `/controllers/dse4520.png?${ASSET_VERSION}`,
  dse6120: `/controllers/dse6120.png?${ASSET_VERSION}`,
  intelilite9: `/controllers/intelilite9.png?${ASSET_VERSION}`,
  intelimains150: `/controllers/intelimains150.png?${ASSET_VERSION}`,
} as const;

const BY_MODEL: Record<string, string> = {
  DSE8610: IMAGES.dse8610,
  "DSE7320 MKII": IMAGES.dse7320,
  DSE7320: IMAGES.dse7320,
  DSE4520: IMAGES.dse4520,
  "DSE4520 MKII": IMAGES.dse4520,
  DSE6120: IMAGES.dse6120,
  "DEEP SEA 6120": IMAGES.dse6120,
  "DSE 6120": IMAGES.dse6120,
  INTELILITE9: IMAGES.intelilite9,
  "INTELILITE 9": IMAGES.intelilite9,
  "COMAP INTELILITE 9": IMAGES.intelilite9,
  INTELIMAINS150: IMAGES.intelimains150,
  "INTELIMAINS 150": IMAGES.intelimains150,
  "COMAP INTELIMAINS 150": IMAGES.intelimains150,
};

function normalize(model: string) {
  return model.toUpperCase().replace(/\s+/g, " ").trim();
}

export function controllerImageSrc(model: string | null | undefined): string {
  if (!model) return IMAGES.generic;
  const key = normalize(model);
  const exact = BY_MODEL[key];
  if (exact) return exact;

  const packed = key.replace(/[\s-]/g, "");
  const packedMatch = BY_MODEL[packed];
  if (packedMatch) return packedMatch;

  if (key.includes("8610")) return IMAGES.dse8610;
  if (key.includes("7320")) return IMAGES.dse7320;
  if (key.includes("4520")) return IMAGES.dse4520;
  if (key.includes("6120")) return IMAGES.dse6120;
  if (key.includes("INTELILITE")) return IMAGES.intelilite9;
  if (key.includes("INTELIMAINS")) return IMAGES.intelimains150;
  if (key.includes("COMAP")) return IMAGES.intelilite9;

  return IMAGES.generic;
}

export const CONTROLLER_IMAGE_FALLBACK = IMAGES.generic;
