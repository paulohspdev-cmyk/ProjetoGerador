import { OperationalMap } from "./OperationalMap";

export function MapScreen() {
  return (
    <div className="relative min-h-0 flex-1 overflow-hidden bg-panel">
      <OperationalMap />
      <div className="pointer-events-none absolute bottom-8 left-3 z-[1000] rounded-md border border-border bg-card/90 px-2 py-1.5 text-[10px] shadow-sm backdrop-blur sm:bottom-3">
        <p className="mb-1 font-bold uppercase tracking-wider text-muted-foreground">Sites</p>
        <p className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-online" /> Online
        </p>
        <p className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-alert" /> Alerta
        </p>
        <p className="flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-offline" /> Offline
        </p>
      </div>
    </div>
  );
}
