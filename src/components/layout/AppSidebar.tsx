import { Fragment, useEffect, useMemo, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Bell,
  ChevronDown,
  LogOut,
  Maximize2,
  Minimize2,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Sun,
  UserRound,
  X,
  Zap,
} from "lucide-react";

import { navGroups } from "@/data/nav";
import { cn } from "@/lib/utils";
import { useLayout } from "@/components/layout/LayoutContext";
import { useTheme } from "@/components/layout/ThemeProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { useGenerators } from "@/components/generators/GeneratorsProvider";
import { useScadaOps } from "@/components/scada/ScadaOpsProvider";
import { buildAlarms } from "@/data/scada";
import { ROLE_LABEL } from "@/lib/auth";
import { RegisterGeneratorButton } from "@/components/generators/RegisterGeneratorButton";
import { canManageGenerators } from "@/components/generators/DeleteGeneratorButton";
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet";

type NavProps = {
  collapsed: boolean;
  onNavigate?: () => void;
  onToggle?: () => void;
  onClose?: () => void;
  touchFriendly?: boolean;
};

function SidebarNav({ collapsed, onNavigate, onToggle, onClose, touchFriendly }: NavProps) {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { can, user, logout } = useAuth();
  const { fullscreen, toggleFullscreen } = useLayout();
  const { theme, toggleTheme } = useTheme();
  const { generators } = useGenerators();
  const { isAcked } = useScadaOps();
  const alarmCount = buildAlarms(generators).filter(
    (alarm) => !isAcked(alarm.id, alarm.ack),
  ).length;
  const canRegister = canManageGenerators(can);
  const admin = can("manageUsers");
  const hrefFor = (slug: string) => (slug === "" ? "/" : `/p/${slug}`);
  const isActive = (slug: string) => pathname === hrefFor(slug);

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
    for (const group of navGroups)
      next[group.title] = group.items.some((item) => pathname === hrefFor(item.slug));
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
          "flex h-16 items-center border-b border-sidebar-border pt-[env(safe-area-inset-top)]",
          collapsed ? "justify-center px-1" : "gap-2 px-3",
        )}
      >
        {!collapsed && (
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <Zap className="size-5" />
          </div>
        )}
        {!collapsed && (
          <div className="min-w-0 flex-1">
            <p className="truncate text-[15px] font-extrabold tracking-wide text-sidebar-foreground">
              RC GERADORES
            </p>
            <p className="truncate text-xs text-muted-foreground">Monitoramento e operação</p>
          </div>
        )}
        {onToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? "Expandir menu" : "Recolher menu"}
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
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
            className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <X className="size-4" />
          </button>
        )}
      </div>

      {pathname !== "/p/geradores" && (
        <div
          className={cn(
            "shrink-0 border-b border-sidebar-border",
            collapsed ? "grid grid-cols-1 gap-1 px-2 py-2" : "grid grid-cols-3 gap-1.5 px-2 py-2",
          )}
          aria-label="Ações rápidas"
        >
          <button
            type="button"
            onClick={toggleTheme}
            title={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            aria-label={theme === "dark" ? "Ativar tema claro" : "Ativar tema escuro"}
            className="grid h-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {theme === "dark" ? <Sun className="size-4" /> : <Moon className="size-4" />}
          </button>
          <button
            type="button"
            onClick={toggleFullscreen}
            title={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            aria-label={fullscreen ? "Sair da tela cheia" : "Tela cheia"}
            aria-pressed={fullscreen}
            className="grid h-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            {fullscreen ? <Minimize2 className="size-4" /> : <Maximize2 className="size-4" />}
          </button>
          <Link
            to="/p/$slug"
            params={{ slug: "alarmes" }}
            title="Alarmes"
            aria-label="Alarmes"
            onClick={onNavigate}
            className="relative grid h-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
          >
            <Bell className="size-4" />
            {alarmCount > 0 && (
              <span className="num absolute right-1 top-0 rounded-full bg-destructive px-1.5 text-[9px] font-bold leading-4 text-destructive-foreground">
                {alarmCount}
              </span>
            )}
          </Link>
        </div>
      )}

      <nav className="scroll-slim flex-1 overflow-y-auto overscroll-contain px-2 py-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {visibleGroups.map((group, groupIndex) => {
          const open = collapsed || !!openGroups[group.title];
          const sectionActive = groupHasActive(group.title);
          return (
            <div key={group.title} className={cn(groupIndex > 0 && "mt-1.5")}>
              {!collapsed && (
                <button
                  type="button"
                  onClick={() => toggleGroup(group.title)}
                  aria-expanded={open}
                  className={cn(
                    "flex w-full items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-sidebar-accent/50",
                    touchFriendly ? "min-h-11" : "h-9",
                    sectionActive && "text-sidebar-accent-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "min-w-0 flex-1 truncate text-xs font-extrabold uppercase tracking-[0.08em]",
                      sectionActive ? "text-primary" : "text-muted-foreground",
                    )}
                  >
                    {group.title}
                  </span>
                  <ChevronDown
                    className={cn(
                      "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
                      open && "rotate-180",
                    )}
                  />
                </button>
              )}
              {collapsed && groupIndex > 0 && <div className="mx-2 mb-2 h-px bg-sidebar-border" />}
              <div
                className={cn(
                  "grid transition-[grid-template-rows] duration-200 ease-out",
                  open ? "grid-rows-[1fr]" : "grid-rows-[0fr]",
                )}
              >
                <ul className="space-y-0.5 overflow-hidden">
                  {group.items.map((item) => {
                    const active = isActive(item.slug);
                    return (
                      <Fragment key={item.slug + item.label}>
                        <li>
                          <Link
                            to={hrefFor(item.slug)}
                            title={collapsed ? item.label : undefined}
                            onClick={onNavigate}
                            className={cn(
                              "group flex items-center gap-2.5 rounded-md px-2 text-sm transition-colors",
                              touchFriendly ? "min-h-11 py-2" : "min-h-9 py-1.5",
                              collapsed && "justify-center px-0",
                              active
                                ? "bg-sidebar-accent font-semibold text-sidebar-accent-foreground shadow-[inset_2px_0_0_0_var(--sidebar-primary)]"
                                : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground",
                            )}
                          >
                            <item.icon
                              className={cn(
                                "size-4 shrink-0",
                                active ? "text-primary" : "text-muted-foreground",
                              )}
                            />
                            {!collapsed && <span className="truncate">{item.label}</span>}
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

      <div
        className={cn(
          "shrink-0 border-t border-sidebar-border pb-[max(0.5rem,env(safe-area-inset-bottom))]",
          collapsed ? "grid place-items-center gap-1 px-2 py-2" : "px-2 py-2",
        )}
      >
        {collapsed ? (
          <>
            <div
              className="grid size-9 place-items-center rounded-full bg-sidebar-accent text-muted-foreground"
              title={`${user?.name ?? "Usuário"} · ${user ? ROLE_LABEL[user.role] : ""}`}
              aria-label={user?.name ?? "Usuário"}
            >
              <UserRound className="size-4" />
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sair"
              aria-label="Sair"
              className="grid size-9 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </>
        ) : (
          <div className="flex min-w-0 items-center gap-2 rounded-md px-1 py-1">
            <div className="grid size-9 shrink-0 place-items-center rounded-full bg-sidebar-accent text-muted-foreground">
              <UserRound className="size-4" />
            </div>
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs font-bold text-sidebar-foreground">
                {user?.name ?? "—"}
              </p>
              <p className="truncate text-[10px] text-muted-foreground">
                {user ? ROLE_LABEL[user.role] : ""}
              </p>
            </div>
            <button
              type="button"
              onClick={logout}
              title="Sair"
              aria-label="Sair"
              className="grid size-9 shrink-0 place-items-center rounded-md text-muted-foreground transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <LogOut className="size-4" />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

export function AppSidebar() {
  const pathname = useRouterState({ select: (r) => r.location.pathname });
  const { collapsed, toggleCollapsed, mobileOpen, setMobileOpen } = useLayout();
  useEffect(() => {
    setMobileOpen(false);
  }, [pathname, setMobileOpen]);

  return (
    <>
      <aside
        className={cn(
          "sticky top-0 hidden h-dvh shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 lg:flex",
          collapsed ? "w-[72px]" : "w-[252px] 3xl:w-[280px]",
        )}
      >
        <SidebarNav collapsed={collapsed} onToggle={toggleCollapsed} />
      </aside>
      <Sheet open={mobileOpen} onOpenChange={setMobileOpen}>
        <SheetContent
          side="left"
          className="flex h-dvh w-[min(20rem,88vw)] flex-col gap-0 border-sidebar-border bg-sidebar p-0 sm:max-w-sm [&>button]:hidden"
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
