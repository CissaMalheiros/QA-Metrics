# QA Metrics — continuidade da evolução

Atualizado em 29/10/2026. Solicitação: fases 8–18 sequenciais, commits locais autorizados; **nenhum push**.
Plano de referência: `C:/Users/cissa/Downloads/QA_Metrics_Plano_Evolucao_Atualizado.md`.
Instruções consultadas: `C:/Users/cissa/Downloads/AGENTS.md`. Os antigos planos do MVP foram removidos a pedido do usuário; não recriá-los.
Estado inicial: `3c9b3b4`, árvore limpa. Reutilizar Node 24 e pnpm em `.tools/node_modules/` (Node global é 22).

## Ordem e progresso

| Fase | Estado | Escopo/pendência |
| --- | --- | --- |
| 8 | Concluída e validada | Auditoria do MVP, retenção de histórico, AuditLog transacional, migração aditiva e teste com registros antigos |
| 9 | Não iniciada | Suítes, códigos estáveis, filtros, lote, templates, BDD/feature, CSV e revisões |
| 10 | Não iniciada | Planos reutilizáveis, versões, builds e ambientes |
| 11 | Não iniciada | Execução guiada, rascunhos, autoria, duração e fluxo contextual de defeito |
| 12 | Não iniciada | Defeitos, retestes e evidências privadas |
| 13 | Não iniciada | Requisitos e rastreabilidade |
| 14 | Não iniciada | Tokens por projeto, ingestão idempotente, Jenkins/GitHub Actions e vínculos BDD |
| 15 | Não iniciada | Meu dia, indicadores contextualizados e visão de release |
| 16 | Não iniciada | Convites, papéis, atribuições e comentários |
| 17 | Não iniciada | Operação, segurança, quotas, desempenho e backup/restore exercitado |
| 18 | Não iniciada | Jornadas reais completas, Jenkins real, restauração e release validada |

## Auditoria de partida (fases 0–7)

- 0: stack, Compose persistente, migração inicial, instalação e scripts existentes. Instalação em máquina limpa ainda não exercitada nesta evolução.
- 1: Better Auth, sessão no servidor, workspace pessoal, CRUD de projetos e seed existentes; testes de duas contas disponíveis.
- 2: casos, filtros, validação Zod e autorização existentes. Código visual depende da posição na lista (resolver na fase 9).
- 3: ciclos manuais, cinco resultados, notas, snapshots e encerramento imutável existentes; locks serializam alteração/encerramento.
- 4: bugs, vínculo ao resultado do mesmo projeto e filtros existentes. Retestes/eventos/evidências ainda ausentes, previstos na fase 12.
- 5: métricas `passed/(passed+failed)`, denominador, filtro de ciclo, global/projeto e estados vazios existentes.
- 6: parser JUnit seguro, limite de 5 MiB, XXE bloqueado, transação e fixtures existentes. Hash identifica upload manual; identidade externa de execução ainda precisa ser implementada na fase 14.
- 7: unidade/integração/E2E, tratamento de erro, responsividade e CI existentes. CI remoto, máquina limpa, carga e recuperação não validados nesta evolução.

## Decisões da fase 8

- Preservar IDs internos CUID/string e snapshots existentes. Não converter IDs ou regravar resultados antigos.
- Datas persistidas como instantes; apresentação em `America/Sao_Paulo`, interface pt-BR.
- Projeto com registros deve ser arquivado; exclusão apenas de projeto vazio. Caso com resultados continua protegido.
- AuditLog registra ator, workspace, projeto, ação, recurso, data e estado resultante, sem notas, senhas, XML ou tokens. Registro na mesma transação da mutação; erros não produzem eventos de sucesso.
- IDs do projeto/ator no log são referências históricas textuais para preservar eventos de recursos removidos. Retenção enquanto o workspace existir; nenhuma exclusão de workspace/conta é oferecida pelo produto.
- Consulta de auditoria autoriza projeto no servidor e limita a resposta a 100 eventos. Sem endpoint para editar/remover eventos.
- Migração `202610290002_audit` apenas adiciona tabela/índice. Teste executa migração inicial, insere histórico, aplica a nova migração e compara os registros em schema isolado com rollback.
- Evolução de entidades segue a fase correspondente; não antecipar tabelas das fases 9–18.
- Riscos de expansão: `workspace.tsx` concentra UI; listas globais carregam todo o histórico; papéis ainda não restringem mutações; ausência de rate limiting. Separar novos módulos e tratar paginação/permissões nas fases correspondentes sem enfraquecer o isolamento atual.

## Validação e commits

- Fase 8: lint, typecheck e build passaram; 58 testes unitários, 19 de integração e 2 E2E Chromium passaram.
- Integração inclui migração com dados antigos em schema transacional isolado, retenção, auditoria atômica, isolamento e paginação de eventos com timestamps iguais. E2E inclui recusa de exclusão de caso histórico.
- Docker Desktop indisponível: backend falha ao abrir socket dockerInference. Tentativa de reparo foi bloqueada pela revisão automática; não insistir nem alterar configurações do Docker.
- Validação usou PostgreSQL 17 isolado em 127.0.0.1:55433, banco qa_metrics_evolution_test. Credenciais em .local/evolution-test.env, ignorado. Carregar esse arquivo no ambiente dos testes, sem substituir .env/.env.test.
- Migração aplicada somente na base isolada; o banco original Docker permanece intacto e precisará de pnpm db:migrate quando voltar a funcionar.
- Commit local da fase 8: feat: preservar histórico e auditar operações críticas (hash no próximo registro). Nenhum push realizado.

## Próxima ação

Iniciar a fase 9: organização, códigos estáveis, revisões, Gherkin/feature e CSV, filtros e ações em lote. Usar parser oficial Gherkin; não executar arquivos enviados. Não avançar à fase 10 antes de validar todos os aceites da fase 9.
