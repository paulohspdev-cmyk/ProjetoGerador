import type { Generator } from "@/data/generators";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

import { StatusPill } from "./StatusPill";
import { displayGeneratorName, formatGeneratorMetric, hasMetric } from "./generator-metrics";

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
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-primary/40 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {displayGeneratorName(gen)} <StatusPill status={gen.status} />
          </DialogTitle>
          <DialogDescription>
            Detalhes operacionais de {gen.tag} — {gen.site}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Row label="Controladora" value={gen.controller || "N/D"} />
          <Row label="Site" value={gen.site || "N/D"} />
          <Row label="Modo" value={hasMetric(gen, "controller_mode_raw") ? gen.mode : "N/D"} />
          <Row label="Endpoint" value={gen.ip || "N/D"} />
          <Row label="Latência" value={gen.latency != null ? `${gen.latency} ms` : "N/D"} />
          <Row label="Alarmes" value={hasMetric(gen, "alarm_count") ? String(gen.alarms) : "N/D"} />
          <Row label="Carga" value={formatGeneratorMetric(gen, "power_kw", gen.load, "kW", 1)} />
          <Row label="RPM" value={formatGeneratorMetric(gen, "rpm", gen.rpm, "rpm", 0)} />
          <Row
            label="Frequência"
            value={formatGeneratorMetric(gen, "frequency", gen.frequency, "Hz", 2)}
          />
          <Row
            label="Óleo"
            value={formatGeneratorMetric(gen, "oil_pressure", gen.oilPressure, "bar", 1)}
          />
          <Row
            label="Temperatura"
            value={formatGeneratorMetric(gen, "coolant_temperature", gen.coolantTemp, "°C", 1)}
          />
          <Row
            label="Combustível"
            value={formatGeneratorMetric(gen, "fuel_level", gen.fuelLevel, "%", 0)}
          />
          <Row
            label="Bateria"
            value={formatGeneratorMetric(gen, "battery_voltage", gen.battery, "V", 1)}
          />
          <Row
            label="Alternador"
            value={formatGeneratorMetric(gen, "alternator_voltage", gen.alternatorVoltage, "V", 1)}
          />
          <Row
            label="Horas trabalhadas"
            value={formatGeneratorMetric(gen, "run_hours", gen.runHours, "h", 1)}
          />
          <Row
            label="Horas p/ manutenção"
            value={formatGeneratorMetric(gen, "maintenance_hours", gen.maintenance, "h", 0)}
          />
          <Row
            label="MCB"
            value={hasMetric(gen, "mcb_closed") ? (gen.mcb ? "Fechado" : "Aberto") : "N/D"}
          />
          <Row
            label="GCB"
            value={hasMetric(gen, "gcb_closed") ? (gen.gcb ? "Fechado" : "Aberto") : "N/D"}
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
