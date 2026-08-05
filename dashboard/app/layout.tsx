import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "CX Cryptos — Painel do Bot",
  description: "Controle e relatórios do bot de notícias",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
