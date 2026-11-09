import { useId } from "react";

export type RibbonState = "idle" | "active" | "listening" | "thinking" | "success";

/** Two folded faces and a moving specular edge. Shared by the plan and the Debrief. */
export function ChromeRibbon({ state = "idle", className = "" }: {
  state?: RibbonState;
  className?: string;
}) {
  const id = useId();
  return (
    <svg viewBox="0 0 400 154" fill="none" aria-hidden="true" focusable="false"
      data-state={state} className={`chrome-ribbon ${className}`}>
      <defs>
        <linearGradient id={`${id}-face`} x1="42" y1="138" x2="334" y2="19" gradientUnits="userSpaceOnUse">
          <stop stopColor="#1a102a"/><stop offset=".17" stopColor="#8a58e2"/>
          <stop offset=".31" stopColor="#f0e5ff"/><stop offset=".41" stopColor="#605874"/>
          <stop offset=".52" stopColor="#1d172a"/><stop offset=".67" stopColor="#78829d"/>
          <stop offset=".8" stopColor="#eef1fa"/><stop offset=".91" stopColor="#a392cf"/><stop offset="1" stopColor="#292137"/>
        </linearGradient>
        <linearGradient id={`${id}-back`} x1="77" y1="31" x2="317" y2="119" gradientUnits="userSpaceOnUse">
          <stop stopColor="#2b1a41"/><stop offset=".22" stopColor="#62409d"/>
          <stop offset=".46" stopColor="#ddd4f7"/><stop offset=".55" stopColor="#57516d"/>
          <stop offset=".75" stopColor="#1a112b"/><stop offset="1" stopColor="#aa79fa"/>
        </linearGradient>
      </defs>
      <g className="chrome-ribbon-body">
        <path d="M10 123C86 148 120 24 213 26C292 29 314 100 392 25C345 124 297 94 227 58C139 13 88 173 10 123Z"
          fill={`url(#${id}-back)`} stroke="#a389d9" strokeOpacity=".55" />
        <path d="M12 122C104 123 116 64 173 64C232 64 236 122 288 101C327 85 354 35 394 21C365 47 344 108 293 124C234 143 224 81 176 80C120 78 74 147 12 122Z"
          fill={`url(#${id}-face)`} stroke="#e7d9fa" strokeOpacity=".74" />
        <path d="M12 122C104 123 116 64 173 64C232 64 236 122 288 101C327 85 354 35 394 21"
          pathLength="100" className="chrome-ribbon-light" stroke="#fbf6ff" strokeWidth="1.5" strokeLinecap="round" />
      </g>
    </svg>
  );
}
