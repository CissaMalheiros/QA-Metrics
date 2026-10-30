# Estado de entrega — QA Metrics

Atualizado em 30/10/2026.

## Implementado

- Autenticação e workspace pessoal, projetos por cliente, autorização e isolamento por projeto.
- Biblioteca com suítes, revisões, tags, operações em lote, BDD/Gherkin e CSV com prévia.
- Planos e ciclos por ambiente/release/build; execução manual, rascunhos e histórico preservado.
- Bugs, evidências privadas, correção, retestes e reabertura sem sobrescrever resultados anteriores.
- Ingestão JUnit por token de projeto, revogação, deduplicação e exemplos Jenkins/GitHub Actions.
- Meu dia, dashboards, comparação de builds, indícios de instabilidade e resumo de release.
- Demonstração automática, idempotente e isolada; interface refinada para desktop e celular.

## Execução e dados

- `scripts/start.ps1` prepara o ambiente local; `-Production` compila e executa a versão de produção. Instruções completas no README.
- Demonstração habilitada somente com `DEMO_MODE=true` e banco exclusivo `_demo`. `dev/start` criam o banco, aplicam migrações e executam o seed automaticamente. Reinicializações preservam alterações.
- Credenciais públicas: `demo@qametrics.local` / `Demo@12345`. A conta não cria tokens nem altera suas credenciais; dados de outros workspaces permanecem inacessíveis.
- Carga inicial: 3 clientes, 4 projetos, 80 casos (20 BDD), 12 planos, 32 ciclos (12 automatizados), 20 bugs, 8 retestes e 20 evidências fictícias.
- Migrações 001–011 aplicadas ao banco local de demonstração e ao banco dedicado de testes. Não há migrações pendentes nesses ambientes.
- `.env`, bancos, `.local`, ferramentas e diagnósticos não são versionados. Nenhum dado de demonstração foi recriado durante o acabamento.

## Critérios técnicos preservados

Autenticação e autorização no servidor; validação de uploads sem executar código; evidências no PostgreSQL; escritas transacionais; chaves idempotentes e controle de versão; snapshots de casos e contexto para manter o histórico. Aprovação usa aprovados/(aprovados+reprovados); release usa a última ocorrência por caso/ambiente. Bloqueados, ignorados e pendentes são separados.

## Validação do acabamento

- Lint aprovado; TypeScript aprovado; 86 testes unitários e 55 de integração aprovados.
- Teste do seed atualizado: banco temporário `_demo`, autenticação Better Auth, carga completa, recusa de configuração insegura e preservação das alterações na reinicialização. Somente o banco criado pelo teste é removido.
- Login demo e navegação em Meu dia, casos, planos, ambientes, bugs, qualidade e integrações conferidos no navegador em desktop/mobile. Após o build final, `pnpm start` iniciou em produção e a mesma conferência passou, sem erros de página.
- Build de produção aprovado. Oito jornadas E2E verificadas: seis passaram na rodada completa; token/revogação e planejamento passaram na revalidação direcionada após corrigir a espera pelo estado confirmado e restaurar o rótulo de categoria.
- GitHub Actions: última execução consultada, nº 5 (`62c1c01`), falhou somente no teste antigo do seed (53 integrações passaram). A correção está local; nova execução remota depende de envio autorizado pelo usuário.

## Limitações da entrega

Sem módulo completo de requisitos, colaboração avançada, integração bidirecional com issues, IA ou execução remota de testes. Exemplos CI foram fornecidos e o endpoint HTTP é testado; execução em Jenkins/GitHub externos depende da infraestrutura e credenciais de quem instalar. Recuperação de desastre e carga de produção não foram validadas. Não há compromisso de implementar módulos adicionais nesta entrega.

## Commits relevantes deste acabamento

- `a4601ee` — teste do seed isolado e ordem de inicialização corrigida.
- `89ef3ea` — textos e orientação da conta demo revisados; rótulo de categoria restaurado e espera por revogação confirmada no E2E.
- README e este registro consolidados para a entrega acadêmica; instruções antigas e promessas de fases futuras removidas.

Não foi realizado push.
