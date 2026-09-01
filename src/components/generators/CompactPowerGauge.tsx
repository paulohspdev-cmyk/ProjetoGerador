import { cn } from "@/lib/utils";

import { fmt } from "./generator-metrics";
import "./compact-card.css";

function niceGaugeMaximum(nominal: number | null) {
  if (nominal == null || !Number.isFinite(nominal) || nominal <= 0) return 500;
  const roughStep = nominal / 5;
  const magnitude = 10 ** Math.floor(Math.log10(roughStep));
  const normalized = roughStep / magnitude;
  const niceStep = normalized <= 1 ? 1 : normalized <= 2 ? 2 : normalized <= 5 ? 5 : 10;
  return niceStep * magnitude * 5;
}

export function CompactPowerGauge({
  value,
  nominal,
}: {
  value: number | null;
  nominal: number | null;
}) {
  const known = value != null && Number.isFinite(value);
  const maximum = niceGaugeMaximum(nominal);
  const percent = known ? Math.min(1, Math.max(0, value) / maximum) : 0;
  const angle = Math.PI + percent * Math.PI;
  const cx = 70;
  const cy = 61;
  const radius = 47;
  const needle = 41;
  const tipX = cx + Math.cos(angle) * needle;
  const tipY = cy + Math.sin(angle) * needle;
  const path = `M${cx - radius} ${cy} A${radius} ${radius} 0 0 1 ${cx + radius} ${cy}`;

  return (
    <div className="compact-gauge-wrap">
      <svg
        viewBox="0 0 140 88"
        className="compact-gauge"
        role="img"
        aria-label={known ? `${fmt(value, 0)} kW` : "Potência N/D"}
      >
        <path d={path} pathLength="100" className="compact-gauge-track" />
        <path
          d={path}
          pathLength="100"
          className="compact-gauge-zone compact-gauge-good"
          strokeDasharray="72 28"
        />
        <path
          d={path}
          pathLength="100"
          className="compact-gauge-zone compact-gauge-warning"
          strokeDasharray="14 86"
          strokeDashoffset="-72"
        />
        <path
          d={path}
          pathLength="100"
          className="compact-gauge-zone compact-gauge-critical"
          strokeDasharray="14 86"
          strokeDashoffset="-86"
        />
        <line
          x1={cx}
          y1={cy}
          x2={tipX}
          y2={tipY}
          className={cn("compact-gauge-needle", !known && "is-unknown")}
        />
        <circle cx={cx} cy={cy} r="4.8" className="compact-gauge-hub" />
        <text x="17" y="73" className="compact-gauge-scale">
          0
        </text>
        <text x="123" y="73" textAnchor="end" className="compact-gauge-scale">
          {fmt(maximum, 0)}
        </text>
      </svg>
      <div className="compact-gauge-readout">
        <strong>{known ? fmt(value, 0) : "N/D"}</strong>
        <span>kW</span>
      </div>
    </div>
  );
}
