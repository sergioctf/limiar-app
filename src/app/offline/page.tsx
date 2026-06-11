/**
 * Static offline fallback — precached by the service worker and served
 * when a navigation fails without a cached copy of the target page.
 */
export const dynamic = "force-static";

export default function OfflinePage() {
  return (
    <main className="min-h-screen flex flex-col items-center justify-center bg-surface-900 text-center px-6">
      <div className="w-16 h-16 rounded-2xl bg-surface-800 border border-surface-700 flex items-center justify-center mb-5">
        <svg className="w-8 h-8 text-surface-500" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="2" y1="2" x2="22" y2="22" />
          <path d="M8.5 16.5a5 5 0 0 1 7 0" />
          <path d="M2 8.82a15 15 0 0 1 4.17-2.65" />
          <path d="M10.66 5c4.01-.36 8.14.9 11.34 3.76" />
          <path d="M16.85 11.25a10 10 0 0 1 2.22 1.68" />
          <path d="M5 13a10 10 0 0 1 5.24-2.76" />
          <line x1="12" y1="20" x2="12.01" y2="20" />
        </svg>
      </div>
      <h1 className="text-xl font-bold text-surface-100 mb-2">Você está offline</h1>
      <p className="text-sm text-surface-400 max-w-xs leading-relaxed mb-6">
        Sem conexão com a internet. Seus dados continuam seguros — reconecte para ver os treinos mais recentes.
      </p>
      {/* Plain anchor: a client Link would need JS that may not be cached */}
      <a
        href="/"
        className="inline-flex items-center gap-2 bg-brand-500 hover:bg-brand-400 text-white font-semibold text-sm px-5 py-2.5 rounded-xl transition-colors"
      >
        Tentar novamente
      </a>
    </main>
  );
}
