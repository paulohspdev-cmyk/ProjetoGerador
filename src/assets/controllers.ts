const VERSION = "v2";
const PUBLIC_CONTROLLERS_DIR = "/controllers";
const GENERIC = `${PUBLIC_CONTROLLERS_DIR}/generic.png?${VERSION}`;

const BY_MODEL: Record<string, string> = {
  DSE8610: `${PUBLIC_CONTROLLERS_DIR}/dse8610.png?${VERSION}`,
  "DSE7320 MKII": `${PUBLIC_CONTROLLERS_DIR}/dse7320.png?${VERSION}`,
  DSE7320: `${PUBLIC_CONTROLLERS_DIR}/dse7320.png?${VERSION}`,
  DSE4520: `${PUBLIC_CONTROLLERS_DIR}/dse4520.png?${VERSION}`,
  "DSE4520 MKII": `${PUBLIC_CONTROLLERS_DIR}/dse4520.png?${VERSION}`,
  DSE6120: `${PUBLIC_CONTROLLERS_DIR}/dse6120.png?${VERSION}`,
  "DEEP SEA 6120": `${PUBLIC_CONTROLLERS_DIR}/dse6120.png?${VERSION}`,
  "DSE 6120": `${PUBLIC_CONTROLLERS_DIR}/dse6120.png?${VERSION}`,
  INTELILITE9: `${PUBLIC_CONTROLLERS_DIR}/intelilite9.png?${VERSION}`,
  "INTELILITE 9": `${PUBLIC_CONTROLLERS_DIR}/intelilite9.png?${VERSION}`,
  "COMAP INTELILITE 9": `${PUBLIC_CONTROLLERS_DIR}/intelilite9.png?${VERSION}`,
  INTELIMAINS150: `${PUBLIC_CONTROLLERS_DIR}/intelimains150.png?${VERSION}`,
  "INTELIMAINS 150": `${PUBLIC_CONTROLLERS_DIR}/intelimains150.png?${VERSION}`,
  "COMAP INTELIMAINS 150": `${PUBLIC_CONTROLLERS_DIR}/intelimains150.png?${VERSION}`,
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

  if (key.includes("8610")) return BY_MODEL["DSE8610"] ?? GENERIC;
  if (key.includes("7320")) return BY_MODEL["DSE7320"] ?? GENERIC;
  if (key.includes("4520")) return BY_MODEL["DSE4520"] ?? GENERIC;
  if (key.includes("6120")) return BY_MODEL["DSE6120"] ?? GENERIC;

  // Nunca usar a foto de outro modelo apenas por compartilhar fabricante/família.
  // AMF, InteliGen e InteliMains sem asset próprio ficam no placeholder neutro até
  // existir imagem específica e revisada daquele modelo.
  return GENERIC;
}

export const CONTROLLER_IMAGE_FALLBACK = GENERIC;
