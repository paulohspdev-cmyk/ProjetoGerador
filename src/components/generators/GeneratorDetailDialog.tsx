import { StatusPill } from "./StatusPill";
import type { Generator } from "@/data/generators";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="num font-semibold text-foreground">{value}</span>
    </div>
  );
}

export function GeneratorDetailDialog({
  gen,
  open,
  onOpenChange,
}: {
  gen: Generator;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const n = gen.tag.replace(/\D/g, "");
  const name = n ? `Gerador ${String(Number(n)).padStart(2, "0")}` : gen.tag;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-primary/40 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {name}
            <StatusPill status={gen.status} />
          </DialogTitle>
          <DialogDescription>
            Detalhes operacionais de {gen.tag} — {gen.site}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1">
          <Row label="Controladora" value={gen.controller} />
          <Row label="Site" value={gen.site} />
          <Row label="Modo" value={gen.mode} />
          <Row label="IP" value={gen.ip} />
          <Row label="Latência" value={gen.latency ? `${gen.latency} ms` : "—"} />
          <Row label="Alarmes" value={String(gen.alarms)} />
          <Row label="Carga" value={`${gen.load} kW`} />
          <Row label="RPM" value={String(gen.rpm)} />
          <Row label="Frequência" value={`${(gen.frequency ?? 0).toFixed(1).replace(".", ",")} Hz`} />
          <Row label="Óleo" value={`${gen.oilPressure.toFixed(1).replace(".", ",")} bar`} />
          <Row label="Temperatura" value={`${gen.coolantTemp} °C`} />
          <Row label="Combustível" value={`${gen.fuelLevel} %`} />
          <Row label="Bateria" value={gen.battery ? `${gen.battery.toFixed(1).replace(".", ",")} V` : "—"} />
          <Row label="Alternador" value={`${gen.alternatorVoltage} V`} />
          <Row label="Horas trabalhadas" value={`${gen.runHours.toFixed(1).replace(".", ",")} h`} />
          <Row label="Horas p/ manutenção" value={`${gen.maintenance} h`} />
          <Row label="MCB" value={gen.mcb ? "Fechado" : "Aberto"} />
          <Row label="GCB" value={gen.gcb ? "Fechado" : "Aberto"} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
