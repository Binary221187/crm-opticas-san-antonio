import type { Metadata } from "next";
import "./globals.css";
import { Welcome } from "./enhancements";

export const metadata: Metadata = {
  title: "Ópticas San Antonio | CRM",
  description: "Gestión de pacientes, agenda y ventas de Ópticas San Antonio.",
  manifest: "/manifest.webmanifest",
  applicationName: "Ópticas San Antonio",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Ópticas SA",
  },
  formatDetection: {
    telephone: false,
  },
  icons: {
    icon: "/favicon.svg",
    shortcut: "/favicon.svg",
    apple: "/favicon.svg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="es">
      <body className="antialiased"><Welcome/>{children}</body>
    </html>
  );
}
