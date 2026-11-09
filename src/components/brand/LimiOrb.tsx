import { useId } from "react";

export type OrbState = "idle" | "listening" | "thinking" | "speaking" | "success";

const PLATES = [
  { path: "M30 77C35 47 61 23 91 21C120 18 142 28 148 41C125 32 105 34 85 48C67 59 47 79 30 77Z", shift: "-8px, -13px" },
  { path: "M91 23C120 14 161 28 175 58C186 81 173 108 157 118C163 94 151 79 131 68C117 60 110 38 91 23Z", shift: "13px, -8px" },
  { path: "M175 73C191 98 177 143 155 158C139 170 117 175 96 170C117 161 130 146 135 128C139 113 156 102 175 73Z", shift: "13px, 10px" },
  { path: "M151 156C131 180 94 190 62 174C43 165 32 151 31 131C52 150 70 150 89 145C108 140 129 159 151 156Z", shift: "-5px, 15px" },
  { path: "M25 68C17 92 19 124 35 144C52 163 75 151 81 142C59 137 57 121 62 103C68 81 49 68 25 68Z", shift: "-14px, 4px" },
];

/** The same geometry is used in the launcher and in the conversation. */
export function LimiOrb({ state = "idle", className = "", still = false }: {
  state?: OrbState;
  className?: string;
  still?: boolean;
}) {
  const id = useId();
  return (
    <svg viewBox="0 0 200 200" fill="none" aria-hidden="true" focusable="false"
      data-state={state} data-still={still || undefined} className={`limi-orb ${className}`}>
      <defs>
        <radialGradient id={`${id}-core`} cx=".5" cy=".46" r=".54">
          <stop stopColor="#fff5ff"/><stop offset=".19" stopColor="#c198ff"/>
          <stop offset=".4" stopColor="#8438f3"/><stop offset=".67" stopColor="#32116a"/>
          <stop offset="1" stopColor="#10091b"/>
        </radialGradient>
        <linearGradient id={`${id}-shell`} x1=".12" y1=".05" x2=".85" y2=".95">
          <stop stopColor="#241b39"/><stop offset=".19" stopColor="#eef1fa"/>
          <stop offset=".39" stopColor="#b7bbd3"/><stop offset=".59" stopColor="#474058"/>
          <stop offset=".81" stopColor="#171221"/><stop offset="1" stopColor="#a673f3"/>
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="91" stroke="#ae7aff" strokeOpacity=".33" />
      <circle className="limi-orb-core" cx="100" cy="100" r="74" fill={`url(#${id}-core)`} />
      <ellipse cx="100" cy="100" rx="71" ry="45" transform="rotate(-32 100 100)" stroke="#d0b1ff" strokeOpacity=".55"/>
      <g className="limi-orb-shell">
        {PLATES.map((plate, index) => (
          <path key={plate.path} d={plate.path} className="limi-orb-plate"
            style={{ "--plate-shift": plate.shift, "--plate-delay": `${index * 36}ms` } as React.CSSProperties}
            fill={`url(#${id}-shell)`} stroke="#ded6f2" strokeWidth="1.25" strokeLinejoin="round" />
        ))}
      </g>
    </svg>
  );
}
