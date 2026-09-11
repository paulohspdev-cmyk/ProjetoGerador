import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { ChevronDown, PanelLeftClose, PanelLeftOpen, X, Zap } from "lucide-react";

import { useAuth } from "@/components/auth/AuthProvider";
import { canManageGenerators } from "@/components/generators/DeleteGeneratorButton";
import { RegisterGeneratorButton } from "@/components/generators/RegisterGeneratorButton";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useLayout } from "@/components/layout/LayoutContext";
import { useScadaOps } from "@/components/scada/ScadaOpsProvider";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";
import { buildAlarms } from "@/data/scada";
import { navGroups } from "@/data/nav";
import { cn } from "@/lib/utils";

type NavProps = {
  collapsed: boolean;
  onNavigate?: () => void;
  onToggle?: () => void;
  onClose?: () => void;
  touchFriendly?: boolean;
};

function SidebarNav({ collapsed, onNavigate, onToggle, onClose, touchFriendly }: NavProps) {
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const { can } = useAuth();
  const { generators, error: generatorsError } = useGenerators();
  const { isAcked, error: opsError } = useScadaOps();
  const alarmCount = buildAlarms(generators).filter(
    (alarm) => !isAcked(alarm.id, alarm.ack),
  ).length;
  const canRegister = canManageGenerators(can);
  const admin = can("manageUsers");
  const hrefFor = (slug: string) => (slug === "" ? "/" : `/p/${slug}`);
  const isActive = (slug: string) => pathname === hrefFor(slug);
  const systemHealthy = !generatorsError && !opsError;

  const visibleGroups = useMemo(
    () =>
      navGroups
        .filter((group) => !group.adminOnly || admin)
        .map((group) => ({
          ...group,
          items: group.items.filter((item) => !item.adminOnly || admin),
        }))
        .filter((group) => group.items.length > 0),
    [admin],
  );

  const groupHasActive = (title: string) =>
    visibleGroups
      .find((group) => group.title === title)
      ?.items.some((item) => isActive(item.slug)) ?? false;

  const [openGroups, setOpenGroups] = useState<Record<string, boolean>>(() => {
    const next: Record<string, boolean> = {};
    for (const group of navGroups) {
      next[group.title] = group.items.some((item) => pathname === hrefFor(item.slug));
    }
    next["Operação"] = true;
    return next;
  });

  useEffect(() => {
    const active = visibleGroups.find((group) =>
      group.items.some((item) => pathname === hrefFor(item.slug)),
    );
    if (!active) return;
    setOpenGroups((previous) => ({ ...previous, [active.title]: true }));
  }, [pathname, visibleGroups]);

  const toggleGroup = (title: string) =>
    setOpenGroups((previous) => ({ ...previous, [title]: !previous[title] }));

  return (
    <>
      <div
        className={cn(
          "flex h-[86px] shrink-0 items-center border-b border-white/5 pt-[env(safe-area-inset-top)]",
          collapsed ? "justify-center px-1" : "gap-3 px-4",
        )}
      >
        <span
          className={cn(
            "rc-sidebar-logo-mark grid shrink-0 place-items-center text-primary",
            collapsed ? "size-10" : "size-11",
          )}
        >
          <Zap className={cn("fill-primary/10", collapsed ? "size-7" : "size-9")} />
        </span>
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[17px] font-black tracking-[0.025em] text-white">
              RC GERADORES
            </p>
            <p className="mt-0.5 truncate text-[11px] text-slate-400">Monitoramento e operação</p>
          </div>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-500 transition-colors hover:bg-white/5 hover:text-white"
          >
            {collapsed ? (
              <PanelLeftOpen className="size-4" />
            ) : (
              <PanelLeftClose className="size-4" />
            )}
          </button>
        )}
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar menu"
            className="grid size-9 shrink-0 place-items-center rounded-lg text-slate-400 transition-colors hover:bg-white/5 hover:text-white"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      <nav className="scroll-slim flex-1 overflow-y-auto overscroll-contain px-2 py-3 pb-4">
        {visibleGroups.map((group, groupIndex) => {
          const open = collapsed || !!openGroups[group.title];
          const sectionActive = groupHasActive(group.title);
          return (
            <div
              key={group.title}
              className={cn(groupIndex > 0 && "mt-2 border-t border-white/[0.055] pt-2")}
            >
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={open}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-lg px-2.5 text-left transition-colors hover:bg-white/[0.035]",
                    touchFriendly ? "min-h-11" : "h-9",
                  )}
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-[11px] font-extrabold uppercase tracking-[0.08em]",
                      sectionActive ? "text-primary" : "text-slate-400",
                    )}
                  >
                    {group.title}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 shrink-0 text-slate-500 transition-transform duration-200",
                      open && "rotate-180",
                    )}
                  />
                </button>
              )}
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <ul className="space-y-0.5 overflow-hidden">
                  {group.items.map((item) => {
                    const active = isActive(item.slug);
                    const alarmItem = item.slug === "alarmes";
                    return (
                      <Fragment key={item.slug + item.label}>
                        <li>
                          <Link
                            to={hrefFor(item.slug)}
                            title={collapsed ? item.label : undefined}
                            onClick={onNavigate}
                            className={cn(
                              "group relative flex items-center gap-3 rounded-lg px-3 text-sm transition-all",
                              touchFriendly ? "min-h-11 py-2" : "min-h-[42px] py-2",
                              collapsed && "justify-center px-0",
                              active
                                ? "rc-nav-active font-semibold text-white"
                                : "text-slate-300 hover:bg-white/[0.045] hover:text-white",
                            )}
                          >
                            <item.icon
                              className={cn(
                                "size-[18px] shrink-0 transition-colors",
                                active
                                  ? "text-primary"
                                  : "text-slate-400 group-hover:text-slate-200",
                              )}
                            />
                            {!collapsed && <span className="truncate pr-8">{item.label}</span>}
                            {alarmItem && alarmCount > 0 && (
                              <span
                                className={cn(
                                  "num absolute rounded-full border border-offline/35 bg-offline px-1.5 text-[9px] font-extrabold leading-4 text-white",
                                  collapsed
                                    ? "right-0 top-0"
                                    : "right-2.5 top-1/2 -translate-y-1/2",
                                )}
                                aria-label={`${alarmCount} alarmes pendentes`}
                              >
                                {alarmCount}
                              </span>
                            )}
                          </Link>
                        </li>
                        {canRegister && item.slug === "geradores" && (
                          <li>
                            <RegisterGeneratorButton
                              collapsed={collapsed}
                              touchFriendly={touchFriendly}
                              onNavigate={onNavigate}
                            />
                          </li>
                        )}
                      </Fragment>
                    );
                  })}
                </ul>
              </div>
            </div>
          );
        })}
      </nav>

      <div className={cn("shrink-0 border-t border-white/[0.055]", collapsed ? "p-2" : "p-3")}>
        <div
          className={cn(
            "rounded-xl border border-white/[0.055] bg-black/10",
            collapsed ? "grid place-items-center p-2" : "px-3 py-3",
          )}
          title={
            systemHealthy ? "Dados operacionais disponíveis" : "Há falha na atualização de dados"
          }
        >
          {collapsed ? (
            <span
              className={cn(
                "size-2.5 rounded-full",
                systemHealthy
                  ? "bg-online shadow-[0_0_12px_var(--online)]"
                  : "bg-offline shadow-[0_0_12px_var(--offline)]",
              )}
            />
          ) : (
            <div className="flex items-start gap-3">
              <span
                className={cn(
                  "mt-1 size-2.5 shrink-0 rounded-full",
                  systemHealthy
                    ? "bg-online shadow-[0_0_12px_var(--online)]"
                    : "bg-offline shadow-[0_0_12px_var(--offline)]",
                )}
              />
              <div className="min-w-0">
                <p className="text-xs font-extrabold text-slate-200">Centro de Operações</p>
                <p className="mt-1 text-[10px] leading-4 text-slate-500">
                  {systemHealthy
                    ? "Dados operacionais disponíveis"
                    : "Atenção na atualização dos dados"}
                </p>
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (router) => router.location.pathname });
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen, fullscreen } = useLayout();

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <>
      {!(pathname === "/p/geradores" && fullscreen) && (
        <aside
          className={cn(
            "rc-sidebar sticky top-0 hidden h-dvh shrink-0 flex-col border-r transition-[width] duration-200 lg:flex",
            collapsed ? "w-[72px]" : "w-[244px] 3xl:w-[260px]",
          )}
        >
          <SidebarNav collapsed={collapsed} onToggle={toggleCollapsed} />
        </aside>
      )}
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="rc-sidebar flex h-dvh w-[min(20rem,88vw)] flex-col gap-0 border-r border-white/5 p-0 sm:max-w-sm [&>button]:hidden"
        >
          <SheetTitle className="sr-only">Menu de navegação</SheetTitle>
          <SheetDescription className="sr-only">Seções do sistema RC Geradores</SheetDescription>
          <SidebarNav
            collapsed={false}
            touchFriendly
            onNavigate={() => setMobileOpen(false)}
            onClose={() => setMobileOpen(false)}
          />
        </SheetContent>
      </Sheet>
    </>
  );
}
