# QA Metrics

Aplicação web para organizar o trabalho de QA em projetos de diferentes clientes. Reúne casos de teste, planos, execuções manuais, resultados automatizados, bugs e indicadores em um histórico por projeto. O objetivo é reduzir a dispersão dessas informações em planilhas e relatórios separados.

Projeto desenvolvido no contexto de um Trabalho de Conclusão de Curso. A interface está em português do Brasil e pode ser executada localmente, sem serviços pagos.

## Funcionalidades

- Autenticação por e-mail e senha, workspace pessoal e isolamento dos dados por usuário e projeto.
- Biblioteca de casos com códigos permanentes, suítes e subpastas, tags, classificação, revisões, busca e edição em lote.
- Cenários BDD em português e inglês: edição, validação, importação e exportação de `.feature`. Importação CSV com mapeamento e prévia; exportação dos filtros.
- Planos reutilizáveis e ciclos com ambiente, release, build, responsável e critérios. Execução guiada ou em lista, rascunhos e histórico de resultados.
- Bugs ligados a resultados, evidências privadas, correção, reteste e reabertura, preservando o resultado original.
- Importação manual de JUnit XML e recebimento automático por API autenticada, com exemplos Jenkins e GitHub Actions.
- Meu dia, dashboards por projeto, comparação de builds, indícios de testes instáveis e resumo de qualidade da release.

## Tecnologias e requisitos

Next.js 16 (App Router), React, TypeScript, Tailwind CSS, PostgreSQL 17, Prisma 7, Better Auth, Zod, parser Gherkin do Cucumber, Vitest e Playwright.

Para executar no Windows:

- Node.js **24 LTS**, com npm, e Git.
- Docker Desktop com mecanismo Linux iniciado. É possível usar PostgreSQL existente, conforme a alternativa abaixo.
- Porta **3000** livre para a aplicação e **5433** para o banco local. Os E2E usam a porta **3100**.

O script de inicialização prepara Node 24 e pnpm 10 na pasta ignorada `.tools`. Para usar os comandos `pnpm` diretamente, instale pnpm 10 no seu ambiente (`npm install --global pnpm@10`).

## Iniciar a aplicação

