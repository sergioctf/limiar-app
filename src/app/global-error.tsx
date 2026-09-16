"use client";

import "./globals.css";
import { ErrorScreen } from "@/components/shared/ErrorScreen";

/**
 * Last resort: the root layout itself failed, so nothing above this exists —
 * not the theme boot script, not `<body>`, not the stylesheet. This file has to
 * bring its own document, which is why it imports the CSS that layout.tsx
 * normally owns.
 *
 * The theme is pinned to dark rather than read from storage. The script that
 * resolves the athlete's choice lives in the layout that just crashed, and a
 * screen explaining a failure is a bad place to risk a second one.
 */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-surface-900">
        <ErrorScreen
          error={error}
          reset={reset}
          title="O app não conseguiu carregar"
          message="Alguma coisa falhou antes mesmo da tela montar. Recarregue — se persistir, feche e abra o app de novo."
        />
      </body>
    </html>
  );
}
