import type { Metadata, Viewport } from "next";
import "./globals.css";
import "./aerospace.css";
import { ServiceWorkerRegistration } from "@/components/PushNotificationButton";
import { themeBootScript } from "@/lib/theme";
import { isDevPreview } from "@/lib/dev-preview";

export const metadata: Metadata = {
  title: "Limiar — Performance · Saúde · Evolução",
  description: "Treino, recuperação e evolução com o seu treinador pessoal de performance.",
  manifest: "/manifest.json",
  icons: {
    icon:  "/limiar_icone_app.png",
    apple: "/limiar_icone_app.png",
  },
  appleWebApp: {
    capable:        true,
    statusBarStyle: "black-translucent",
    title:          "Limiar",
  },
};

export const viewport: Viewport = {
  width:         "device-width",
  initialScale:  1,
  // Both values are rewritten before first paint by the boot script; these
  // are only what a client with JavaScript disabled sees.
  themeColor:    "#08070d",
  colorScheme:   "dark light",
  viewportFit:   "cover", // Safe area for notch
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    // suppressHydrationWarning: the boot script edits this class before React
    // sees it, which is the entire point — the alternative is a white flash.
    <html lang="pt-BR" className="dark" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeBootScript() }} />
      </head>
      <body className="min-h-screen bg-surface-900">
        {!isDevPreview() && <ServiceWorkerRegistration />}
        {children}
      </body>
    </html>
  );
}
