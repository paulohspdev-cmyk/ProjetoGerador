type Props = {
  cx: number;
  cy: number;
  radius: number;
  angle: number;
  showPointer: boolean;
  pointerClassName: string;
  hubClassName: string;
  groupClassName?: string;
  tipInset?: number;
  baseOffset?: number;
  halfWidth?: number;
  hubRadius?: number;
};

export function GaugeNeedle({
  cx,
  cy,
  radius,
  angle,
  showPointer,
  pointerClassName,
  hubClassName,
  groupClassName,
  tipInset,
  baseOffset,
  halfWidth,
  hubRadius,
}: Props) {
  const resolvedTipInset = tipInset ?? 1;
  const resolvedBaseOffset = baseOffset ?? Math.max(7, radius * 0.12);
  const resolvedHalfWidth = halfWidth ?? Math.max(1.5, radius * 0.028);
  const resolvedHubRadius = hubRadius ?? Math.max(3, radius * 0.06);

  return (
    <>
      {showPointer ? (
        <g className={groupClassName} transform={`rotate(${angle} ${cx} ${cy})`}>
          <path
            className={pointerClassName}
            d={`M${cx} ${cy - radius + resolvedTipInset} L${cx + resolvedHalfWidth} ${cy - resolvedBaseOffset} L${cx - resolvedHalfWidth} ${cy - resolvedBaseOffset} Z`}
          />
        </g>
      ) : null}
      <circle cx={cx} cy={cy} r={resolvedHubRadius} className={hubClassName} />
    </>
  );
}
