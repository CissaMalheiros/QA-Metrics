"use client";
import { Button } from "@/components/ui/button";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main className="error-page">
      <h1>Não foi possível abrir esta página.</h1>
      <p>Verifique se o banco de dados está iniciado e tente novamente.</p>
      <Button onClick={reset}>Tentar novamente</Button>
    </main>
  );
}
