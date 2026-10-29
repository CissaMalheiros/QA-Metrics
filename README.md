# QA Metrics

Aplicação web local para gerenciar projetos de QA de diferentes clientes. Inclui autenticação por email e senha, workspace pessoal, projetos, casos de teste, ciclos manuais, bugs, dashboards e importação de resultados JUnit XML. A interface está em português do Brasil.

O projeto usa Next.js App Router, TypeScript, Tailwind, PostgreSQL, Prisma 7, Better Auth, Zod, Vitest e Playwright. Não requer serviços pagos ou publicação na nuvem.

## Requisitos

- Windows com PowerShell, Node.js **24 LTS**, pnpm **10** e Git.
- Docker Desktop com mecanismo Linux iniciado, ou uma instância PostgreSQL compatível já disponível.
- Porta 3000 para a aplicação; o Compose usa **5433** para evitar conflito com PostgreSQL local na porta 5432.

Se o pnpm não estiver instalado, execute `npm install --global pnpm@10` após instalar Node 24.

## Iniciar no Windows

Para usar as ferramentas locais preparadas neste projeto, sem alterar o Node ou o pnpm globais:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

O comando prepara Node 24 e pnpm na pasta `.tools` quando necessário, inicia o banco Docker, aplica migrações e abre o servidor em **http://localhost:3000**. Mantenha o terminal aberto; pressione `Ctrl+C` para interromper o servidor. O banco continua com os dados preservados. Para compilar e executar em modo de produção, acrescente `-Production`.

Se preferir usar Node 24 e pnpm já instalados no sistema, siga os comandos abaixo.

Na pasta deste repositório:

```powershell
node --version
pnpm --version
node scripts/init-env.mjs
pnpm install --frozen-lockfile
docker compose up -d db
pnpm db:migrate
pnpm dev
```

Abra **http://localhost:3000** e use **Criar conta**. A conta nova começa sem projetos; os indicadores são calculados sobre os registros persistidos da conta autenticada.

`scripts/init-env.mjs` cria `.env` com uma senha de banco e uma chave de sessão aleatórias, sem exibi-las. Se `.env` já existir, o script preserva o arquivo. Outra opção é copiar `.env.example` para `.env` e preencher os valores. `DATABASE_URL` deve usar a mesma senha e porta do Compose; ao usar caracteres especiais na senha, codifique-os como componente de URL.

Para usar PostgreSQL já instalado, configure `DATABASE_URL` com um banco exclusivo da aplicação e ignore `docker compose up -d db`. A aplicação não altera as credenciais de uma instalação existente.

Se `docker compose` disser que não encontrou o mecanismo Linux, inicie o Docker Desktop, aguarde o status de execução e tente novamente. Não remova o volume para solucionar um problema de inicialização: ele contém os dados persistidos.

Se Docker não estiver disponível e os binários PostgreSQL 17 estiverem instalados, há uma alternativa isolada no próprio projeto:

```powershell
node scripts/init-env.mjs
powershell -ExecutionPolicy Bypass -File scripts/local-postgres.ps1 -Action Start
pnpm db:migrate
pnpm dev
```

Esse script usa as credenciais e `POSTGRES_PORT` de `.env`, escuta somente em `127.0.0.1` e guarda os dados em `.local/postgres`, ignorado pelo Git. Ele não modifica o serviço PostgreSQL instalado. Use `-PostgresBin 'C:\caminho\PostgreSQL\bin'` se necessário. Para consultar ou interromper somente essa instância, use `-Action Status` ou `-Action Stop`. Docker e essa alternativa não podem ocupar a mesma porta simultaneamente.

## Dados opcionais de demonstração

O seed cria três projetos para dois clientes, casos manuais, ciclos abertos e encerrados e bugs. Os nomes identificam os registros como demonstração. Execute somente em desenvolvimento:

```powershell
$env:NODE_ENV = 'development'
$env:DEMO_EMAIL = 'seu-email@example.com'
$env:DEMO_PASSWORD = Read-Host 'Senha de demonstração (10 a 128 caracteres)'
pnpm db:seed
Remove-Item Env:DEMO_PASSWORD
Remove-Item Env:DEMO_EMAIL
Remove-Item Env:NODE_ENV
```

A conta é criada pelo Better Auth. Se o email já existir, a senha existente é preservada. Reexecutar o seed não duplica projetos de demonstração já existentes e não reinicia resultados modificados. Não execute o seed contra dados de produção.

## Fluxos principais

