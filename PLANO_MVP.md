# QA Metrics — Plano de desenvolvimento do MVP

## Objetivo do produto
Aplicação web local-first de gestão de QA para um usuário trabalhar simultaneamente em projetos de diversos clientes, mantendo dados isolados por espaço de trabalho/projeto. Suporta casos de teste manuais e resultados automatizados importados em JUnit XML.

## Decisões fechadas
- **Entrega:** aplicação web executável localmente no navegador. Não criar Electron/Tauri/.exe no MVP.
- **Stack:** Node.js 24 LTS; Next.js App Router + TypeScript; Tailwind CSS + shadcn/ui; PostgreSQL via Docker Compose; Prisma ORM **7** + `@prisma/client` compatíveis; Better Auth para login email/senha; Zod para validação; Vitest para testes unitários; Playwright para E2E; Git/GitHub.
- **Pacotes:** pnpm. O agente deve checar documentação atual antes de executar comandos, especialmente migrações e configuração da autenticação.
- **Execução:** local em `http://localhost:3000`, sem serviços de nuvem obrigatórios.
- **Integração inicial:** upload **JUnit XML**, usado por Playwright e Cypress; importação por arquivo. Integrações API/CI e execução remota de testes são futuras.
- **Conta:** autenticação real; workspace pessoal, preparado para times futuramente. Cada operação no backend deve validar ownership/membership.
- **Interface:** responsiva em português do Brasil, datas/horário coerentes, estados vazios e erros claros; sem dados fictícios em indicadores reais.

## Funcionalidades do MVP (definição de pronto)
1. Cadastro/login/logout e proteção das páginas privadas.
2. Dashboard global: cartões e lista de projetos que o usuário pode acessar. Indicadores agregados com escopo do usuário.
3. CRUD de projetos: nome, cliente (texto simples), descrição, status, ambiente opcional; troca de projeto sem perda de contexto.
4. CRUD de casos de teste por projeto: título, descrição, pré-condições, passos, resultado esperado, prioridade e origem (manual/importado).
5. Ciclos de execução manuais por projeto com resultados `PASSED`, `FAILED`, `BLOCKED`, `SKIPPED`, `NOT_RUN` e histórico (nunca sobrescrever execução histórica).
6. CRUD de bugs/defeitos: título, descrição, severidade, status, passos de reprodução e vínculo opcional a resultado de teste do mesmo projeto.
7. Dashboard do projeto: contagem por situação, taxa de aprovação claramente definida, bugs por status/severidade, histórico de ciclos.
8. Importador JUnit XML por projeto, com pré-visualização opcional, relatório de erros, persistência de execução e resultados; testes automatizados aparecem com origem `JUNIT_IMPORT`.
9. Seed de demonstração opcional (2 clientes/3 projetos, resultados e bugs); comandos para instalar, migrar e testar reproduzíveis no README.
10. Testes unitários, integração de servidor e E2E em cenários críticos. `lint`, `typecheck`, `test`, `build` funcionando.

## Fora do escopo
- Execução de código externo, captura autônoma de testes Playwright/Cypress, agentes locais, API pública de ingestão, tokens de API, integração GitHub Actions/Jira, times com permissões avançadas, IA, uploads de vídeos/prints, exportação PDF e billing.
- Nunca executar scripts enviados por usuários no servidor. O importador lê somente resultados de testes em XML, não executa testes.

## Modelo de dados mínimo (adaptar junto com a implementação)
- `User`: login via Better Auth.
- `Workspace`: id, nome, createdAt. No MVP, um workspace pessoal por usuário.
- `WorkspaceMember`: workspaceId, userId, role (`OWNER`); estrutura reservada para colaboração futura.
- `Project`: id, workspaceId, name, clientName, description, status, createdAt, updatedAt.
- `TestCase`: id, projectId, externalKey? (único por projeto quando existir), title, description, preconditions, steps (JSON array), expectedResult, priority, origin (`MANUAL`/`JUNIT`), createdAt.
- `TestRun`: id, projectId, name, source (`MANUAL`/`JUNIT_IMPORT`), status, importedFileSha256?, startedAt, finishedAt, createdAt.
- `TestResult`: id, runId, testCaseId, status, durationMs?, errorMessage?, notes?, executedAt?.
- `Bug`: id, projectId, testResultId?, title, description, stepsToReproduce?, severity, status, createdAt.
- Índices úteis nos campos `workspaceId`, `projectId`, `testRunId`; chaves estrangeiras coerentes; não aceitar referências cruzadas entre projetos. Deduplicar reimportação pela combinação de projeto e hash do XML.

