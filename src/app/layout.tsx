import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ServiceWorkerRegistration } from "@/components/PushNotificationButton";

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
  themeColor:    "#f97316",
  colorScheme:   "dark",
  viewportFit:   "cover", // Safe area for notch
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="pt-BR" className="dark">
      <body className="min-h-screen bg-surface-900">
        <ServiceWorkerRegistration />
        {children}
      </body>
    </html>
  );
}
