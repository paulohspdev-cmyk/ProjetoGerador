export const COMPACT_GAP = 6;
export const COMPACT_PADDING = 4;
export const COMPACT_TARGET_PAGE_SIZE = 30;

export const COMPACT_MIN_CARD_WIDTH = 210;
export const COMPACT_MIN_CARD_HEIGHT = 180;
const COMPACT_TARGET_ASPECT_RATIO = 1.55;

export type CompactDensity = "normal" | "dense" | "videowall";

/**
 * O modo compacto também é o modo videowall. A prioridade é acomodar
 * até 30 geradores por página sem recortar o conteúdo do card.
 *
 * Para conjuntos menores, a grade usa apenas a capacidade necessária para
 * manter os cards legíveis e aproveitar melhor a área disponível. Quando a
 * quantidade não cabe integralmente, escolhemos a maior capacidade segura.
 */
const COMPACT_LAYOUTS: Array<[number, number]> = [
  [6, 5],
  [5, 6],
  [10, 3],
  [3, 10],
  [15, 2],
  [2, 15],
  [5, 5],
  [6, 4],
  [4, 6],
  [8, 3],
  [3, 8],
  [5, 4],
  [4, 5],
  [6, 3],
  [3, 6],
  [9, 2],
  [2, 9],
  [4, 4],
  [5, 3],
  [3, 5],
  [6, 2],
  [2, 6],
  [4, 3],
  [3, 4],
  [3, 3],
  [2, 4],
  [4, 2],
  [2, 3],
  [3, 2],
  [2, 2],
  [1, 3],
  [3, 1],
  [1, 2],
  [2, 1],
  [1, 1],
];

export type CompactLayout = {
  columns: number;
  rows: number;
  pageSize: number;
  cardWidth: number;
  cardHeight: number;
  density: CompactDensity;
};

function compactDensity(cardWidth: number, cardHeight: number, pageSize: number): CompactDensity {
  if (cardWidth >= 400 && cardHeight >= 260) return "videowall";
  if (pageSize >= 20 || cardWidth <= 260 || cardHeight <= 220) return "dense";
  return "normal";
}

export function compactLayout(
  width: number,
  height: number,
  itemCount = COMPACT_TARGET_PAGE_SIZE,
): CompactLayout {
  const usableWidth = Math.max(1, width - COMPACT_PADDING * 2);
  const usableHeight = Math.max(1, height - COMPACT_PADDING * 2);
  const desiredPageSize = Math.min(COMPACT_TARGET_PAGE_SIZE, Math.max(1, Math.floor(itemCount)));

  const candidates = COMPACT_LAYOUTS.map(([columns, rows]) => {
    const cardWidth = (usableWidth - COMPACT_GAP * Math.max(0, columns - 1)) / Math.max(1, columns);
    const cardHeight = (usableHeight - COMPACT_GAP * Math.max(0, rows - 1)) / Math.max(1, rows);
    const pageSize = columns * rows;
    const aspectRatio = cardWidth / Math.max(1, cardHeight);
    return {
      columns,
      rows,
      pageSize,
      cardWidth,
      cardHeight,
      aspectDistance: Math.abs(Math.log(aspectRatio / COMPACT_TARGET_ASPECT_RATIO)),
    };
  }).filter(
    (candidate) =>
      candidate.pageSize <= COMPACT_TARGET_PAGE_SIZE &&
      candidate.cardWidth >= COMPACT_MIN_CARD_WIDTH &&
      candidate.cardHeight >= COMPACT_MIN_CARD_HEIGHT,
  );

  if (candidates.length) {
    const completePage = candidates.filter((candidate) => candidate.pageSize >= desiredPageSize);
    const pool = completePage.length ? completePage : candidates;
    const best = [...pool].sort((a, b) => {
      const capacityOrder = completePage.length ? a.pageSize - b.pageSize : b.pageSize - a.pageSize;
      return (
        capacityOrder ||
        a.aspectDistance - b.aspectDistance ||
        b.cardWidth * b.cardHeight - a.cardWidth * a.cardHeight
      );
    })[0]!;

    return {
      columns: best.columns,
      rows: best.rows,
      pageSize: best.pageSize,
      cardWidth: best.cardWidth,
      cardHeight: best.cardHeight,
      density: compactDensity(best.cardWidth, best.cardHeight, best.pageSize),
    };
  }

  return {
    columns: 1,
    rows: 1,
    pageSize: 1,
    cardWidth: usableWidth,
    cardHeight: usableHeight,
    density: compactDensity(usableWidth, usableHeight, 1),
  };
}
