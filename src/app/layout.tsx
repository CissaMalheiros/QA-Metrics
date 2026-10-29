import type { Metadata } from "next";
import "./globals.css";
export const metadata: Metadata = {
  title: "QA Metrics · Qualidade em perspectiva",
  description:
    "Seus projetos, testes e indicadores de qualidade em um único lugar.",
};
export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
