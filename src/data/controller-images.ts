const V = "v2";
const GENERIC = `/controllers/generic.png?${V}`;

const BY_MODEL: Record<string, string> = {
  DSE8610: `/controllers/dse8610.png?${V}`,
  "DSE7320 MKII": `/controllers/dse7320.png?${V}`,
  DSE7320: `/controllers/dse7320.png?${V}`,
  DSE4520: `/controllers/dse4520.png?${V}`,
  "DSE4520 MKII": `/controllers/dse4520.png?${V}`,
  DSE6120: `/controllers/dse6120.png?${V}`,
  "DEEP SEA 6120": `/controllers/dse6120.png?${V}`,
  "DSE 6120": `/controllers/dse6120.png?${V}`,
  INTELILITE9: `/controllers/intelilite9.png?${V}`,
  "INTELILITE 9": `/controllers/intelilite9.png?${V}`,
  "COMAP INTELILITE 9": `/controllers/intelilite9.png?${V}`,
  INTELIMAINS150: `/controllers/intelimains150.png?${V}`,
  "INTELIMAINS 150": `/controllers/intelimains150.png?${V}`,
  "COMAP INTELIMAINS 150": `/controllers/intelimains150.png?${V}`,
};

function normalize(model: string) {
  return model.toUpperCase().replace(/\s+/g, " ").trim();
}

export function controllerImageSrc(model: string | null | undefined) {
  if (!model) return GENERIC;
  const key = normalize(model);
  if (BY_MODEL[key]) return BY_MODEL[key];

  const packed = key.replace(/[\s-]/g, "");
  if (BY_MODEL[packed]) return BY_MODEL[packed];

  if (key.includes("8610")) return BY_MODEL.DSE8610;
  if (key.includes("7320")) return BY_MODEL.DSE7320;
  if (key.includes("4520")) return BY_MODEL.DSE4520;
  if (key.includes("6120")) return BY_MODEL.DSE6120;
  if (key.includes("INTELILITE")) return BY_MODEL["INTELILITE 9"];
  if (key.includes("INTELIMAINS")) return BY_MODEL["INTELIMAINS 150"];
  if (key.includes("COMAP")) return BY_MODEL["INTELILITE 9"];

  return GENERIC;
}

export const CONTROLLER_IMAGE_FALLBACK = GENERIC;
