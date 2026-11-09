"use client";

/**
 * The screen's title bar, and the place its actions live.
 *
 * A previous pass moved "add a friend" into a collapsed drawer at the bottom of
 * the friends screen, on the theory that it was clutter. It was not clutter, it
 * was the primary action — and Instagram, which is the reference for this kind
 * of screen, keeps exactly that action pinned to the top bar where a thumb can
 * find it without reading anything.
 *
 * The rule this component exists to enforce: **actions are navigation, and
 * navigation is never hidden.** Progressive disclosure is for reference material
 * — things you consult — not for the buttons that make the screen do its job.
 * An accordion that has to be opened before you can find anything useful adds
 * friction instead of removing it.
 *
 * Actions sit right-aligned, at 44px minimum, in the order they are given.
 */

interface PageHeaderProps {
  title: string;
  /** One quiet line under the title. Optional — most screens do not need it. */
  subtitle?: string;
  icon?: React.ReactNode;
  /** Buttons and links. Two or three at most; beyond that it is a toolbar. */
  actions?: React.ReactNode;
}

export function PageHeader({ title, subtitle, icon, actions }: PageHeaderProps) {
  return (
    <header className="flex items-center justify-between gap-3">
      <div className="min-w-0">
        <h1 className="flex items-center gap-2 text-2xl sm:text-3xl font-semibold tracking-tight text-surface-100">
          {icon}
          {title}
        </h1>
        {subtitle && (
          <p className="text-xs text-surface-500 mt-0.5 truncate">{subtitle}</p>
        )}
      </div>
      {actions && (
        <div className="flex items-center gap-2 shrink-0">{actions}</div>
      )}
    </header>
  );
}

/**
 * A single icon action for the header.
 *
 * `badge` puts a count on it — the unread dot Instagram uses to make an unread
 * state legible without opening anything. Zero renders nothing, so a quiet
 * screen stays quiet.
 */
export function HeaderAction({
  onClick, href, label, badge, children, primary = false,
}: {
  onClick?: () => void;
  href?: string;
  label: string;
  badge?: number;
  children: React.ReactNode;
  primary?: boolean;
}) {
  const cls = [
    "relative inline-flex items-center justify-center min-w-[44px] min-h-[44px] rounded-xl",
    "transition-all duration-150 active:scale-90",
    primary
      ? "bg-brand-600 hover:bg-brand-700 text-white"
      : "bg-surface-800 hover:bg-surface-700 text-surface-300 border border-surface-700",
  ].join(" ");

  const inner = (
    <>
      {children}
      {badge != null && badge > 0 && (
        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center animate-scale-in">
          {badge > 9 ? "9+" : badge}
        </span>
      )}
    </>
  );

  if (href) return <a href={href} aria-label={label} className={cls}>{inner}</a>;
  return (
    <button onClick={onClick} aria-label={label} className={cls}>
      {inner}
    </button>
  );
}