1. **Projetos e casos:** crie um projeto informando nome e cliente. Abra-o, selecione **Casos de teste** e cadastre título, pré-condições, passos e resultado esperado. Crie outro projeto e troque pela navegação para verificar os contextos separados.
2. **Ciclo e bug:** em **Ciclos**, crie um ciclo selecionando os casos do projeto. Registre resultados e observações. Cadastre um bug com severidade, status e, opcionalmente, resultado do mesmo projeto. Encerre o ciclo para preservar seu histórico.
3. **JUnit XML:** abra **Importar XML**, selecione um relatório e importe. Os arquivos representativos em `tests/fixtures/` permitem experimentar formatos Playwright e Cypress. Os resultados aparecem em um ciclo encerrado com origem `JUNIT_IMPORT`.

## Métricas e histórico

### Biblioteca de casos

Os casos têm códigos permanentes por projeto (`TC-001`, `TC-002` etc.). Filtros e ordenação não mudam esses códigos, e números de casos removidos não são reutilizados. A biblioteca combina busca por código ou conteúdo com filtros de suíte, prioridade, tipo, origem, estado e tag, em páginas de 50 casos.

Use **Gerenciar suítes** para criar e mover pastas/subpastas. A edição do caso permite classificá-lo, associá-lo a uma suíte e informar tags separadas por vírgula. Na criação, há modelos funcional, API e exploratório. A seleção de casos permite mover, classificar, arquivar ou substituir tags em lote, com validação atômica no servidor.

**Duplicar** cria outro código em estado de rascunho. **Revisões** mostra definições anteriores; a edição ou o arquivamento não altera snapshots de execuções. Casos arquivados não podem ser incluídos em novos ciclos. Suítes com conteúdo só podem ser excluídas após mover seus casos e subpastas.

### Cenários BDD / Gherkin

Em **BDD / .feature**, escreva ou envie uma especificação UTF-8 de até 100 KiB. O parser oficial do Cucumber valida português (`# language: pt`) e inglês, incluindo contexto, regras, esquemas, exemplos, tabelas e docstrings. A prévia exibe passos e exemplos; nenhum código ou step definition é executado.

Cada cenário deve ter identidade explícita (`@id:login-principal`, `@qa:UUID` ou `@TC-001`) para conciliação automática. Sem chave, escolha criar um novo caso ou informe o número de um caso do mesmo projeto. A ferramenta adiciona tags estáveis na fonte exportada e preserva a fonte recebida nas revisões. Título e posição no arquivo não são usados como identidade. Reimportar requer confirmar o destino; atualizar um caso mantém seus códigos e resultados anteriores.

O editor mostra a fonte com realce e permite conciliar alterações de identidade. Ao editar um caso, selecione qual cenário do arquivo atualiza aquele caso; os demais casos mantêm suas próprias revisões. **Exportar .feature** baixa a fonte daquela revisão com idioma, contexto, exemplos e tags. Durante um ciclo manual, consulte a fonte registrada no snapshot da execução.

Tags como `@requirement:REQ-LOGIN` e `@automation:login-principal` registram referências opcionais. Especificar um BDD ou informar uma referência de automação não significa que o teste foi automatizado, executado ou aprovado. A rastreabilidade completa de requisitos e a ingestão automatizada serão entregues nas fases correspondentes.

### Importação e exportação CSV

**Importar CSV** aceita UTF-8 com vírgula ou ponto e vírgula, aspas escapadas e campos multilinha, até 256 KiB/1.000 registros. Mapeie as colunas e gere a prévia: ela informa ações, avisos e erros pela linha física do arquivo. Um erro impede a gravação do lote inteiro, inclusive a criação de pastas. Suítes são caminhos como `Checkout/Pagamento`; até 200 novas suítes podem ser criadas por lote.

No modo **Criar novos**, códigos recebidos não sobrescrevem casos existentes. No modo **Atualizar por código/ID**, códigos pertencem ao projeto selecionado e identificações externas conciliam reimportações; títulos não são identidade. Informações não mapeadas são preservadas na atualização. Definições JUnit sem passos manuais são importadas como rascunhos quando novas e não geram resultados. Casos BDD podem transportar `format=BDD`, `gherkinSource` e `gherkinKey`; a fonte é validada novamente, mantendo contexto, idioma e revisões.

**Exportar CSV dos filtros** exporta até 1.000 casos/5 MiB do recorte atual, incluindo definições BDD. Conteúdos que poderiam virar fórmulas de planilha são escapados como texto. A coluna `qaMetricsEncoding` permite reimportar esse formato sem perder apóstrofos ou fontes iniciadas por tags; preserve essa coluna ao editar uma exportação. Para reimportar arquivos grandes, divida-os em lotes dentro do limite de 256 KiB.

