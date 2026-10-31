# Deploy gratuito: Vercel Hobby + Neon Free

O deploy pode ser feito pela CLI, sem push para o GitHub. Use uma conta pessoal
Vercel **Hobby**, sem trial Pro, e um projeto Neon **Free**, sem upgrade ou cartão.
O artigo do TCC não faz parte deste procedimento.

## Publicação validada

URL: https://qa-metrics-six.vercel.app — produção na Vercel Hobby, banco Neon
Free exclusivo `qa_metrics_demo`, ambos na região US East (N. Virginia).
Validação em 30/10/2026: lint, typecheck, 92 testes unitários, 55 de integração,
8 E2E e build aprovados. Na URL pública foram conferidos login/logout demo,
4 projetos, 80 casos, 12 planos, 32 execuções, 20 bugs, indicadores e downloads
de evidências. Tentativas de escrita e alteração de credenciais demo retornaram
403; cookie de sessão HTTPS/HttpOnly confirmado. Cadastro e gravações em uma
conta própria também passaram, incluindo upload e download de evidência e
isolamento da demonstração. As contas temporárias dessa verificação foram removidas.
Nenhum serviço pago foi contratado e nenhum push foi realizado.

## Banco e variáveis

1. Autentique nas CLIs pelos respectivos fluxos no navegador: `vercel login` e
   `neon auth`. Não envie tokens pelo chat.
2. No Neon Free, crie um projeto exclusivo da demonstração e um banco chamado
   `qa_metrics_demo` (o sufixo `_demo` é obrigatório para o seed).
3. Escolha uma região disponível e configure a função Vercel na região mais
   próxima. Preserve o scale to zero padrão do Neon; não configure pings ou cron
   para manter o banco acordado.
4. No projeto Vercel (framework Next.js, Node **24.x**, pnpm **10.32.1**), configure
   somente no ambiente **Production**:

| Variável | Valor |
| --- | --- |
| `DATABASE_URL` | URL Neon pooled, host com `-pooler`, banco `qa_metrics_demo`, TLS obrigatório (`sslmode=require`) |
| `DATABASE_URL_UNPOOLED` | URL direta do mesmo banco, host sem `-pooler`, TLS obrigatório |
| `BETTER_AUTH_URL` | Origem HTTPS pública e estável, sem barra final, por exemplo `https://nome-do-projeto.vercel.app` |
| `BETTER_AUTH_SECRET` | Segredo aleatório exclusivo com pelo menos 32 caracteres, gerado localmente e inserido no painel ou por stdin da CLI |
| `DEMO_MODE` | `true` |

Nunca use prefixo `NEXT_PUBLIC_` para segredos. Não reutilize as credenciais ou o
banco local. Não atribua estas variáveis a Preview/Development. Previews precisam
de banco separado. A integração do Marketplace não é obrigatória.

## Preparação e publicação

Configure as mesmas variáveis em um ambiente de terminal privado para o comando
de preparação. Alternativamente use um arquivo `.env.production.local` ignorado
pelo Git e execute os comandos abaixo com `node --env-file=.env.production.local`.
Não copie valores para arquivos versionados nem imprima as URLs do banco.

```powershell
node --env-file=.env.production.local node_modules/prisma/build/index.js migrate deploy
node --env-file=.env.production.local node_modules/tsx/dist/cli.mjs prisma/seed.ts
```

Com as variáveis já exportadas, o equivalente é `pnpm db:setup:demo`.
Execute uma vez antes do primeiro deploy; nas atualizações, somente `pnpm db:migrate`
se houver novas migrações. Não use `migrate dev`, `db push` ou reset em produção.
O seed é idempotente e preserva os projetos existentes em uma repetição acidental.
Ele não roda em requisições, no build ou no `pnpm start`. O bootstrap de `pnpm dev`
prepara automaticamente apenas bancos locais.

Após o login, confira a conta e o plano, crie/vincule o projeto e confirme o destino:

```powershell
vercel whoami
vercel link
vercel project inspect --non-interactive
pnpm lint
pnpm typecheck
pnpm test
pnpm test:integration
pnpm build
vercel deploy --prod
```

Não é necessário push. `.vercelignore` exclui segredos, ferramentas, artigo,
relatórios e arquivos temporários. O build remoto usa `pnpm build`, gera o Prisma
Client e não modifica o banco. Desabilite Vercel Authentication para a URL de
produção se estiver ativa: o avaliador deve chegar ao login do QA Metrics sem
precisar de uma conta Vercel.

## Validação e acesso

Abra a URL pública em uma janela sem sessão Vercel. Em **Explorar demonstração**,
use **Entrar como demonstração**, ou `demo@qametrics.local` / `Demo@12345`.
Confira os quatro projetos, casos, planos, execuções, indicadores e download de
evidências fictícias. Confirme que tentativas de alteração retornam 403 e que sair
da conta funciona. O servidor também protege credenciais e perfil da conta demo.
Prévias CSV/BDD e exportações continuam disponíveis.

Para testar gravações, o avaliador pode criar uma conta própria com dados
fictícios; o workspace começa vazio e não acessa a demonstração compartilhada.
O cadastro aberto continua sujeito aos limites de uso e armazenamento gratuitos.
Uploads acima do limite de corpo de requisição da Vercel podem ser recusados pela
plataforma antes da validação de 5 MiB da aplicação; use evidências pequenas.

## Poucos acessos por 30–90 dias

O computador local pode ficar desligado. O Neon suspende o compute inativo e o
reativa na próxima conexão, preservando os dados. A primeira visita pode demorar
mais. Não há rotina de seed, cron ou serviço de keepalive para manter.
Planos gratuitos têm cotas e não garantem disponibilidade permanente: mantenha
os e-mails das contas ativos e confira a URL antes da avaliação. Não habilite
upgrade automático nem recursos pagos para contornar limites.

Referências: [Vercel Hobby](https://vercel.com/docs/plans/hobby),
[Prisma com Neon](https://neon.com/docs/guides/prisma),
[scale to zero](https://neon.com/docs/introduction/scale-to-zero).