Na pasta do repositório:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1
```

O script cria `.env` com credenciais locais aleatórias quando ele ainda não existe, instala as dependências se necessário, inicia o PostgreSQL do Compose, aplica as migrações e inicia a aplicação. Um `.env` existente é preservado.

Acesse [http://localhost:3000](http://localhost:3000). Use **Criar conta** para começar com um workspace vazio ou habilite a demonstração descrita abaixo. Mantenha o terminal aberto; `Ctrl+C` encerra o servidor. O banco preserva os dados entre inicializações.

Para compilar e executar a versão de produção local:

```powershell
powershell -ExecutionPolicy Bypass -File .\scripts\start.ps1 -Production
```

### Acessar a demonstração

A demonstração é opcional e exige um banco exclusivo terminado em `_demo`. Antes de iniciar, gere a configuração, caso ainda não exista:

```powershell
node scripts/init-env.mjs
```

Em `.env`, mantenha as credenciais geradas e ajuste:

```dotenv
DEMO_MODE=true
# Na DATABASE_URL existente, altere somente o nome final do banco de qa_metrics para qa_metrics_demo.
```

Inicie pelo mesmo `scripts/start.ps1`. O bootstrap cria o banco dedicado e aplica as migrações antes de popular a demonstração. Não é necessário executar `pnpm db:seed`. O usuário PostgreSQL precisa poder criar esse banco; o usuário inicial do Compose já tem essa permissão.

Na tela de login, expanda **Explorar demonstração** e clique em **Entrar como demonstração**, ou use:

| Campo | Valor público de demonstração |
| --- | --- |
| E-mail | `demo@qametrics.local` |
| Senha | `Demo@12345` |

A carga inicial contém 3 clientes fictícios, 4 projetos, 80 casos (20 BDD), 12 planos, ambientes e releases, 32 ciclos (12 automatizados), 20 bugs, 8 retestes e 20 evidências. Todos os dados são fictícios. Reiniciar preserva as alterações e não duplica os registros.

A conta demo usa a autenticação normal, fica restrita ao próprio workspace e não pode criar tokens de integração nem alterar suas credenciais. É compartilhada: não insira informações reais. Não habilite o seed em bancos de produção ou de usuários reais.

### Execução com ferramentas já instaladas

Com Node 24, pnpm 10 e PostgreSQL disponíveis:

```powershell
node scripts/init-env.mjs
pnpm install --frozen-lockfile
# Configure DATABASE_URL no .env com um banco exclusivo da aplicação.
pnpm db:migrate
pnpm dev
```

No modo demo, `pnpm dev` e `pnpm start` também preparam automaticamente banco, migrações e carga inicial; a migração manual anterior pode ser omitida. Para um PostgreSQL já instalado, não inicie o serviço Docker na mesma porta. O script opcional `scripts/local-postgres.ps1` inicia uma instância local isolada quando os binários PostgreSQL 17 estão instalados; consulte seus parâmetros com `Get-Help` ou no próprio arquivo.

## Roteiro para explorar

1. **Meu dia:** veja pendências entre projetos, bugs aguardando reteste, ciclos abertos e falhas automatizadas. Os atalhos abrem a atividade correspondente.
2. **Casos de teste:** abra um projeto, filtre a biblioteca e consulte revisões. Experimente a prévia BDD ou CSV antes de salvar. Exemplos `.feature` e XML estão em `examples/demo/`; relatórios de diferentes ferramentas estão em `tests/fixtures/`.
3. **Planos e ciclos:** reutilize um plano ou selecione casos, informe ambiente/release/build e inicie o ciclo. Registre resultados ou salve rascunhos antes de sair.
4. **Bugs e retestes:** parta de um resultado reprovado, crie o bug, anexe evidência e marque a correção disponível. Um reteste aprovado fecha o bug; um reprovado reabre. Os resultados antigos permanecem no histórico.
5. **Qualidade e release:** filtre o recorte, compare builds e confira os dados de automação. Selecione uma versão para consultar sua situação e exportar o resumo TXT.

## Critérios e limites

- Aprovação = `aprovados / (aprovados + reprovados) × 100`. Bloqueados, ignorados e não executados são mostrados separadamente. Sem aprovados ou reprovados, a taxa é indefinida.
- O histórico conta resultados por execução; o mesmo caso pode aparecer em vários ciclos. A visão de release usa a última ocorrência por caso e ambiente, com planejados como pendentes. Rascunhos e cancelados não entram nas taxas de execução.
- Casos, planos e execuções preservam revisões e contexto histórico. Alterar cadastros não reescreve execuções anteriores. Ciclos encerrados não permitem editar resultados.
- JUnit: até **5 MiB** por arquivo, XML malformado, DTDs e entidades externas recusados. O conteúdo nunca é executado. A importação manual deduplica conteúdo idêntico no mesmo projeto.
- BDD: UTF-8, até **100 KiB**; validação de sintaxe, sem executar step definitions. Identidades explícitas permitem conciliar reimportações; títulos não identificam casos.
- CSV: UTF-8, até **256 KiB/1.000 registros**, vírgula ou ponto e vírgula e campos multilinha. Erros impedem a gravação do lote inteiro. A exportação aceita até 1.000 casos/5 MiB e protege fórmulas de planilha; preserve `qaMetricsEncoding` para reimportar os escapes corretamente.
- Evidências: PNG/JPEG/PDF/TXT/LOG, até **5 MiB** por arquivo, **25 MiB e 100 arquivos por projeto**. Armazenadas no PostgreSQL e disponíveis por download autenticado.
- Testes instáveis: indício de pelo menos duas alternâncias em três resultados do mesmo caso, branch e ambiente, na amostra recente. Pode refletir correções; não é diagnóstico definitivo.

## Integração CI/CD

Uma conta própria pode gerar um token por projeto em **Integrações CI/CD**. O segredo é exibido uma vez, armazenado como hash e permite apenas enviar resultados àquele projeto. Há expiração (1–365 dias), revogação e limite de 60 relatórios/hora por token.

O Jenkins ou GitHub Actions executa os testes; o QA Metrics recebe o JUnit. Exemplos:

- [Jenkinsfile](examples/ci/Jenkinsfile): credencial Secret Text chamada `qa-metrics-ingest`; configure os parâmetros de URL, ambiente e release.
- [GitHub Actions](examples/ci/github-actions.yml): secret `QA_METRICS_TOKEN` e variáveis `QA_METRICS_URL`, `QA_RELEASE` e `QA_ENVIRONMENT`.

Os exemplos exigem agente Linux com Node 24, pnpm acessível via Corepack, curl e dependências do projeto testado. Adapte o comando Playwright/reporter ao seu projeto. O envio ocorre mesmo quando os testes falham, desde que o relatório tenha sido gerado. A aplicação não executa esses arquivos.

Endpoint: `POST /api/integrations/junit`, Bearer token, multipart com `file`, `provider` (`jenkins`, `github-actions` ou `other`) e `externalRunId`. Metadados opcionais: pipeline, build, branch, commit, buildUrl, environment, release, startedAt e finishedAt. O projeto é definido pelo token; `projectId` não é aceito. A mesma identidade e conteúdo retornam duplicação; conteúdo diferente para a mesma identidade retorna conflito 409. Builds diferentes podem enviar XML idêntico como execuções distintas. Limites: 5 MiB e 30 segundos por envio.

Para agentes externos, disponibilize a aplicação por HTTPS com certificado válido, endereço alcançável e `BETTER_AUTH_URL` correspondente. O processo deve escutar a interface acessível ao proxy (por exemplo `pnpm exec next start --hostname 0.0.0.0 --port 3000`). `localhost` na pipeline é o próprio agente. Não exponha a porta do PostgreSQL. A execução dos exemplos em um Jenkins ou repositório externo depende da infraestrutura e credenciais de quem instalar o projeto.

## Testes e validação

```powershell
pnpm lint
pnpm typecheck
pnpm test
pnpm build
```

`typecheck` regenera os tipos Prisma/Next.js; o build também gera o Prisma Client. Os testes unitários cobrem validação, métricas, importadores e timeout de uploads.

### Integração e E2E

Use um banco exclusivo terminado em `_test`. Com o Compose iniciado:

```powershell
docker compose exec db sh -c 'createdb -U "$POSTGRES_USER" qa_metrics_test'
```

Se ele já existe, não é necessário recriá-lo. Crie `.env.test` (ignorado pelo Git) com a URL e a mesma senha local:

```dotenv
TEST_DATABASE_URL=postgresql://USUARIO:SENHA@localhost:5433/qa_metrics_test
```

Migre o banco de testes sem substituir a configuração permanente da aplicação:

```powershell
$previousDatabaseUrl = $env:DATABASE_URL
try {
  $env:DATABASE_URL = 'postgresql://USUARIO:SENHA@localhost:5433/qa_metrics_test'
  pnpm db:migrate
} finally {
  if ($null -eq $previousDatabaseUrl) { Remove-Item Env:DATABASE_URL } else { $env:DATABASE_URL = $previousDatabaseUrl }
}
pnpm test:integration
pnpm exec playwright install chromium
# Interrompa o servidor de desenvolvimento da porta 3000 antes dos E2E.
pnpm test:e2e
```

Os testes de integração e E2E recusam bancos sem sufixo `_test`. O teste do seed cria, migra e remove somente seu próprio banco temporário `_demo`, verificando as proteções e a idempotência; o usuário de testes precisa de permissão `CREATEDB`.

Os E2E iniciam um servidor próprio na porta 3100 e cobrem autenticação, projetos, casos, BDD, CSV, planejamento, execução, evidências/retestes e CI/CD. Evite dois servidores de desenvolvimento no mesmo checkout: ambos usam `.next/dev`. Os diagnósticos ficam em `test-results/` e não são versionados.

O workflow [.github/workflows/checks.yml](.github/workflows/checks.yml) executa lint, tipos, unitários, integração, build e E2E com PostgreSQL temporário. Consulte o [GitHub Actions](https://github.com/CissaMalheiros/QA-Metrics/actions) para os resultados remotos; resultados locais e remotos são independentes.

## Estrutura e manutenção

| Diretório | Conteúdo |
| --- | --- |
| `src/app`, `src/components` | Rotas e interface |
| `src/domain`, `src/server` | Validação, autorização e serviços |
| `src/lib`, `src/importers` | Autenticação, banco e importadores |
| `prisma` | Schema, migrações e demonstração |
| `tests`, `examples` | Verificações e exemplos de uso |
| `scripts` | Preparação e inicialização local |

Aplique migrações versionadas com `pnpm db:migrate`. Não substitua o histórico por `prisma db push`. `.env`, bancos, ferramentas locais e diagnósticos são privados/gerados e ficam fora do Git.

O Compose mantém um volume persistente. `docker compose stop` preserva os dados. Antes de atualizar uma instalação real, faça backup com `pg_dump -Fc`, copie-o para armazenamento privado e verifique a restauração em outro banco. Não use remoção de volumes ou `migrate reset` como solução de inicialização. Evidências estão incluídas no backup do banco.

## Limitações

Não inclui execução remota de testes, módulo completo de requisitos/rastreabilidade, colaboração avançada, integração bidirecional com Jira/GitHub Issues, IA, vídeos como evidência ou cobrança. O recebimento JUnit por API está implementado e não depende desses módulos. Não há validação de recuperação de desastre nem de carga em escala de produção. O uso público requer configuração de infraestrutura, HTTPS e operação de backups.
