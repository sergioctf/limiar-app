/**
 * LimiarMark — brand icon used in sidebar, headers, etc.
 * The unboxed silver mark keeps the silhouette crisp at navigation size.
 */

interface Props {
  size?:      number;
  className?: string;
}

export function LimiarMark({ size = 36, className }: Props) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src="/brand/limiar-mark.svg"
      alt="Limiar"
      width={size}
      height={size}
      className={className}
      style={{ width: size, height: size, objectFit: "contain" }}
    />
  );
}
