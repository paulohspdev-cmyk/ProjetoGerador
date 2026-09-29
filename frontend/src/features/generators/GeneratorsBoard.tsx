import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  LayoutGrid,
  List,
  Menu,
  Maximize2,
  Minimize2,
  RefreshCw,
  Rows3,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/design-system/ui/dropdown-menu";
import { useLayout } from "@/layout/LayoutContext";
import { statusLabel, type GenStatus } from "@/data/generators";
import { cn } from "@/lib/utils";
import { CompactCard } from "./CompactCard";
import { GeneratorTable } from "./GeneratorTable";
import { KpiStrip } from "./KpiStrip";
import { PowerFlowCard } from "./PowerFlowCard";
import { useGenerators } from "./GeneratorsProvider";

type View = "principal" | "compacto" | "lista";

const views: Array<{ id: View; label: string; icon: typeof List }> = [
  { id: "principal", label: "Vertical", icon: Rows3 },
  { id: "compacto", label: "Compacto", icon: LayoutGrid },
  { id: "lista", label: "Lista", icon: List },
];

const VERTICAL_GAP = 8;
const VERTICAL_PADDING = 4;
const VERTICAL_MIN_CARD_WIDTH = 285;
const VERTICAL_MIN_CARD_HEIGHT = 720;

const COMPACT_GAP = 6;
const COMPACT_PADDING = 4;
const COMPACT_MIN_CARD_WIDTH = 160;
const COMPACT_MIN_CARD_HEIGHT = 156;
/** Layouts preferidos para ~18 cards/tela, do mais denso ao mais folgado. */
const COMPACT_LAYOUTS: Array<[number, number]> = [
  [6, 3],
  [9, 2],
  [3, 6],
  [5, 4],
  [4, 5],
  [6, 4],
  [4, 4],
  [6, 2],
  [3, 4],
  [4, 3],
  [3, 3],
  [2, 4],
  [2, 3],
  [2, 2],
  [1, 3],
  [1, 2],
  [1, 1],
];

function verticalColumnCount(width: number) {
  const usableWidth = Math.max(1, width - VERTICAL_PADDING * 2);
  return Math.max(
    1,
    Math.floor((usableWidth + VERTICAL_GAP) / (VERTICAL_MIN_CARD_WIDTH + VERTICAL_GAP)),
  );
}

function verticalRowCount(height: number) {
  const usableHeight = Math.max(1, height - VERTICAL_PADDING * 2);
  return Math.max(
    1,
    Math.floor((usableHeight + VERTICAL_GAP) / (VERTICAL_MIN_CARD_HEIGHT + VERTICAL_GAP)),
  );
}

function compactLayout(width: number, height: number) {
  const usableWidth = Math.max(1, width - COMPACT_PADDING * 2);
  const usableHeight = Math.max(1, height - COMPACT_PADDING * 2);

  for (const [columns, rows] of COMPACT_LAYOUTS) {
    const cardWidth = (usableWidth - COMPACT_GAP * Math.max(0, columns - 1)) / Math.max(1, columns);
    const cardHeight = (usableHeight - COMPACT_GAP * Math.max(0, rows - 1)) / Math.max(1, rows);
    if (cardWidth >= COMPACT_MIN_CARD_WIDTH && cardHeight >= COMPACT_MIN_CARD_HEIGHT) {
      return {
        columns,
        rows,
        pageSize: columns * rows,
        cardWidth,
        cardHeight,
      };
    }
  }

  return {
    columns: 1,
    rows: 1,
    pageSize: 1,
    cardWidth: usableWidth,
    cardHeight: usableHeight,
  };
}

const filters: Array<{ id: GenStatus | "todos"; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "online", label: statusLabel.online },
  { id: "alerta", label: statusLabel.alerta },
  { id: "offline", label: statusLabel.offline },
  { id: "nao_configurado", label: statusLabel.nao_configurado },
];

