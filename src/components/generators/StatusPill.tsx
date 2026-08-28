import type { GenStatus } from "@/data/generators";
import { statusLabel } from "@/data/generators";
import { cn } from "@/lib/utils";

const styles: Record<GenStatus, string> = {
  online: "bg-online/15 text-online border-online/40",
  alerta: "bg-alert/15 text-alert border-alert/40",
  offline: "bg-offline/15 text-offline border-offline/40",
  nao_configurado: "bg-muted text-muted-foreground border-border",
};

export function StatusPill({ status, className }: { status: GenStatus; className?: string }) {
  return (
    <span
      className={cn(
        "num rounded-sm border px-1.5 py-0.5 text-[9px] font-bold tracking-wider",
        styles[status],
        className,
      )}
    >
      {statusLabel[status]}
    </span>
  );
}

export function StatusDot({ status }: { status: GenStatus }) {
  const color =
    status === "online"
      ? "text-online"
      : status === "alerta"
        ? "text-alert"
        : status === "offline"
          ? "text-offline"
          : "text-idle";
  return <span className={cn("led inline-block size-2", color)} style={{ background: "currentColor" }} />;
}
