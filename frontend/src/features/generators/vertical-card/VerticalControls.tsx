import type { Generator } from "@/data/generators";
import type { IndustrialCommandAction } from "@/lib/api";
import { cn } from "@/lib/utils";
import { Hand } from "lucide-react";

function modeShort(mode: Generator["mode"]) {
  if (mode === "MANUAL") return "MAN";
  if (mode === "AUTO") return "AUT";
  if (mode === "TESTE") return "TEST";
  return "OFF";
}

export function headerMode(mode: Generator["mode"], known: boolean) {
  return known ? modeShort(mode) : "N/D";
}

function modeEnabled(gen: Generator, action: IndustrialCommandAction) {
  if (action === "off") return gen.capabilities?.off === true;
  if (action === "manual") return gen.capabilities?.manual === true;
  if (action === "auto") return gen.capabilities?.auto === true;
  if (action === "test") return gen.capabilities?.test === true;
  return false;
}

export function VerticalControls({
  gen,
  dse,
  modeKnown,
  canOperate,
  busy,
  onCommand,
}: {
  gen: Generator;
  dse: boolean;
  modeKnown: boolean;
  canOperate: boolean;
  busy: IndustrialCommandAction | null;
  onCommand: (action: IndustrialCommandAction) => void;
}) {
  const activeMode = modeKnown ? modeShort(gen.mode) : "";

  const canOff = Boolean(canOperate && modeEnabled(gen, "off"));
  const canManual = Boolean(canOperate && modeEnabled(gen, "manual"));
  const canAuto = Boolean(canOperate && modeEnabled(gen, "auto"));
  const canTest = Boolean(canOperate && modeEnabled(gen, "test"));

  if (dse) {
    return (
      <section className="vref-section vref-control" aria-label="Controle de modo DSE">
        <div className="vref-mode-row is-dse">
          <button
            type="button"
            disabled={!canOff || busy !== null}
            aria-pressed={activeMode === "OFF"}
            aria-label="OFF"
            className={cn(activeMode === "OFF" && "is-active")}
            title={
              canOff
                ? "Comando OFF homologado para esta controladora"
                : "Comando ainda não homologado"
            }
            onClick={() => canOff && onCommand("off")}
          >
            {busy === "off" ? "..." : "OFF"}
          </button>
          <button
            type="button"
            className={cn("vref-dse-hand", activeMode === "MAN" && "is-active")}
            disabled={!canManual || busy !== null}
            aria-pressed={activeMode === "MAN"}
            aria-label="Manual"
            title={
              canManual
                ? "Comando Manual homologado para esta controladora"
                : "Comando ainda não homologado"
            }
            onClick={() => canManual && onCommand("manual")}
          >
            {busy === "manual" ? "..." : <Hand aria-hidden="true" />}
          </button>
          <button
            type="button"
            className={cn("vref-dse-auto", activeMode === "AUT" && "is-active")}
            disabled={!canAuto || busy !== null}
            aria-pressed={activeMode === "AUT"}
            aria-label="Automático"
            title={
              canAuto
                ? "Comando Automático homologado para esta controladora"
                : "Comando ainda não homologado"
            }
            onClick={() => canAuto && onCommand("auto")}
          >
            {busy === "auto" ? (
              "..."
            ) : (
              <>
                <span className="vref-auto-badge">A</span>
                <span>AUTO</span>
                <i aria-hidden="true" />
              </>
            )}
          </button>
          <button
            type="button"
            disabled={!canTest || busy !== null}
            aria-pressed={activeMode === "TEST"}
            aria-label="TEST"
            className={cn(activeMode === "TEST" && "is-active")}
            title={
              canTest
                ? "Comando TEST homologado para esta controladora"
                : "Comando ainda não homologado"
            }
            onClick={() => canTest && onCommand("test")}
          >
            {busy === "test" ? "..." : "TEST"}
          </button>
        </div>
      </section>
    );
  }

  const modeButton = (label: "OFF" | "MAN" | "AUT" | "TEST", action?: IndustrialCommandAction) => {
    const available = Boolean(action && canOperate && modeEnabled(gen, action));
    const active = activeMode === label;
    return (
      <button
        key={label}
        type="button"
        disabled={!available || busy !== null}
        aria-pressed={active}
        aria-label={label}
        className={cn(active && "is-active")}
        title={
          available
            ? `Comando ${label} homologado para esta controladora`
            : "Comando ainda não homologado para esta controladora"
        }
        onClick={() => action && available && onCommand(action)}
      >
        {busy === action ? "..." : label}
      </button>
    );
  };

  return (
    <section className="vref-section vref-control" aria-label="Controle de modo">
      <div className="vref-mode-row">
        {modeButton("OFF", "off")}
        {modeButton("MAN", "manual")}
        {modeButton("AUT", "auto")}
        {modeButton("TEST", "test")}
      </div>
    </section>
  );
}
