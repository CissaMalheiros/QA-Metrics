# Validação local da entrega

Execução em Windows/PowerShell, com Node.js 24.22.2, pnpm 10.32.1 e PostgreSQL 17 em Docker. Data local: 29/10/2026.

| Verificação executada | Resultado |
| --- | --- |
| `pnpm install --frozen-lockfile` | Instalação concluída; Prisma Client gerado |
| `docker compose up -d db` | Banco iniciado e saudável na porta 5433 |
| `pnpm db:migrate` | Migração versionada aplicada nos bancos da aplicação e de testes |
| `pnpm lint` | Passou, sem erros ou avisos |
| `pnpm typecheck` | Passou |
| `pnpm test` | 58 testes unitários passaram |
| `pnpm test:integration` | 14 testes com PostgreSQL real passaram |
| `pnpm test:e2e` | 2 testes Chromium passaram |
| `pnpm build` | Compilação de produção passou |
| `scripts/start.ps1 -Production` | Migração, build e servidor de produção iniciados com sucesso |

Os testes de integração validaram acesso entre duas contas, referências entre projetos, edições parciais, snapshots, ciclos encerrados, concorrência e deduplicação. O seed foi executado duas vezes no banco de testes: três projetos para dois clientes, sem duplicações.

A jornada no navegador validou cadastro, logout/login, dois projetos, caso de teste, resultado manual, encerramento do ciclo com descarte de rascunho não salvo, bug vinculado, importações Playwright e Cypress, reimportação sem duplicar e isolamento de projetos. Também verificou o menu móvel e a ausência de overflow horizontal em 390 px. As capturas desktop e móvel foram inspecionadas.

Após reiniciar o PostgreSQL com `docker compose restart db`, as contagens de contas, projetos, casos, ciclos, resultados e bugs do banco de testes permaneceram iguais. A verificação HTTP da versão compilada confirmou login acessível, página privada redirecionando para login, API retornando 401 sem sessão e ícone acessível.

Os testes usaram `qa_metrics_test`. O banco `qa_metrics` ficou sem contas ou projetos de demonstração. Os servidores usados na verificação foram encerrados; o banco Docker permanece disponível. Para iniciar a aplicação, execute o comando documentado no README.

O workflow de CI foi configurado, mas sua execução no GitHub não foi realizada nesta entrega.
