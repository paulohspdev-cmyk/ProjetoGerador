import { useMemo, useState } from "react";
import { LayoutGrid, List, Rows3 } from "lucide-react";

import { statusLabel, type GenStatus } from "@/data/generators";
import { Topbar } from "@/components/layout/Topbar";
import { CompactCard } from "./CompactCard";
import { GeneratorTable } from "./GeneratorTable";
import { KpiStrip } from "./KpiStrip";
import { PowerFlowCard } from "./PowerFlowCard";
import { useGenerators } from "./GeneratorsProvider";
import { cn } from "@/lib/utils";
import "./generator-six-card.css";

type View = "principal" | "compacto" | "lista";

const views: Array<{ id: View; label: string; icon: typeof List }> = [
  { id: "principal", label: "Cards verticais", icon: Rows3 },
  { id: "compacto", label: "Cards compactos", icon: LayoutGrid },
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
  const { generators } = useGenerators();
  const [view, setView] = useState<View>("principal");
  const [status, setStatus] = useState<GenStatus | "todos">("todos");
  const [query, setQuery] = useState("");
  const [group, setGroup] = useState(0);

  const items = useMemo(
    () =>
      generators.filter(
        (g) =>
          (status === "todos" || g.status === status) &&
          (g.tag.toLowerCase().includes(query.toLowerCase()) ||
            g.controller.toLowerCase().includes(query.toLowerCase()) ||
            g.site.toLowerCase().includes(query.toLowerCase())),
      ),
    [generators, status, query],
  );

  const pageSize = view === "principal" ? 6 : view === "lista" ? 12 : 8;
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const page = Math.min(group, pages - 1);
  const visible = items.slice(page * pageSize, page * pageSize + pageSize);

  const setFilter = (id: GenStatus | "todos") => {
    setStatus(id);
    setGroup(0);
  };

  const tools = (
    <div className="flex min-w-max items-center gap-1 pr-2 lg:min-w-0 lg:flex-1 lg:px-2">
      <div className="flex shrink-0 rounded-md border border-border p-px">
        {views.map((v) => (
          <button
            key={v.id}
            type="button"
            onClick={() => {
              setView(v.id);
              setGroup(0);
            }}
            className={cn(
              "flex h-7 items-center gap-1 rounded-[4px] px-2 text-[11px] font-semibold transition-colors",
              view === v.id
                ? "bg-primary text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            <v.icon className="size-3.5" />
            <span className="hidden lg:inline">{v.label}</span>
          </button>
        ))}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {filters.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={cn(
              "num h-7 rounded-full border px-2 text-[10px] font-bold tracking-wide transition-colors",
              status === f.id
                ? "border-primary bg-primary text-primary-foreground"
                : "border-border text-muted-foreground hover:text-foreground",
            )}
          >
            {f.label}
          </button>
        ))}
      </div>

      {pages > 1 && (
        <div className="ml-1 flex shrink-0 items-center gap-1 border-l border-border pl-2">
          {Array.from({ length: pages }, (_, i) => (
            <button
              key={i}
              type="button"
              onClick={() => setGroup(i)}
              aria-label={`Grupo de geradores ${i + 1}`}
              aria-pressed={page === i}
              className={cn(
                "num h-7 min-w-8 rounded-md border px-2 text-[11px] font-extrabold transition-colors",
                page === i
                  ? "border-primary bg-primary/20 text-primary"
                  : "border-border text-muted-foreground hover:text-foreground",
              )}
            >
              G{i + 1}
            </button>
          ))}
        </div>
      )}
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

        <div className="min-h-0 min-w-0 flex-1 overflow-hidden">
          {view === "principal" && (
            <div className="generator-vertical-grid generator-six-card-grid scroll-slim grid h-full min-h-0 min-w-0 content-start gap-3 overflow-auto rounded-md bg-panel p-2">
              {visible.map((g) => (
                <PowerFlowCard key={g.id} gen={g} />
              ))}
              {visible.length === 0 && (
                <p className="col-span-full p-6 text-sm text-muted-foreground">
                  Nenhum gerador encontrado.
                </p>
              )}
            </div>
          )}

          {view === "compacto" && (
            <div className="scroll-slim grid h-full min-h-0 min-w-0 grid-cols-1 content-start gap-2 overflow-auto p-0.5 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
              {visible.map((g) => (
                <CompactCard key={g.id} gen={g} />
              ))}
              {visible.length === 0 && (
                <p className="p-6 text-sm text-muted-foreground">Nenhum gerador encontrado.</p>
              )}
            </div>
          )}

          {view === "lista" && (
            <div className="scroll-slim h-full min-h-0 min-w-0 overflow-auto">
              <GeneratorTable items={visible} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
