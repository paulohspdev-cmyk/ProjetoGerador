import { useMemo, useState } from "react";
import { ChevronDown, LayoutGrid, List, RefreshCw, Rows3, SlidersHorizontal } from "lucide-react";

import { Topbar } from "@/components/layout/Topbar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { statusLabel, type GenStatus } from "@/data/generators";
import { cn } from "@/lib/utils";
import { CompactCard } from "./CompactCard";
import { GeneratorTable } from "./GeneratorTable";
import { KpiStrip } from "./KpiStrip";
import { PowerFlowCard } from "./PowerFlowCard";
import { useGenerators } from "./GeneratorsProvider";
import "./generator-six-card.css";

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
  const [view, setView] = useState<View>("principal");
  const [status, setStatus] = useState<GenStatus | "todos">("todos");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(0);

  const items = useMemo(
    () =>
      generators.filter(
        (generator) =>
          (status === "todos" || generator.status === status) &&
          (generator.tag.toLowerCase().includes(query.toLowerCase()) ||
            generator.controller.toLowerCase().includes(query.toLowerCase()) ||
            generator.site.toLowerCase().includes(query.toLowerCase())),
      ),
    [generators, status, query],
  );

  const pageSize = view === "principal" ? 5 : view === "lista" ? 12 : 8;
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

  const tools = (
    <div className="flex min-w-max items-center gap-2 pr-2 lg:min-w-0 lg:flex-1 lg:px-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-bold transition-colors hover:bg-secondary data-[state=open]:border-primary/50 data-[state=open]:bg-secondary"
          >
            <currentView.icon className="size-4 text-primary" />
            <span>{currentView.label}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
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
            className="inline-flex h-8 items-center gap-2 rounded-md border border-border bg-card px-3 text-xs font-bold transition-colors hover:bg-secondary data-[state=open]:border-primary/50 data-[state=open]:bg-secondary"
          >
            <SlidersHorizontal className="size-4 text-primary" />
            <span>{currentFilter.label}</span>
            <ChevronDown className="size-3.5 text-muted-foreground" />
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
  );

  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
      <Topbar
        breadcrumb={["RC Geradores", "Geradores"]}
        title="Geradores"
        tools={tools}
        search={{
          value: query,
          onChange: (value) => {
            setQuery(value);
            setGroup(0);
          },
        }}
      />

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

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
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
            <div className="scroll-slim grid h-full min-h-0 min-w-0 grid-cols-1 content-start gap-2 overflow-auto p-0.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
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

        {pages > 1 && (
          <div className="flex shrink-0 items-center justify-center gap-3 border-t border-border/60 pt-1 text-xs text-muted-foreground">
            <button
              type="button"
              disabled={page === 0}
              onClick={() => setGroup((current) => Math.max(0, current - 1))}
              className="h-7 rounded-md border border-border px-3 font-semibold text-foreground disabled:opacity-40"
            >
              Anterior
            </button>
            <span className="num font-semibold">
              Página {page + 1} de {pages}
            </span>
            <button
              type="button"
              disabled={page >= pages - 1}
              onClick={() => setGroup((current) => Math.min(pages - 1, current + 1))}
              className="h-7 rounded-md border border-border px-3 font-semibold text-foreground disabled:opacity-40"
            >
              Próxima
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
