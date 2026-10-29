import Link from "next/link";
export default function NotFound() {
  return (
    <main className="error-page">
      <h1>Página não encontrada</h1>
      <p>O endereço pode ter mudado ou não está disponível para sua conta.</p>
      <Link href="/dashboard" className="button button-primary">
        Voltar ao início
      </Link>
    </main>
  );
}
