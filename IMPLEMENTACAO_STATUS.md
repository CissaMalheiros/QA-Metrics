# QA Metrics — continuidade da evolução

Atualizado em 29/10/2026. Solicitação: fases 8–18 sequenciais, commits locais autorizados; **nenhum push**.
Plano de referência: `C:/Users/cissa/Downloads/QA_Metrics_Plano_Evolucao_Atualizado.md`.
Instruções consultadas: `C:/Users/cissa/Downloads/AGENTS.md`. Os antigos planos do MVP foram removidos a pedido do usuário; não recriá-los.
Estado inicial: `3c9b3b4`, árvore limpa. Reutilizar Node 24 e pnpm em `.tools/node_modules/` (Node global é 22).

## Ordem e progresso

| Fase | Estado | Escopo/pendência |
| --- | --- | --- |
| 8 | Concluída e validada | Auditoria do MVP, retenção de histórico, AuditLog transacional, migração aditiva e teste com registros antigos |
| 9 | Concluída e validada | Organização, revisões, BDD/feature e CSV com frontend/backend/banco/testes |
| 10 | Em andamento — 10.1 | Planos reutilizáveis, versões, builds e ambientes |
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
- Commit local da fase 8: `70089a3` — feat: preservar histórico e auditar operações críticas. Nenhum push realizado.

### Fase 9 — entregas incrementais

- 9.1: suítes/subpastas, tipos, tags normalizadas, estados, códigos persistidos por projeto, busca por código/conteúdo/passos, filtros combinados, páginas de 50 casos, duplicação, movimentação/edição em lote e modelos funcional/API/exploratório.
- Definições versionadas automaticamente pelo PostgreSQL, incluindo seed e XML; autoria nos serviços autenticados. Códigos alocados sob lock do projeto, nunca reciclados (lacunas são permitidas). Migração atribui números uma única vez aos registros existentes e preserva snapshots anteriores.
- Casos arquivados não entram em novos ciclos; resultados anteriores continuam disponíveis.
- Migração `202610290003_case_library` aplicada sobre a base isolada já populada. Teste também migra um fixture do MVP e verifica código/revisão e resultado antigo intactos.
- 59 testes unitários e 24 de integração passaram; E2E de suíte, tags, revisão e jornada original passou (2 testes). O E2E encontrou uma corrida de navegação ao trocar projeto e aba rapidamente; corrigida no handler compartilhado e validada sem relaxar o teste de isolamento.
- Lint, TypeScript e build passaram. Commit local da entrega 9.1: feat: organizar biblioteca e preservar revisões de casos (hash no próximo registro).
- Commit local 9.1: `e96063b` — feat: organizar biblioteca e preservar revisões de casos.
- 9.2 implementada e validada: formato BDD, parser oficial `@cucumber/gherkin` 42.0.1 + `@cucumber/messages` 34.2.1 (dependência compatível >=34 <35), PT/EN, contexto/regras/outlines/exemplos/tabelas/docstrings, realce e prévia sem executar código.
- `.feature`: upload UTF-8 de até 100 KiB/200 cenários; prévia e conciliação explícita por chave ou código do projeto. Sem identidade, o usuário escolhe criar/conciliar e a exportação recebe `@qa:UUID`; fonte original e fonte com IDs ficam versionadas. Não usar título/linha como identidade.
- Fontes importadas podem conter vários cenários; editar um caso atualiza somente o cenário selecionado, mantendo o arquivo da revisão. Cada caso retém sua fonte completa (limite conhecido de armazenamento; deduplicar documentos apenas se medição justificar).
- Tags `@requirement:CHAVE` e `@automation:CHAVE` guardam referências externas opcionais. Não representam cobertura, execução ou associação já validada pelo runner. A matriz de requisitos e vínculos reais continua na fase 13, ingestão/automação na fase 14.
- Exportação, revisão e leitura de fonte BDD durante execução manual implementadas. Duplicação cria chave distinta; PATCH tradicional não pode deixar fonte e passos BDD inconsistentes.
- Classificação omitida em reimportações é preservada, incluindo estado arquivado, prioridade e tags adicionais.
- Teste direcionado BDD no navegador passou, incluindo arquivo, erro de sintaxe, prévia, persistência, exportação, execução manual e edição sem trocar código. Lint/types/71 unitários passaram. Integração completa (28 testes), E2E completo (3 testes) e build passaram. Capturas desktop/móvel inspecionadas; aguardou-se o fechamento do sidebar antes da captura móvel para não registrar uma transição.
- Migração `202610290004_gherkin` aplicada somente na base isolada; antigo formato STEPS e snapshots preservados. Dependências fixadas em versões exatas.
- Commit local 9.2: `6f27413` — feat: validar e gerenciar especificações BDD em Gherkin.
- 9.3 implementada e validada: CSV UTF-8 (vírgula/ponto e vírgula, aspas e multilinha), mapeamento, prévia paginada com linha física/erros/avisos, CREATE/UPSERT por código/ID, geração atômica de suítes, exportação dos filtros e BDD em CSV.
- Limites: 256 KiB/1.000 linhas na entrada, 200 suítes novas; exportação de até 1.000 casos/5 MiB. `qaMetricsEncoding=apostrophe-v1` preserva round-trip dos escapes de fórmula, apóstrofos e Gherkin iniciado por tags.
- IDs externos CSV têm namespace csv:, códigos internos nunca são sobrescritos e títulos não conciliam registros. CSV não gera TestRun/TestResult. Definição automatizada sem passos é criada como rascunho quando nova.
- Foram validados rollback do lote inválido, revisões/snapshots, hierarquia, referências externas, isolamento, BDD em CSV e reimportação sem trocar código/fonte original.
- Casos revisados também são preservados mesmo sem ciclos: exclusão exige ausência de resultados e revisão inicial. Corrigida a seleção de ciclos para não considerar casos arquivados e ajustados textos no singular.
- Verificação completa desta entrega: lint/types/build, 81 unitários, 36 de integração e 4 E2E passaram. Depois foi ampliado o E2E CSV para simular falha de leitura após gravação: UI agora informa que a gravação ocorreu e permite recarregar sem repetir a escrita. Revalidação direcionada desse ajuste passou, assim como lint, typecheck e build após o ajuste.
- Primeira revalidação do ajuste falhou apenas por seletor de alert ambíguo com o anunciador do Next.js; seletor passou a usar o main do produto. A repetição passou com seletor escopado ao main; não houve nova gravação no retry de leitura.