A taxa de aprovação é `aprovados / (aprovados + reprovados) × 100`. O denominador é mostrado na interface. `BLOCKED`, `SKIPPED` e `NOT_RUN` aparecem separadamente e não entram no denominador. Quando não há aprovados ou reprovados, a taxa é indefinida, apresentada como ausência de resultados.

O dashboard informa o escopo dos ciclos exibidos e permite selecionar um ciclo. A visão global agrega somente projetos acessíveis à conta; a visão de projeto usa somente seus próprios ciclos e bugs. Os totais de múltiplos ciclos representam resultados de execuções, portanto o mesmo caso pode ser contado em ciclos diferentes.

Cada resultado guarda título e snapshot do caso no momento da criação do ciclo. Editar o caso depois não modifica esse snapshot. Ciclos encerrados não aceitam alterações nos resultados. Casos referenciados por resultados históricos não podem ser excluídos; somente projetos sem registros podem ser excluídos. Projetos com casos, ciclos ou bugs devem ser arquivados.

## Importação segura

- O importador lê XML; nunca executa os testes, scripts ou comandos descritos no arquivo.
- Limite de **5 MiB (5.242.880 bytes)**. DTDs, declarações de entidades externas e XML malformado são recusados.
- Aceita `testsuite` e `testsuites`, com `testcase`, `failure`, `error` e `skipped`.
- Sem falha, erro ou skip: `PASSED`. `failure` ou `error`: `FAILED`. `skipped`: `SKIPPED`. A duração em segundos é convertida para milissegundos e as mensagens são limitadas.
- A identidade de um caso importado deriva deterministicamente do caminho de suites, `classname` e `name`; o parser usa uma representação sem ambiguidades e hash para evitar colisões entre combinações distintas. Identidades repetidas dentro do mesmo arquivo são recusadas.
- O SHA-256 do conteúdo deduplica reimportações idênticas **no mesmo projeto**. O mesmo XML pode ser importado em outro projeto sem compartilhar dados.
- A gravação do ciclo e de seus resultados ocorre em transação. Mensagens importadas são exibidas como texto.

## Verificações

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`pnpm test` executa testes unitários de validação, cálculo de métricas e parser XML. `pnpm typecheck` regenera os tipos Prisma e Next.js antes de verificar TypeScript. O build também regenera o Prisma Client. Lint é uma etapa separada do build, como exigido pelo Next.js 16.

### Integração e navegador com banco exclusivo

Os testes de integração e E2E exigem `TEST_DATABASE_URL` e recusam bancos cujo nome não termine em `_test`. Crie um banco PostgreSQL dedicado — por exemplo `qa_metrics_test` — antes de executar. Usando o serviço do Compose:

```powershell
docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" qa_metrics_test'
```

Defina a URL com as credenciais do banco local em `.env.test` (arquivo ignorado pelo Git):

```dotenv
TEST_DATABASE_URL=postgresql://USUARIO:SENHA@localhost:5433/qa_metrics_test
```

Migre **esse banco**, preservando a variável normal da aplicação:

```powershell
$appDatabaseUrl = $env:DATABASE_URL
$env:DATABASE_URL = 'postgresql://USUARIO:SENHA@localhost:5433/qa_metrics_test'
pnpm db:migrate
if ($null -eq $appDatabaseUrl) { Remove-Item Env:DATABASE_URL } else { $env:DATABASE_URL = $appDatabaseUrl }
pnpm test:integration
pnpm exec playwright install chromium
pnpm test:e2e
```

Os testes de integração usam PostgreSQL real, com duas contas, referências cruzadas, snapshots, bloqueio de ciclos encerrados e deduplicação. A limpeza remove somente registros dos usuários criados pelo próprio teste. Os E2E iniciam um servidor próprio na porta **3100**, criam contas exclusivas no banco de testes e cobrem cadastro, logout/login, dois projetos, caso, execução, bug e upload XML. Diagnósticos de falha ficam em `test-results/`; não são versionados.

O workflow `.github/workflows/checks.yml` prepara PostgreSQL temporário e executa lint, tipos, testes unitários, integração, build e E2E. A existência do workflow não significa que ele já foi executado no GitHub: os resultados locais devem ser conferidos na entrega.

## Scripts e estrutura

