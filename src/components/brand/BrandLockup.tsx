import { LimiarMark } from "@/components/LimiarMark";

export function BrandLockup({ className = "" }: { className?: string }) {
  return (
    <div className={`flex items-center gap-3 ${className}`}>
      <LimiarMark size={36} />
      <span aria-hidden className="limiar-wordmark !text-xl">LIMIAR</span>
    </div>
  );
}
