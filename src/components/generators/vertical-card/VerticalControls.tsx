import { Hand, Play, Square, TriangleAlert, VolumeX } from "lucide-react";

import type { Generator } from "@/data/generators";
import { cn } from "@/lib/utils";

function modeShort(mode: Generator["mode"]) {
  if (mode === "MANUAL") return "MAN";
  if (mode === "AUTO") return "AUT";
  if (mode === "TESTE") return "TEST";
  return "OFF";
}

export function headerMode(mode: Generator["mode"], known: boolean) {
  return known ? modeShort(mode) : "N/D";
}

export function VerticalControls({
  gen,
  dse,
  modeKnown,
  mainsPresent,
  canStart,
  canStop,
  busy,
  onStart,
  onStop,
}: {
  gen: Generator;
  dse: boolean;
  modeKnown: boolean;
  mainsPresent: boolean;
  canStart: boolean;
  canStop: boolean;
  busy: "start" | "stop" | null;
  onStart: () => void;
  onStop: () => void;
}) {
  return (
    <section className="vref-section vref-control">
      <h4>{dse ? "CONTROL (DSE STYLE)" : "CONTROL"}</h4>

      {dse ? (
        <div className="vref-dse-modes">
          <button
            type="button"
            disabled
            aria-label="DSE manual mode"
            className={cn("vref-dse-hand", modeKnown && gen.mode === "MANUAL" && "is-active")}
          >
            <Hand />
          </button>
          <button
            type="button"
            disabled
            className={cn("vref-dse-auto", modeKnown && gen.mode === "AUTO" && "is-active")}
          >
            <span className="vref-auto-badge">A</span>
            <b>AUTO</b>
            <i />
          </button>
          <div className="vref-dse-mode-text">
            <span>DSE MODE</span>
            <b>{modeKnown ? gen.mode : "N/D"}</b>
            <small>{mainsPresent ? "READY TO TRANSFER" : "MAINS FAILURE"}</small>
          </div>
        </div>
      ) : (
        <div className="vref-comap-modes">
          {[
            ["OFF", gen.mode === "OFF" || gen.mode === "STOP"],
            ["MAN", gen.mode === "MANUAL"],
            ["AUT", gen.mode === "AUTO"],
            ["TEST", gen.mode === "TESTE"],
          ].map(([label, active]) => (
            <button
              key={String(label)}
              type="button"
              disabled
              aria-pressed={modeKnown && Boolean(active)}
              className={cn(modeKnown && active && "is-active")}
            >
              {String(label)}
            </button>
          ))}
        </div>
      )}

      <div className="vref-command-grid">
        <button
          type="button"
          className="start"
          disabled={!canStart || busy !== null}
          onClick={onStart}
        >
          <Play /> {busy === "start" ? "..." : "START"}
        </button>
        <button
          type="button"
          className="stop"
          disabled={!canStop || busy !== null}
          onClick={onStop}
        >
          <Square /> {busy === "stop" ? "..." : "STOP"}
        </button>
        <button
          type="button"
          className="horn"
          disabled
          title="Reset de buzzer ainda não homologado"
        >
          <VolumeX /> HORN RESET
        </button>
        <button
          type="button"
          className="fault"
          disabled
          title="Reset de falha ainda não homologado"
        >
          <TriangleAlert /> FAULT RESET
        </button>
      </div>
    </section>
  );
}