| Comando | Finalidade |
| --- | --- |
| `pnpm dev` | Servidor de desenvolvimento em localhost:3000 |
| `pnpm build` / `pnpm start` | Compilar e executar a aplicação compilada |
| `pnpm db:generate` | Regenerar Prisma Client |
| `pnpm db:migrate` | Aplicar migrações versionadas já incluídas |
| `pnpm db:seed` | Seed opcional com credenciais fornecidas pelo ambiente |
| `pnpm test:integration` | Regras e autorização com PostgreSQL real |
| `pnpm test:e2e` | Jornada pelo navegador Chromium |

Código de interface em `src/app` e `src/components`; autenticação e banco em `src/lib`; autorização e serviços em `src/server`; regras e schemas em `src/domain`; parser em `src/importers`; schema e migrações em `prisma`; testes em `tests`.

Para alterar o schema durante desenvolvimento, use `pnpm exec prisma migrate dev --name nome_da_alteracao` e versione a migração resultante. Para aplicar alterações existentes, use `pnpm db:migrate`. Não use `prisma db push` para substituir o histórico.

## Persistência e escopo

### Migrações e recuperação

Antes de atualizar uma instância com dados, gere um backup em formato custom dentro do container e copie-o para armazenamento privado. No PowerShell, evite redirecionar saída binária com `>`:

```powershell
docker compose exec -T db sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB" -f /tmp/qa-metrics.dump'
New-Item -ItemType Directory -Force .local/backups
docker compose cp db:/tmp/qa-metrics.dump .local/backups/qa-metrics.dump
```

Guarde uma cópia fora do computador. Para verificar uma restauração, crie um banco novo terminado em `_test` (nunca sobrescreva o banco em uso):

```powershell
docker compose exec -T db sh -c 'createdb -U "$POSTGRES_USER" qa_metrics_restore_test'
docker compose cp .local/backups/qa-metrics.dump db:/tmp/qa-metrics-restore.dump
docker compose exec -T db sh -c 'pg_restore -U "$POSTGRES_USER" --no-owner --exit-on-error -d qa_metrics_restore_test /tmp/qa-metrics-restore.dump'
```

Verifique registros e uma jornada antes de usar o banco restaurado. Para rollback de atualização, pare a aplicação, use a versão anterior do código e um banco restaurado compatível; não remova tabelas nem execute `migrate reset` no banco real. Esses comandos são o procedimento; a validação completa de recuperação será registrada na fase 17.

Alterações críticas realizadas pelos serviços autenticados geram eventos transacionais. A consulta `GET /api/data/projects/:projectId/audit` exige acesso ao projeto e retorna até 100 eventos, sem conteúdo de senhas, XML ou observações. Use `?before=ID_DO_ULTIMO_EVENTO` para a página seguinte.

O PostgreSQL do Compose usa volume persistente. `docker compose stop` interrompe o banco preservando os dados. O arquivo `.env`, banco local, diretórios gerados e diagnósticos de testes não devem ser adicionados ao Git. Guarde o `.env` de forma privada; a chave de sessão é necessária para manter as sessões existentes.

Planos de teste podem reunir casos tradicionais e BDD, com ordem, categoria e revisão fixa. Os templates adicionam casos reais: Smoke usa `@smoke`, Regressão usa casos prontos e Homologação usa casos funcionais prontos. Atualizar um caso não muda silenciosamente os planos; use a ação de atualizar sua revisão no plano.

Cadastre ambientes e versões por projeto e informe build, responsável, datas previstas, observações e critérios ao criar uma execução. Cada execução mantém suas próprias revisões e uma cópia do contexto: renomear ou arquivar cadastros não reescreve o histórico. Rascunhos precisam ser iniciados antes de registrar resultados; ciclos concluídos ou cancelados ficam preservados. Rascunhos e cancelados não entram nos indicadores de execução. O ambiente textual do MVP e ciclos anteriores continuam preservados; não se infere contexto ausente nos dados antigos.

Este MVP não inclui execução remota de testes, ingestão por API pública, integrações Jira/GitHub, colaboração avançada, IA, anexos de vídeo ou cobrança. A importação manual de XML funciona sem essas integrações.

Documentação consultada para a configuração: [Prisma 7](https://www.prisma.io/docs/guides/upgrade-prisma-orm/v7), [Better Auth com Prisma](https://better-auth.com/docs/adapters/prisma), [Better Auth com Next.js](https://better-auth.com/docs/integrations/next) e [instalação do Next.js](https://nextjs.org/docs/app/getting-started/installation).
