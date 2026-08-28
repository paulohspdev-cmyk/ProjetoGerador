import { StatusPill } from "./StatusPill";
import type { Generator } from "@/data/generators";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 border-b border-border/50 py-1.5 text-[12px]">
      <span className="text-muted-foreground">{label}</span>
      <span className="num font-semibold text-foreground">{value}</span>
    </div>
  );
}

function has(g: Generator, key: string) { return (g.availableMetrics ?? []).includes(key); }
function num(g: Generator, key: string, value: number | null | undefined, unit = "", digits = 1) {
  if (!has(g, key) || value == null || !Number.isFinite(Number(value))) return "N/D";
  const text = Number(value).toFixed(digits).replace(".", ",");
  return unit ? `${text} ${unit}` : text;
}

export function GeneratorDetailDialog({ gen, open, onOpenChange }: { gen: Generator; open: boolean; onOpenChange: (open: boolean) => void }) {
  const n = gen.tag.replace(/\D/g, "");
  const name = n ? `Gerador ${String(Number(n)).padStart(2, "0")}` : gen.tag;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto border-primary/40 bg-card sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{name}<StatusPill status={gen.status} /></DialogTitle>
          <DialogDescription>Detalhes operacionais de {gen.tag} — {gen.site}</DialogDescription>
        </DialogHeader>
        <div className="space-y-1">
          <Row label="Controladora" value={gen.controller || "N/D"} />
          <Row label="Site" value={gen.site || "N/D"} />
          <Row label="Modo" value={has(gen, "controller_mode_raw") ? gen.mode : "N/D"} />
          <Row label="Endpoint" value={gen.ip || "N/D"} />
          <Row label="Latência" value={gen.latency != null ? `${gen.latency} ms` : "N/D"} />
          <Row label="Alarmes" value={has(gen, "alarm_count") ? String(gen.alarms) : "N/D"} />
          <Row label="Carga" value={num(gen, "power_kw", gen.load, "kW", 1)} />
          <Row label="RPM" value={num(gen, "rpm", gen.rpm, "rpm", 0)} />
          <Row label="Frequência" value={num(gen, "frequency", gen.frequency, "Hz", 2)} />
          <Row label="Óleo" value={num(gen, "oil_pressure", gen.oilPressure, "bar", 1)} />
          <Row label="Temperatura" value={num(gen, "coolant_temperature", gen.coolantTemp, "°C", 1)} />
          <Row label="Combustível" value={num(gen, "fuel_level", gen.fuelLevel, "%", 0)} />
          <Row label="Bateria" value={num(gen, "battery_voltage", gen.battery, "V", 1)} />
          <Row label="Alternador" value={num(gen, "alternator_voltage", gen.alternatorVoltage, "V", 1)} />
          <Row label="Horas trabalhadas" value={num(gen, "run_hours", gen.runHours, "h", 1)} />
          <Row label="Horas p/ manutenção" value={num(gen, "maintenance_hours", gen.maintenance, "h", 0)} />
          <Row label="MCB" value={has(gen, "mcb_closed") ? (gen.mcb ? "Fechado" : "Aberto") : "N/D"} />
          <Row label="GCB" value={has(gen, "gcb_closed") ? (gen.gcb ? "Fechado" : "Aberto") : "N/D"} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
