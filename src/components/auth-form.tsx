"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowRight,
  BarChart3,
  Check,
  FlaskConical,
  Layers3,
  ShieldCheck,
} from "lucide-react";
import { authClient } from "@/lib/auth-client";
import { Button } from "@/components/ui/button";
export function AuthForm({ mode }: { mode: "login" | "signup" }) {
  const signup = mode === "signup";
  const router = useRouter();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = new FormData(event.currentTarget);
    const email = String(form.get("email"));
    const password = String(form.get("password"));
    try {
      const result = signup
        ? await authClient.signUp.email({
            email,
            password,
            name: String(form.get("name")),
          })
        : await authClient.signIn.email({ email, password });
      if (result.error) {
        const code = result.error.code;
        setError(
          code === "USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL" ||
            code === "USER_ALREADY_EXISTS"
            ? "Este e-mail já está cadastrado. Entre na sua conta."
            : code === "INVALID_EMAIL_OR_PASSWORD"
              ? "E-mail ou senha incorretos."
              : "Não foi possível continuar. Confira os dados e se o banco está iniciado.",
        );
      } else {
        router.replace("/dashboard");
      }
    } catch {
      setError(
        "Não foi possível conectar. Verifique se a aplicação e o banco estão iniciados.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-layout">
      <section className="auth-story">
        <Link href="/" className="brand">
          <span className="brand-mark">
            <FlaskConical size={24} />
          </span>
          <span>
            qa<span className="brand-light">metrics</span>
            <span className="brand-period">.</span>
          </span>
        </Link>
        <div className="auth-story-content">
          <span className="eyebrow light">MENOS PLANILHAS. MAIS CLAREZA.</span>
          <h1>
            Qualidade em cada teste.
            <br />
            <em>Clareza em cada entrega.</em>
          </h1>
          <p>
            Um espaço para organizar seus projetos, acompanhar execuções e
            transformar testes em decisões.
          </p>
          <div className="auth-feature">
            <Layers3 size={19} />
            <span>Todos os seus projetos, em um só lugar</span>
          </div>
          <div className="auth-feature">
            <BarChart3 size={19} />
            <span>Indicadores que contam a história completa</span>
          </div>
          <div className="auth-feature">
            <ShieldCheck size={19} />
            <span>Seus dados, no seu ambiente</span>
          </div>
          <div className="auth-mini-chart" aria-hidden="true">
            {[35, 52, 44, 65, 57, 78, 70, 89, 82, 96, 88, 100].map(
              (height, i) => (
                <span key={i} style={{ height: `${height}%` }} />
              ),
            )}
            <div>
              <Check size={16} /> Qualidade que evolui
            </div>
          </div>
        </div>
        <footer>FEITO PARA QUEM CUIDA DA QUALIDADE</footer>
      </section>
      <section className="auth-form-side">
        <div className="auth-top-note">Seu próximo ciclo começa aqui.</div>
        <div className="auth-form-wrap">
          <span className="eyebrow">SEU ESPAÇO DE QUALIDADE</span>
          <h2>{signup ? "Vamos começar?" : "Bom ter você de volta."}</h2>
          <p>
            {signup
              ? "Crie sua conta e organize seu primeiro projeto."
              : "Entre para acompanhar o que importa nos seus projetos."}
          </p>
          <form onSubmit={submit} className="form-stack">
            {signup && (
              <label>
                Nome
                <input
                  name="name"
                  autoComplete="name"
                  required
                  maxLength={100}
                  placeholder="Como podemos chamar você?"
                />
              </label>
            )}
            <label>
              E-mail
              <input
                name="email"
                type="email"
                autoComplete="email"
                required
                maxLength={254}
                placeholder="voce@exemplo.com"
              />
            </label>
            <label>
              Senha
              <input
                name="password"
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                minLength={signup ? 10 : 1}
                maxLength={128}
                required
                placeholder={signup ? "Pelo menos 10 caracteres" : "Sua senha"}
              />
            </label>
            {error && (
              <div className="alert alert-error" role="alert">
                {error}
              </div>
            )}
            <Button type="submit" disabled={busy}>
              {busy ? "Aguarde…" : signup ? "Criar conta" : "Entrar"}
              <ArrowRight size={17} />
            </Button>
          </form>
          <p className="auth-switch">
            {signup ? "Já tem uma conta? " : "Primeira vez por aqui? "}
            <Link href={signup ? "/login" : "/cadastro"}>
              {signup ? "Entrar" : "Criar conta"}
            </Link>
          </p>
          <div className="auth-security">
            <ShieldCheck size={15} /> Ambiente local · Conexão com seu
            PostgreSQL
          </div>
        </div>
        <footer>
          QA Metrics <span>Um novo olhar sobre a qualidade.</span>
        </footer>
      </section>
    </main>
  );
}
