/**
 * LimiarMark — brand icon used in sidebar, headers, etc.
 * Uses the official PNG from /public.
 */

interface Props {
  size?:      number;
  className?: string;
}

export function LimiarMark({ size = 36, className }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/limiar_icone_app.png"
      alt="Limiar"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "cover", borderRadius: Math.round(size * 0.22) }}
    />
  );
}
