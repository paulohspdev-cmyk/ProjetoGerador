import type { CSSProperties } from "react";

// Pure layout calculations for the Vertical board. Keep these free of React
// state and of generator status: filtering and industrial truth belong elsewhere.
const VERTICAL_GAP = 8;
const VERTICAL_PADDING = 4;
const VERTICAL_MIN_CARD_WIDTH = 285;
const VERTICAL_MIN_CARD_HEIGHT = 720;

export function verticalColumnCount(width: number) {
  const usableWidth = Math.max(1, width - VERTICAL_PADDING * 2);
  return Math.max(
    1,
    Math.floor((usableWidth + VERTICAL_GAP) / (VERTICAL_MIN_CARD_WIDTH + VERTICAL_GAP)),
  );
}

export function verticalRowCount(height: number) {
  const usableHeight = Math.max(1, height - VERTICAL_PADDING * 2);
  return Math.max(
    1,
    Math.floor((usableHeight + VERTICAL_GAP) / (VERTICAL_MIN_CARD_HEIGHT + VERTICAL_GAP)),
  );
}

export function calculateVerticalLayout(viewportWidth: number, viewportHeight: number) {
  const width = Math.max(1, viewportWidth || 1200);
  const height = Math.max(1, viewportHeight || 720);
  const usableWidth = Math.max(1, width - VERTICAL_PADDING * 2);
  const usableHeight = Math.max(1, height - VERTICAL_PADDING * 2);
  const columns = verticalColumnCount(width);
  const rows = verticalRowCount(height);
  const cardWidth = (usableWidth - VERTICAL_GAP * Math.max(0, columns - 1)) / Math.max(1, columns);
  const cardHeight = (usableHeight - VERTICAL_GAP * Math.max(0, rows - 1)) / Math.max(1, rows);

  return {
    columns,
    rows,
    pageSize: columns * rows,
    cardWidth: Math.max(1, cardWidth),
    cardHeight: Math.max(1, cardHeight),
  };
}

type VerticalGrid = { columns: number; rows: number };

export function calculateVerticalGridStyle({
  layout,
  fullscreenGrid,
  viewportWidth,
  viewportHeight,
  visibleCount,
}: {
  layout: ReturnType<typeof calculateVerticalLayout>;
  fullscreenGrid: VerticalGrid | null;
  viewportWidth: number;
  viewportHeight: number;
  visibleCount: number;
}): CSSProperties {
  const columns = Math.max(1, fullscreenGrid?.columns ?? layout.columns);
  const rows = Math.max(1, fullscreenGrid?.rows ?? layout.rows);
  const usableWidth = Math.max(1, (viewportWidth || 1200) - VERTICAL_PADDING * 2);
  const usableHeight = Math.max(1, (viewportHeight || 720) - VERTICAL_PADDING * 2);
  // A partial last row retains the same column count and left alignment.
  const displayColumns = columns;
  const displayRows = Math.max(
    1,
    Math.min(rows, Math.ceil(Math.max(1, visibleCount) / displayColumns)),
  );
  const cardWidth = (usableWidth - VERTICAL_GAP * Math.max(0, displayColumns - 1)) / displayColumns;
  const cardHeight = (usableHeight - VERTICAL_GAP * Math.max(0, displayRows - 1)) / displayRows;

  return {
    "--vref-columns": displayColumns,
    "--vref-rows": displayRows,
    "--vref-card-width": Math.max(1, cardWidth) + "px",
    "--vref-card-height": Math.max(1, cardHeight) + "px",
    "--vref-gap": VERTICAL_GAP + "px",
    "--vref-padding": VERTICAL_PADDING + "px",
  } as CSSProperties;
}
