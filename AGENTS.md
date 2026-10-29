# Instruções persistentes para Codex — QA Metrics

Leia `PLANO_MVP.md` e `PROMPTS_CODEX.md` antes de qualquer mudança. Este repositório é o **QA Metrics**, plataforma web para QAs gerenciarem diversos projetos simultâneos, com casos de teste, ciclos manuais, bugs, dashboards e importação JUnit XML.

## Stack e limites
- Next.js App Router + TypeScript + Tailwind/shadcn; PostgreSQL Docker Compose; Prisma ORM 7 + Better Auth; pnpm; Vitest e Playwright.
- Aplicação web local; **não** construir Electron/Tauri nem integrar serviços pagos.
- No MVP, importação XML é somente leitura/parsing: **nunca execute código de testes fornecido pelo usuário**.
- Não introduza funcionalidades de IA, colaboração avançada, automações CI/CD externas ou integrações Jira/GitHub antes de a fase correspondente estar aprovada.

## Segurança e dados
- Em TODAS as operações de backend, obtenha usuário autenticado e valide acesso a workspace/projeto; nunca aceite IDs do cliente como prova de autorização.
- Garanta isolamento entre projetos de clientes diferentes e entre contas.
- Valide entradas com Zod e proteja upload JUnit XML (5 MB, sem entidades externas, sem executar código, mensagens limitadas).
- Preserve resultados históricos; use migrações versionadas, nunca `db push` para esconder alterações de schema.
- Não comite `.env`, secrets, senhas, banco local ou arquivos de mídia gerados.

## Implementação e verificações
- Entregue fases incrementais; siga aceites de `PLANO_MVP.md`.
- Prefira nomes de código em inglês e textos da interface em pt-BR.
- Use acessibilidade básica e estados de carregamento, erro e vazio.
- Separe domínio/serviços, acesso a dados, UI e importadores; evite rotas com lógica inteira embutida.
- Escreva testes unitários para cálculos e parsing, integração para dados/autorização e E2E para jornada essencial.
- Antes de concluir uma tarefa, rode os comandos aplicáveis: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` e informe qualquer falha real.
- Não invente resultados de testes. Se alguma ferramenta não puder ser executada, descreva a limitação e o comando que faltou.
- Faça commits apenas se solicitado; nunca altere segredos; examine diferenças relevantes.
- Se APIs de bibliotecas mudaram, consulte a documentação oficial compatível e explique a escolha; **Prisma 7** foi escolhido para manter a compatibilidade com Better Auth (adapter Prisma Client).

<!-- BEGIN:nextjs-agent-rules -->

## This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
