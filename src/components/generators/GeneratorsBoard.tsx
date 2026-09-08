import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  ChevronDown,
  LayoutGrid,
  List,
  Maximize2,
  Minimize2,
  Moon,
  RefreshCw,
  Rows3,
  Search,
  SlidersHorizontal,
  Sun,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLayout } from "@/components/layout/LayoutContext";
import { useTheme } from "@/components/layout/ThemeProvider";
import { useScadaOps } from "@/components/scada/ScadaOpsProvider";
import { buildAlarms } from "@/data/scada";
import { statusLabel, type GenStatus } from "@/data/generators";
import { cn } from "@/lib/utils";
import { CompactCard } from "./CompactCard";
import { GeneratorTable } from "./GeneratorTable";
import { KpiStrip } from "./KpiStrip";
import { PowerFlowCard } from "./PowerFlowCard";
import { useGenerators } from "./GeneratorsProvider";
import "./generator-six-card.css";
import "./operator-card-refinement.css";

type View = "principal" | "compacto" | "lista";

const views: Array<{ id: View; label: string; icon: typeof List }> = [
  { id: "principal", label: "Vertical", icon: Rows3 },
  { id: "compacto", label: "Compacto", icon: LayoutGrid },
  { id: "lista", label: "Lista", icon: List },
];

const filters: Array<{ id: GenStatus | "todos"; label: string }> = [
  { id: "todos", label: "Todos" },
  { id: "online", label: statusLabel.online },
  { id: "alerta", label: statusLabel.alerta },
  { id: "offline", label: statusLabel.offline },
  { id: "nao_configurado", label: statusLabel.nao_configurado },
];

export function GeneratorsBoard({ showKpis = true }: { showKpis?: boolean }) {
  const { generators, ready, error, refresh } = useGenerators();
  const { fullscreen, toggleFullscreen } = useLayout();
  const { theme, toggleTheme } = useTheme();
  const { isAcked } = useScadaOps();
  const [view, setView] = useState<View>("principal");
  const [status, setStatus] = useState<GenStatus | "todos">("online");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(0);
  const viewportRef = useRef<HTMLDivElement>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });
  const alarmCount = buildAlarms(generators).filter(
    (alarm) => !isAcked(alarm.id, alarm.ack),
  ).length;

  useEffect(() => {
    const element = viewportRef.current;
    if (!element) return;
    const update = () => setViewport({ width: element.clientWidth, height: element.clientHeight });
    update();
    const observer = new ResizeObserver(update);
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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

  const pageSize = useMemo(() => {
    if (!viewport.width || !viewport.height) {
      return view === "principal" ? 4 : view === "lista" ? 12 : 8;
    }
    if (view === "lista") return Math.max(1, Math.floor(viewport.height / 43));

    if (view === "principal") {
      const readableCardWidth = viewport.width >= 2200 ? 300 : 285;
      return Math.max(1, Math.min(8, Math.floor((viewport.width + 8) / (readableCardWidth + 8))));
    }

    const minimumWidth = 250;
    const minimumHeight = 190;
    const columns = Math.max(1, Math.floor(viewport.width / minimumWidth));
    const rows = Math.max(1, Math.floor(viewport.height / minimumHeight));
    return columns * rows;
  }, [view, viewport]);
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(group, pages - 1);
  const visible = items.slice(page * pageSize, page * pageSize + pageSize);
  const trulyEmpty = ready && !error && generators.length === 0;
  const filterEmpty = ready && !error && generators.length > 0 && visible.length === 0;
  const currentView = views.find((item) => item.id === view) ?? views[0]!;
  const currentFilter = filters.find((item) => item.id === status) ?? filters[0]!;

  const setFilter = (id: GenStatus | "todos") => {
    setStatus(id);
    setGroup(0);
  };

  const footerControls = (
    <div className="flex min-w-max items-center gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[11px] font-bold transition-colors hover:bg-secondary data-[state=open]:border-primary/50 data-[state=open]:bg-secondary"
          >
            <currentView.icon className="size-3.5 text-primary" />
            <span>{currentView.label}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
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
            className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-card px-2.5 text-[11px] font-bold transition-colors hover:bg-secondary data-[state=open]:border-primary/50 data-[state=open]:bg-secondary"
          >
            <SlidersHorizontal className="size-3.5 text-primary" />
            <span>{currentFilter.label}</span>
            <ChevronDown className="size-3 text-muted-foreground" />
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

      <span className="mx-0.5 h-5 w-px bg-border" aria-hidden />
      <button
        type="button"
        onClick={toggleTheme}
        title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
        aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {theme === "dark" ? <Sun className="size-3.5" /> : <Moon className="size-3.5" />}
      </button>
      <button
        type="button"
        onClick={toggleFullscreen}
        title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
        aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
        aria-pressed={fullscreen}
        className="grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        {fullscreen ? <Minimize2 className="size-3.5" /> : <Maximize2 className="size-3.5" />}
      </button>
      <Link
        to="/p/$slug"
        params={{ slug: "alarmes" }}
        title="Alarmes"
        aria-label="Alarmes"
        className="relative grid size-7 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
      >
        <Bell className="size-3.5" />
        {alarmCount > 0 && (
          <span className="num absolute -right-0.5 -top-1 rounded-full bg-destructive px-1 text-[8px] font-bold leading-3.5 text-destructive-foreground">
            {alarmCount}
          </span>
        )}
      </Link>
    </div>
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
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

        <div ref={viewportRef} className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {view === "principal" && (
            <div className="generator-vertical-grid generator-six-card-grid scroll-slim grid h-full min-h-0 min-w-0 gap-2 overflow-auto rounded-md bg-panel p-1.5">
              {visible.map((generator) => (
                <PowerFlowCard key={generator.id} gen={generator} />
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
            <div className="compact-generator-grid scroll-slim grid h-full min-h-0 min-w-0 content-start gap-2 overflow-auto p-0.5">
              {visible.map((generator) => (
                <CompactCard key={generator.id} gen={generator} />
              ))}
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

        <div className="grid min-h-8 shrink-0 grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] items-center gap-1.5 border-t border-border/60 py-0.5 text-[11px] text-muted-foreground">
          <div className="scroll-slim min-w-0 overflow-x-auto">{footerControls}</div>

          <div className="flex items-center justify-center gap-3">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setGroup((current) => Math.max(0, current - 1))}
              className="h-6 rounded-md border border-border px-2.5 text-[11px] font-semibold text-foreground disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="num whitespace-nowrap font-semibold">
              Página {page + 1} de {pages}
            </span>
            <button
              type="button"
              disabled={page >= pages - 1}
              onClick={() => setGroup((current) => Math.min(pages - 1, current + 1))}
              className="h-6 rounded-md border border-border px-2.5 text-[11px] font-semibold text-foreground disabled:opacity-40"
            >
              Próxima
            </button>
          </div>

          <label className="ml-auto flex h-7 min-w-0 max-w-48 items-center gap-1.5 rounded-md border border-input bg-background px-2 focus-within:border-primary">
            <Search className="size-3.5 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(event) => {
                setQuery(event.target.value);
                setGroup(0);
              }}
              placeholder="Buscar"
              aria-label="Buscar gerador"
              className="min-w-0 w-full bg-transparent text-xs outline-none placeholder:text-muted-foreground"
            />
          </label>
        </div>
      </div>
    </div>
  );
}
