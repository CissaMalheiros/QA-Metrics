# Prompts para usar no Codex no VS Code

## Instrução de uso
Abra a pasta do projeto no VS Code, instale a extensão **Codex** e entre com sua conta do ChatGPT. Coloque estes três documentos na raiz: `PLANO_MVP.md`, `AGENTS.md`, `PROMPTS_CODEX.md`. Execute um prompt por fase; não solicite tudo de uma vez. Após cada fase, examine a aplicação e o diff do Git.

## Prompt inicial — Fase 0

> Leia `AGENTS.md` e `PLANO_MVP.md` integralmente. Quero implementar **somente a Fase 0 (fundação)** do QA Metrics. Confirme a estrutura de pastas e crie a aplicação Next.js App Router com TypeScript, Tailwind, pnpm, PostgreSQL em Docker Compose, Prisma **7**, `.env.example`, README com comandos Windows/PowerShell e scripts lint/typecheck/test/build. Crie o schema inicial necessário, sem ainda implementar interfaces de CRUD nem integrações. Use versão estável e documentação oficial compatível; faça validações de lint, typecheck, test e build e corrija erros. Ao final apresente o que foi criado, comandos executados, resultados reais dos testes e o que precisa de minha aprovação. Não inicie Fase 1.

## Prompt — Fase 1

> Leia `AGENTS.md` e `PLANO_MVP.md`. Implemente somente a **Fase 1: autenticação + workspace pessoal + CRUD de múltiplos projetos**. Use Better Auth com Prisma 7 e PostgreSQL, sessão real e isolamento de acesso por workspace. Faça um layout agradável e responsivo em pt-BR, com sidebar e seletor rápido de projetos. Crie testes de autorização entre dois usuários e seed opcional. Execute lint, typecheck, testes e build; reporte resultados sem inventar. Não implemente casos de teste nem dashboards avançados.

## Prompt — Fase 2

> Leia `AGENTS.md` e `PLANO_MVP.md`. Implemente somente **Fase 2: cadastro, lista, edição, detalhe e exclusão de casos de teste por projeto** com prioridade, etapas, pré-condições, resultado esperado, filtros, Zod e controle de acesso no servidor. Escreva testes de isolamento de projetos e validações. Execute verificações. Não adicione outras funcionalidades.

## Prompt — Fase 3

> Leia `AGENTS.md` e `PLANO_MVP.md`. Implemente somente **Fase 3: ciclos e execuções manuais**. Permita selecionar casos e registrar resultados PASSED, FAILED, BLOCKED, SKIPPED e NOT_RUN, com observações e histórico. Garanta que os resultados pertencem ao projeto do ciclo e evite reescrever histórico de ciclos encerrados. Crie testes relevantes e execute verificações.

## Prompt — Fase 4

> Leia `AGENTS.md` e `PLANO_MVP.md`. Implemente somente **Fase 4: CRUD de bugs** com severidade, status, reprodução e vínculo opcional com resultado de teste do mesmo projeto. Bloqueie referências cruzadas entre projetos. Crie testes e valide o build.

## Prompt — Fase 5

> Leia `AGENTS.md` e `PLANO_MVP.md`. Implemente somente **Fase 5: dashboards** global e por projeto, incluindo contagens e taxa de aprovação `passed/(passed+failed)` com denominador explicitado; mostre BLOCKED/SKIPPED/NOT_RUN separadamente. Filtre por ciclo e por projeto e não misture dados de clientes. Faça testes unitários para os cálculos. Execute verificações.

## Prompt — Fase 6

> Leia `AGENTS.md` e `PLANO_MVP.md`. Implemente somente **Fase 6: importação JUnit XML** por projeto, utilizando parser seguro e limite de 5 MB, suportando testsuite/testsuites/testcase, failure, error e skipped. Não execute scripts externos. Faça mapeamento automático de casos e crie uma execução com resultados históricos, duração, origem JUNIT_IMPORT; deduplique importações iguais dentro do mesmo projeto por hash. Inclua fixtures reais representativas de Playwright e Cypress, testes para XML inválido e entidades externas, e execute lint/typecheck/test/build.

## Prompt — Fase 7

> Leia `AGENTS.md` e `PLANO_MVP.md`. Implemente somente **Fase 7: robustez e entrega local**. Crie E2E Playwright para login, cadastro de projetos, casos, execução manual, registro de bug e importação XML. Revise segurança, isolamento, estados de erro/vazio, acessibilidade básica, seed e README completo. Configure CI mínima para lint/test/build. Execute verificações e liste pendências sem afirmar que algo funciona sem testar.

## Prompt genérico — revisão após uma fase

> Revise o diff da fase atual em busca de bugs, regressões, falhas de autorização entre projetos, cálculos incorretos, tipos inseguros e ausência de testes. Corrija apenas problemas demonstráveis sem adicionar escopo. Execute todas as verificações possíveis e informe os resultados, limitações e arquivos alterados.

## Prompt — explicar resultado para quem está aprendendo

> Explique de forma prática o que implementamos nesta fase: quais telas, endpoints, tabelas e testes foram criados; como iniciar o sistema no Windows e como testar manualmente 3 fluxos essenciais. Aponte riscos e próximo passo do plano sem implementar mais código.
