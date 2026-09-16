import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/PushNotificationButton";
import { themeBootScript } from "@/lib/theme";

export const metadata: Metadata = {
  title: "Limiar — Performance · Saúde · Evolução",
  description: "Dashboard pessoal de performance na corrida. Histórico, evolução, projeções e estratégias.",
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
  maximumScale:  1,
  userScalable:  false,
  // Both values are rewritten before first paint by the boot script; these
  // are only what a client with JavaScript disabled sees.
  themeColor:    "#0a0a0a",
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
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