## Próxima ação

Fase 9 concluída. Commit local 9.3: `91788e9` — feat: importar e exportar casos CSV com prévia segura. Fase 10.1 em implementação: CRUD com arquivamento de ambientes e versões, isolado por projeto, migração 006. Depois: planos/casos ordenados e revisões, builds/contexto por execução, responsáveis/datas/critérios, estados válidos e métricas/bugs contextualizados. Não marcar fase 10 concluída por apenas entregar cadastros. Documentação oficial consultada: https://cucumber.io/docs/gherkin/reference/, https://cucumber.io/docs/gherkin/languages/ e fontes/types oficiais dos pacotes instalados. O formulário Field existente foi compartilhado para garantir rótulos explícitos também em selects e textarea (falha de localização encontrada no E2E).

## Ajuste de execução após feedback do usuário

Uma entrega pequena por vez; análise apenas do trecho atual; saídas curtas; testes direcionados durante a entrega e suíte completa no fechamento da fase; não antecipar fases. Commits locais continuam autorizados e push proibido.

- 10.1 validada: ambientes e versões com criação/edição/arquivamento, autorização por projeto e auditoria transacional. Migração 006 preserva dados anteriores. Quatro testes direcionados de integração/migração, E2E CSV com cadastros, TypeScript e lint passaram. Próxima entrega: planos reutilizáveis com casos ordenados e revisões preservadas.
