export const COMPACT_GAP = 6;
export const COMPACT_PADDING = 4;
export const COMPACT_TARGET_PAGE_SIZE = 30;

export const COMPACT_MIN_CARD_WIDTH = 210;
export const COMPACT_MIN_CARD_HEIGHT = 180;
const COMPACT_VERTICAL_TARGET_MIN_WIDTH = 280;
const COMPACT_VERTICAL_TARGET_MIN_HEIGHT = 145;
const COMPACT_TARGET_ASPECT_RATIO = 1.55;

export type CompactDensity = "normal" | "dense" | "videowall";

/**
 * O modo compacto também é o modo videowall. A prioridade é acomodar
 * até 30 geradores por página sem recortar o conteúdo do card.
 *
 * A capacidade da grade é definida pelo espaço disponível, não pela quantidade
 * atual de geradores. Assim o videowall mantém o mesmo tamanho de card hoje e
 * quando novas unidades forem adicionadas, sem "inflar" os cards em páginas
 * parcialmente preenchidas.
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

export function compactLayout(width: number, height: number): CompactLayout {
  const usableWidth = Math.max(1, width - COMPACT_PADDING * 2);
  const usableHeight = Math.max(1, height - COMPACT_PADDING * 2);

  const candidates = COMPACT_LAYOUTS.map(([columns, rows]) => {
    const cardWidth = (usableWidth - COMPACT_GAP * Math.max(0, columns - 1)) / Math.max(1, columns);
    const cardHeight = (usableHeight - COMPACT_GAP * Math.max(0, rows - 1)) / Math.max(1, rows);
    const pageSize = columns * rows;
    const aspectRatio = cardWidth / Math.max(1, cardHeight);
    const verticalTarget = columns === 5 && rows === 6;
    return {
      columns,
      rows,
      pageSize,
      cardWidth,
      cardHeight,
      verticalTarget,
      aspectDistance: Math.abs(Math.log(aspectRatio / COMPACT_TARGET_ASPECT_RATIO)),
    };
  }).filter((candidate) => {
    if (candidate.pageSize > COMPACT_TARGET_PAGE_SIZE) return false;
    if (candidate.verticalTarget) {
      return (
        candidate.cardWidth >= COMPACT_VERTICAL_TARGET_MIN_WIDTH &&
        candidate.cardHeight >= COMPACT_VERTICAL_TARGET_MIN_HEIGHT
      );
    }
    return (
      candidate.cardWidth >= COMPACT_MIN_CARD_WIDTH &&
      candidate.cardHeight >= COMPACT_MIN_CARD_HEIGHT
    );
  });

  if (candidates.length) {
    const exactTarget = candidates.filter(
      (candidate) => candidate.pageSize === COMPACT_TARGET_PAGE_SIZE,
    );
    const verticalTarget = exactTarget.find(
      (candidate) => candidate.columns === 5 && candidate.rows === 6,
    );
    const pool = verticalTarget ? [verticalTarget] : exactTarget.length ? exactTarget : candidates;
    const best = [...pool].sort(
      (a, b) =>
        b.pageSize - a.pageSize ||
        a.aspectDistance - b.aspectDistance ||
        b.cardWidth * b.cardHeight - a.cardWidth * a.cardHeight,
    )[0]!;

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