export function GeneratorsBoard({ showKpis = true }: { showKpis?: boolean }) {
  const { generators, ready, error, refresh } = useGenerators();
  const { fullscreen, toggleFullscreen, toolsOpen, setToolsPanel, toggleMobile } = useLayout();
  const [view, setView] = useState<View>("principal");
  const [status, setStatus] = useState<GenStatus | "todos">("todos");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(0);
  const [edgeHover, setEdgeHover] = useState<"left" | "right" | null>(null);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  const verticalLayout = useMemo(() => {
    const width = Math.max(1, viewport.width || 1200);
    const height = Math.max(1, viewport.height || 720);
    const usableWidth = Math.max(1, width - VERTICAL_PADDING * 2);
    const usableHeight = Math.max(1, height - VERTICAL_PADDING * 2);
    const columns = verticalColumnCount(width);
    const rows = verticalRowCount(height);
    const cardWidth =
      (usableWidth - VERTICAL_GAP * Math.max(0, columns - 1)) / Math.max(1, columns);
    const cardHeight = (usableHeight - VERTICAL_GAP * Math.max(0, rows - 1)) / Math.max(1, rows);

    return {
      columns,
      rows,
      pageSize: columns * rows,
      cardWidth: Math.max(1, cardWidth),
      cardHeight: Math.max(1, cardHeight),
    };
  }, [viewport]);

  const items = useMemo(
    () =>
      generators.filter(
        (generator) =>
          (status === "todos" || generator.status === status) &&
          (generator.tag.toLowerCase().includes(query.toLowerCase()) ||
            (generator.name ?? "").toLowerCase().includes(query.toLowerCase()) ||
            (generator.customer ?? "").toLowerCase().includes(query.toLowerCase()) ||
            generator.controller.toLowerCase().includes(query.toLowerCase()) ||
            generator.site.toLowerCase().includes(query.toLowerCase())),
      ),
    [generators, status, query],
  );

  const compactLayoutState = useMemo(
    () => compactLayout(Math.max(1, viewport.width || 1200), Math.max(1, viewport.height || 720)),
    [viewport],
  );

  const pageSize = useMemo(() => {
    if (!viewport.width || !viewport.height) {
      return view === "principal" ? 4 : view === "lista" ? 12 : 18;
    }
    if (view === "lista") return Math.max(1, Math.floor(viewport.height / 43));
    if (view === "principal") return verticalLayout.pageSize;
    return compactLayoutState.pageSize;
  }, [view, viewport, verticalLayout.pageSize, compactLayoutState.pageSize]);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(group, pages - 1);
  const visible = items.slice(page * pageSize, page * pageSize + pageSize);

  const compactGridStyle = useMemo(
    () =>
      ({
        "--compact-cols": compactLayoutState.columns,
        "--compact-rows": compactLayoutState.rows,
        "--compact-gap": COMPACT_GAP + "px",
        "--compact-padding": COMPACT_PADDING + "px",
      }) as CSSProperties,
    [compactLayoutState],
  );

  const verticalGridStyle = useMemo(() => {
    const columns = Math.max(1, verticalLayout.columns);
    const rows = Math.max(1, verticalLayout.rows);
    const usableWidth = Math.max(1, (viewport.width || 1200) - VERTICAL_PADDING * 2);
    const usableHeight = Math.max(1, (viewport.height || 720) - VERTICAL_PADDING * 2);
    // Preserve the normal grid even when the current page/filter has only a
    // partial row. This keeps cards at their standard width and always places
    // the first generator in the left-most column instead of stretching a
    // single card across the entire viewport.
    const displayColumns = columns;
    const displayRows = Math.max(
      1,
      Math.min(rows, Math.ceil(Math.max(1, visible.length) / displayColumns)),
    );
    const cardWidth =
      (usableWidth - VERTICAL_GAP * Math.max(0, displayColumns - 1)) / displayColumns;
    const cardHeight = (usableHeight - VERTICAL_GAP * Math.max(0, displayRows - 1)) / displayRows;

    return {
      "--vref-columns": displayColumns,
      "--vref-rows": displayRows,
      "--vref-card-width": Math.max(1, cardWidth) + "px",
      "--vref-card-height": Math.max(1, cardHeight) + "px",
      "--vref-gap": VERTICAL_GAP + "px",
      "--vref-padding": VERTICAL_PADDING + "px",
    } as CSSProperties;
  }, [verticalLayout, viewport.width, viewport.height, visible.length]);

  const trulyEmpty = ready && !error && generators.length === 0;
  const filterEmpty = ready && !error && generators.length > 0 && visible.length === 0;
  const currentView = views.find((item) => item.id === view) ?? views[0]!;
  const currentFilter = filters.find((item) => item.id === status) ?? filters[0]!;

  const setFilter = (id: GenStatus | "todos") => {
    setStatus(id);
    setGroup(0);
  };

  const turnPage = useCallback(
    (delta: number) => {
      setGroup((current) => Math.min(pages - 1, Math.max(0, current + delta)));
    },
    [pages],
  );

  useEffect(() => {
    if (!toolsOpen) {
      setToolsPanel(null);
      return;
    }

    setToolsPanel(
      <div className="flex flex-col gap-1.5">
        <div className="grid grid-cols-1 gap-1.5">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 w-full items-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-2.5 text-[11px] font-bold text-slate-100"
              >
                <currentView.icon className="size-3.5 text-primary" />
                <span className="min-w-0 flex-1 truncate text-left">{currentView.label}</span>
                <ChevronDown className="size-3 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-48">
              <DropdownMenuLabel>Visualização</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={view}
                onValueChange={(value) => {
                  setView(value as View);
                  setGroup(0);
                }}
              >
                {views.map((item) => (
                  <DropdownMenuRadioItem key={item.id} value={item.id} className="gap-2">
                    <item.icon className="size-4" />
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className="inline-flex h-8 w-full items-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-2.5 text-[11px] font-bold text-slate-100"
              >
                <SlidersHorizontal className="size-3.5 text-primary" />
                <span className="min-w-0 flex-1 truncate text-left">{currentFilter.label}</span>
                <ChevronDown className="size-3 text-slate-400" />
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" className="w-52">
              <DropdownMenuLabel>Filtrar por status</DropdownMenuLabel>
              <DropdownMenuRadioGroup
                value={status}
                onValueChange={(value) => setFilter(value as GenStatus | "todos")}
              >
                {filters.map((item) => (
                  <DropdownMenuRadioItem key={item.id} value={item.id}>
                    {item.label}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>

        <div className="flex h-8 items-center justify-between gap-1 rounded-md border border-white/10 bg-black/25 px-1">
          <button
            type="button"
            aria-label="Página anterior"
            disabled={page === 0}
            onClick={() => turnPage(-1)}
            className="grid size-7 place-items-center rounded text-slate-200 disabled:opacity-30"
          >
            <ChevronLeft className="size-4" />
          </button>
          <span className="num truncate text-[11px] font-semibold text-slate-200">
            Página {page + 1} de {pages}
          </span>
          <button
            type="button"
            aria-label="Próxima página"
            disabled={page >= pages - 1}
            onClick={() => turnPage(1)}
            className="grid size-7 place-items-center rounded text-slate-200 disabled:opacity-30"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => void toggleFullscreen()}
            title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            aria-pressed={fullscreen}
            className="grid size-8 shrink-0 place-items-center rounded-md border border-white/10 bg-black/25 text-slate-200"
          >
            {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
          </button>
          <label className="flex h-8 min-w-0 flex-1 items-center gap-1.5 rounded-md border border-white/10 bg-black/25 px-2">
            <Search className="size-3.5 shrink-0 text-slate-400" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setGroup(0);
              }}
              placeholder="Buscar"
              aria-label="Buscar gerador"
              className="min-w-0 w-full bg-transparent text-xs text-slate-100 outline-none placeholder:text-slate-500"
            />
          </label>
        </div>
      </div>,
    );

    return () => setToolsPanel(null);
  }, [
    toolsOpen,
    view,
    status,
    page,
    pages,
    query,
    fullscreen,
    currentView,
    currentFilter,
    setToolsPanel,
    toggleFullscreen,
    turnPage,
  ]);

  return (
    <div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <div className="flex h-12 shrink-0 items-center gap-2 border-b border-border bg-panel px-2 lg:hidden">
        <button
          type="button"
          onClick={toggleMobile}
          aria-label="Abrir menu"
          className="grid size-11 shrink-0 place-items-center rounded-lg text-slate-300 transition-colors hover:bg-white/5 hover:text-white"
        >
          <Menu className="size-5" />
        </button>
        <span className="truncate text-sm font-extrabold text-slate-100">Geradores</span>
      </div>
      <div
        className={cn(
          "flex min-h-0 min-w-0 flex-1 flex-col gap-1 overflow-hidden p-1",
          showKpis && "p-2 sm:p-3",
        )}
      >
        {showKpis && <KpiStrip />}

        {!ready && (
          <div className="rounded-md border border-border bg-card px-3 py-2 text-sm text-muted-foreground">
            Carregando cadastro de geradores…
          </div>
        )}

        {error && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-offline/50 bg-offline/10 px-3 py-2 text-sm text-offline">
            <div>
              <b>Falha ao carregar geradores.</b>
              <span className="ml-1">{error}</span>
            </div>
            <button
              type="button"
              onClick={() => void refresh()}
              className="inline-flex h-8 items-center gap-1 rounded-md border border-offline/40 px-2 text-xs font-semibold"
            >
              <RefreshCw className="size-3.5" />
              Tentar novamente
            </button>
          </div>
        )}

        <div ref={viewportRef} className="relative min-h-0 min-w-0 flex-1 overflow-hidden">
          {view === "principal" && (
            <div
              className="generator-vertical-grid generator-reference-card-grid scroll-slim grid h-full min-h-0 min-w-0 overflow-hidden rounded-md bg-panel"
              style={verticalGridStyle}
            >
              {visible.map((generator) => (
                <div className="vref-card-frame" key={generator.id}>
                  <PowerFlowCard gen={generator} />
                </div>
              ))}
              {trulyEmpty && (
                <p className="col-span-full p-6 text-sm text-muted-foreground">
                  Nenhum gerador cadastrado.
                </p>
              )}
              {filterEmpty && (
                <p className="col-span-full p-6 text-sm text-muted-foreground">
                  Nenhum gerador corresponde ao filtro atual.
                </p>
              )}
            </div>
          )}

          {view === "compacto" && (
            <div
              className="compact-generator-grid scroll-slim grid h-full min-h-0 min-w-0 overflow-hidden"
              style={compactGridStyle}
            >
              {visible.map((generator) => (
                <CompactCard key={generator.id} gen={generator} />
              ))}
              {trulyEmpty && (
                <p className="col-span-full p-6 text-sm text-muted-foreground">
                  Nenhum gerador cadastrado.
                </p>
              )}
              {filterEmpty && (
                <p className="col-span-full p-6 text-sm text-muted-foreground">
                  Nenhum gerador corresponde ao filtro atual.
                </p>
              )}
            </div>
          )}

          {pages > 1 && (
            <>
              <div
                className="absolute left-0 top-[8%] z-40 flex h-20 w-10 items-center justify-center"
                onMouseEnter={() => setEdgeHover("left")}
                onMouseLeave={() => setEdgeHover(null)}
              >
                <button
                  type="button"
                  aria-label="Página anterior"
                  title="Página anterior"
                  disabled={page === 0}
                  onClick={() => turnPage(-1)}
                  className={cn(
                    "grid size-8 place-items-center rounded-md border border-border bg-card text-foreground transition-opacity",
                    edgeHover === "left" && page > 0
                      ? "opacity-100"
                      : "pointer-events-none opacity-0",
                  )}
                >
                  <ChevronLeft className="size-5" />
                </button>
              </div>
              <div
                className="absolute right-0 top-[8%] z-40 flex h-20 w-10 items-center justify-center"
                onMouseEnter={() => setEdgeHover("right")}
                onMouseLeave={() => setEdgeHover(null)}
              >
                <button
                  type="button"
                  aria-label="Próxima página"
                  title="Próxima página"
                  disabled={page >= pages - 1}
                  onClick={() => turnPage(1)}
                  className={cn(
                    "grid size-8 place-items-center rounded-md border border-border bg-card text-foreground transition-opacity",
                    edgeHover === "right" && page < pages - 1
                      ? "opacity-100"
                      : "pointer-events-none opacity-0",
                  )}
                >
                  <ChevronRight className="size-5" />
                </button>
              </div>
            </>
          )}

          {view === "lista" && (
            <div className="scroll-slim h-full min-h-0 min-w-0 overflow-auto">
              <GeneratorTable items={visible} />
              {trulyEmpty && (
                <p className="p-6 text-sm text-muted-foreground">Nenhum gerador cadastrado.</p>
              )}
              {filterEmpty && (
                <p className="p-6 text-sm text-muted-foreground">
                  Nenhum gerador corresponde ao filtro atual.
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}