## Regras de qualidade e segurança
- Autorização obrigatória no servidor em toda leitura/escrita: usuário -> workspace -> projeto -> recurso.
- Nunca confiar em `projectId` ou `workspaceId` recebido do navegador sem verificar acesso.
- Validation com Zod e erro amigável; queries tipadas e transações quando adequado; não armazenar senhas customizadas.
- JUnit XML: limite de tamanho (5 MB), parser sem entidades externas, recusar XML inválido, sanitizar saídas e limitar mensagens de erro; aceitar `<testsuite>` ou `<testsuites>` e `failure`, `error`, `skipped`.
- Mapeamento automático JUnit: `PASSED` quando não há failure/error/skipped; `FAILED` para failure/error; `SKIPPED` para skipped. Preservar duração e mensagem quando presentes.
- Identificador estável do caso importado: composto determinístico por suite/classname/name, documentado; evitar colisões; duplicatas manejadas conscientemente.
- Taxa de aprovação: `passed / (passed + failed)` para execuções com resultado definido, com denominador exibido. Bloqueados, skipped e not_run devem aparecer separados e não contam nesse denominador. Não misturar todos os ciclos sem informar o período.
- Manter `.env` fora do Git, fornecer `.env.example` sem segredos; seed somente em ambiente de desenvolvimento. Docker com volume persistente.
- Sempre escrever testes da regra entregue; não mascarar erros com mocks para passar testes.

## Fases para Codex (executar UMA de cada vez)

### Fase 0 — Fundação
**Entregas:** Next.js, layout inicial, pnpm, Docker Compose PostgreSQL, Prisma 7, schema básico, README de setup, `.env.example`, scripts padronizados, lint/typecheck/build, teste mínimo, Git.
**Aceite:** `docker compose up -d db` inicia o banco; migrações executam; `pnpm dev` abre página local; `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm build` passam.

### Fase 1 — Autenticação, workspace e projetos
**Entregas:** Better Auth com email/senha, proteção de rotas, workspace pessoal, CRUD de projetos, switcher na barra lateral, seed ilustrativo.
**Aceite:** usuário A não visualiza nem altera projetos de B, mesmo alterando URL/ID; troca entre 3 projetos; dados persistem ao reiniciar.

### Fase 2 — Casos de teste
**Entregas:** lista com filtro, formulário, detalhe, edição, exclusão com confirmação, prioridades e etapas.
**Aceite:** casos de projeto A não aparecem em B; validações e cenários testados; interface com estados vazios.

### Fase 3 — Execução manual
**Entregas:** criar ciclo com seleção de casos, registrar estados/observações, histórico imutável de ciclos finalizados.
**Aceite:** executar casos, registrar resultado e visualizar histórico; impossibilidade de vincular casos de outro projeto; métricas básicas coerentes.

### Fase 4 — Defeitos
**Entregas:** CRUD, severidade/status, associação opcional a TestResult, filtros.
**Aceite:** bug vinculado a execução/caso do mesmo projeto; alterar status preserva consistência; acessos cruzados bloqueados.

### Fase 5 — Dashboards
**Entregas:** visão global, visão projeto, gráficos, filtros de ciclos, informações vazias.
**Aceite:** contagens testadas com fixtures; fórmulas documentadas; nenhuma mistura indevida de dados de clientes.

### Fase 6 — Importação JUnit XML
**Entregas:** uploader de arquivo XML, parser robusto, mapper, transação, deduplicação, criação de run + resultados, indicação de origem, fixtures de Playwright e Cypress.
**Aceite:** importar XML válido de dois frameworks e visualizar resultados no projeto correto; rejeitar arquivo inválido, maior que limite ou com XXE; reimportar mesmo arquivo no mesmo projeto sem duplicar; testes automatizados do importador passam.

### Fase 7 — Robustez e entrega local reproduzível
**Entregas:** testes E2E dos fluxos centrais, tratamento de erros, refino visual e acessibilidade básica, README completo, seed, scripts de backup local opcionais, CI de lint/test/build.
**Aceite:** máquina limpa consegue seguir README e executar o sistema; E2E contempla login, 2 projetos, caso, ciclo, bug e JUnit; todas as verificações passam.

## Padrão operacional após cada fase
1. Codex implementa somente a fase solicitada; se surgir requisito não planejado, reporta antes de aumentar escopo.
2. Codex roda `lint`, `typecheck`, `test`, `build` e migração/seed quando aplicável.
3. Codex informa alterações, comandos executados, testes que passaram/falharam, limitações e próximo passo.
4. Revisar o resultado navegando na aplicação e fazendo commit Git por fase (`feat: ...`).
5. Próxima fase só depois de aprovar o aceite e corrigir regressões.

## Comandos de uso esperados (após Fase 0)
```powershell
# Na pasta qa-metrics, dentro do terminal do VS Code
pnpm install
docker compose up -d db
pnpm exec prisma migrate dev
pnpm dev
```
Abrir `http://localhost:3000`. Scripts esperados no package.json: `dev`, `build`, `start`, `lint`, `typecheck`, `test`, `test:e2e`, `db:seed`.

## Definição global de concluído
- Projetos de clientes diferentes coexistem sem vazamento de dados.
- CRUDs de projeto, caso, ciclo e bug funcionam e persistem.
- Dashboard coerente por projeto e geral.
- Importação de JUnit XML funcional, sem executar testes arbitrários.
- Login seguro e controle de acesso do lado do servidor.
- Testes automatizados do próprio QA Metrics passando e instruções locais reproduzíveis.
