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
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useLayout } from "@/components/layout/LayoutContext";
import { useTheme } from "@/components/layout/ThemeProvider";
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
  const alarmCount = buildAlarms(generators).filter(
    (alarm) => !isAcked(alarm.id, alarm.ack),
  ).length;

  return (
    <header className="rc-topbar sticky top-0 z-30 shrink-0 border-b pt-[env(safe-area-inset-top)] backdrop-blur-xl">
      <div className="flex min-h-[72px] min-w-0 items-center gap-2 px-3 py-2 sm:px-4 lg:px-5">
        <button
          type="button"
          onClick={toggleMobile}
          aria-label="Abrir menu"
          className="grid size-10 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white lg:hidden"
        >
          <Menu className="size-5" />
        </button>

        <div className="min-w-0 flex-1">
          {back ? (
            <div className="flex min-w-0 items-center">{back}</div>
          ) : (
            <>
              <div className="hidden min-w-0 items-center gap-1.5 text-[11px] text-slate-500 sm:flex">
                {breadcrumb.map((item, index) => (
                  <span key={`${item}-${index}`} className="flex min-w-0 items-center gap-1.5">
                    <span
                      className={cn(
                        "truncate",
                        index === breadcrumb.length - 1 && "text-slate-300",
                      )}
                    >
                      {item}
                    </span>
                    {index < breadcrumb.length - 1 && <ChevronRight className="size-3 shrink-0" />}
                  </span>
                ))}
              </div>
              {title && (
                <h1 className="mt-0.5 truncate text-xl font-extrabold tracking-tight text-white sm:text-2xl">
                  {title}
                </h1>
              )}
            </>
          )}
        </div>

        <div className="hidden min-w-[250px] max-w-[360px] flex-1 justify-center xl:flex">
          {search ? (
            <label className="rc-top-search flex h-10 w-full items-center gap-2 rounded-lg px-3 focus-within:border-primary/70">
              <Search className="size-4 shrink-0 text-slate-500" />
              <input
                value={search.value}
                onChange={(event) => search.onChange(event.target.value)}
                placeholder="Buscar gerador, unidade ou cliente..."
                className="min-w-0 flex-1 bg-transparent text-xs text-slate-200 outline-none placeholder:text-slate-600"
              />
            </label>
          ) : (
            <Link
              to="/p/$slug"
              params={{ slug: "geradores" }}
              className="rc-top-search flex h-10 w-full items-center gap-2 rounded-lg px-3 text-xs text-slate-500 transition-colors hover:border-primary/40 hover:text-slate-300"
            >
              <Search className="size-4" />
              Buscar gerador, unidade ou cliente...
            </Link>
          )}
        </div>

        <div className="ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            className="grid size-9 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            {theme === "dark" ? <Sun className="size-[18px]" /> : <Moon className="size-[18px]" />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            className="hidden size-9 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white sm:grid"
          >
            {fullscreen ? (
              <Minimize2 className="size-[18px]" />
            ) : (
              <Maximize2 className="size-[18px]" />
            )}
          </button>
          <Link
            to="/p/$slug"
            params={{ slug: "alarmes" }}
            title="Alarmes"
            aria-label={`${alarmCount} alarmes pendentes`}
            className="relative grid size-9 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <Bell className="size-[18px]" />
            {alarmCount > 0 && (
              <span className="num absolute -right-0.5 -top-0.5 min-w-4 rounded-full border border-[#06131e] bg-offline px-1 text-center text-[9px] font-extrabold leading-4 text-white">
                {alarmCount > 99 ? "99+" : alarmCount}
              </span>
            )}
          </Link>

          <div className="mx-1 hidden h-8 w-px bg-white/8 md:block" />
          <div className="hidden min-w-0 items-center gap-2.5 md:flex">
            <span className="grid size-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-slate-300">
              <UserRound className="size-4.5" />
            </span>
            <div className="hidden min-w-0 leading-tight 2xl:block">
              <p className="max-w-40 truncate text-xs font-bold text-slate-200">
                {user?.name ?? "Usuário"}
              </p>
              <p className="max-w-40 truncate text-[10px] text-slate-500">
                {user ? ROLE_LABEL[user.role] : ""}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={logout}
            title="Sair"
            aria-label="Sair"
            className="grid size-9 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/5 hover:text-offline"
          >
            <LogOut className="size-[18px]" />
          </button>
        </div>
      </div>

      {tools && (
        <div className="scroll-slim flex min-w-0 items-center overflow-x-auto border-t border-white/[0.055] px-3 py-2 sm:px-4 lg:px-5">
          {tools}
        </div>
      )}
    </header>
  );
}
