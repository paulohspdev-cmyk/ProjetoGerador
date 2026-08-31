import { type ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import {
  Bell,
  ChevronRight,
  LogOut,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  Search,
  Sun,
  UserRound,
} from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { useLayout } from "@/components/layout/LayoutContext";
import { useTheme } from "@/components/layout/ThemeProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useScadaOps } from "@/components/scada/ScadaOpsProvider";
import { buildAlarms } from "@/data/scada";
import { ROLE_LABEL } from "@/lib/auth";
import { cn } from "@/lib/utils";

type Props = {
  breadcrumb?: string[];
  title?: string;
  tools?: ReactNode;
  search?: { value: string; onChange: (value: string) => void };
  back?: ReactNode;
};

export function Topbar({ breadcrumb = [], title, tools, search, back }: Props) {
  const { toggleMobile, fullscreen, toggleFullscreen } = useLayout();
  const { theme, toggleTheme } = useTheme();
  const { user, logout } = useAuth();
  const { generators } = useGenerators();
  const { isAcked } = useScadaOps();
  const alarmCount = buildAlarms(generators).filter((alarm) => !isAcked(alarm.id, alarm.ack)).length;

  return (
    <header className="sticky top-0 z-20 shrink-0 border-b border-border bg-card/95 pt-[env(safe-area-inset-top)] backdrop-blur">
      <div className="flex min-h-13 min-w-0 flex-wrap items-center gap-1.5 px-2 py-1.5 sm:gap-2 sm:px-3 lg:h-13 lg:flex-nowrap lg:px-4 lg:py-0">
        <button
          type="button"
          onClick={toggleMobile}
          aria-label="Abrir menu"
          className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground lg:hidden"
        >
          <Menu className="size-4.5" />
        </button>

        {back ? (
          <div className="flex min-w-0 shrink items-center">{back}</div>
        ) : (
          <div className="flex min-w-0 shrink items-center gap-1.5">
            {breadcrumb.slice(0, -1).map((item) => (
              <span
                key={item}
                className="hidden min-w-0 items-center gap-1 text-xs text-muted-foreground sm:flex"
              >
                <span className="truncate">{item}</span>
                <ChevronRight className="size-3.5 shrink-0" />
              </span>
            ))}
            {title && (
              <h1 className="max-w-[42vw] truncate text-[15px] font-extrabold tracking-tight sm:max-w-none sm:text-base">
                {title}
              </h1>
            )}
          </div>
        )}

        {tools && (
          <div className="scroll-slim order-3 flex w-full min-w-0 items-center overflow-x-auto border-t border-border/60 pt-1.5 lg:order-none lg:w-auto lg:flex-1 lg:border-0 lg:pt-0">
            {tools}
          </div>
        )}

        <div className={cn("ml-auto flex shrink-0 items-center gap-0.5", !tools && "lg:ml-auto")}>
          {search ? (
            <label className="flex h-8 min-w-0 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 focus-within:border-primary">
              <Search className="size-3.5 shrink-0 text-muted-foreground" />
              <input
                value={search.value}
                onChange={(e) => search.onChange(e.target.value)}
                placeholder="Buscar"
                className="min-w-0 w-24 bg-transparent text-xs outline-none placeholder:text-muted-foreground min-[420px]:w-32 sm:w-40"
              />
            </label>
          ) : (
            <Link
              to="/p/$slug"
              params={{ slug: "geradores" }}
              className="hidden h-8 items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-xs text-muted-foreground transition-colors hover:border-ring hover:text-foreground md:flex"
            >
              <Search className="size-3.5" />
              Buscar gerador
            </Link>
          )}
          <button
            type="button"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            aria-pressed={fullscreen}
            className="hidden size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground sm:grid"
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <Link
            to="/p/$slug"
            params={{ slug: "alarmes" }}
            aria-label="Alarmes"
            className="relative grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
          >
            <Bell className="size-4" />
            {alarmCount > 0 && (
              <span className="num absolute right-0 top-0 rounded-full bg-destructive px-1.5 text-[10px] font-bold leading-4 text-destructive-foreground">
                {alarmCount}
              </span>
            )}
          </Link>
          <div className="ml-1 flex items-center gap-1.5 border-l border-border pl-2 sm:gap-2">
            <div className="hidden size-7 place-items-center rounded-full bg-secondary text-muted-foreground min-[420px]:grid">
              <UserRound className="size-4" />
            </div>
            <div className="hidden leading-tight md:block">
              <p className="max-w-36 truncate text-xs font-bold">{user?.name ?? "—"}</p>
              <p className="text-[11px] text-muted-foreground">{user ? ROLE_LABEL[user.role] : ""}</p>
            </div>
            <button
              type="button"
              onClick={logout}
              aria-label="Sair"
              className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        </div>
      </div>
    </header>
  );
}
