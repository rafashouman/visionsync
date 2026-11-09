# VisionSync

Frontend Next.js/TypeScript e plugin Chrome MV3 para operar o CRM no WhatsApp Web. Persistência MongoDB. O protótipo original está preservado no histórico Git; esta é a primeira entrega de evolução, não o MVP completo descrito no roadmap.

## Componentes

- `server/`: aplicação Next.js, login, painel do dia, contatos, etiquetas/kanban, cobranças, notas, lembretes, respostas rápidas e configuração de integrações.
- `extension/src/`: código TypeScript do background, popup e regras de comunicação.
- `extension/content.js`, `page-bridge.js`, `panel.css`: integração legada com o WhatsApp, preservada para evitar reescrita sem benefício; o build a inclui no plugin.
- `extension/dist/`: plugin compilado para carregar no Chrome (gerado, fora do Git).
- `docs/`: arquitetura, roadmap, estado desta entrega e histórico PostgreSQL.

## Stack e decisão de persistência

Next.js 16.4.5+, React, TypeScript e MongoDB. JavaScript permanece no adaptador legado do WhatsApp; código novo do plugin usa TypeScript. CSS existente, sem Tailwind/Zustand adicionais.

O Prisma já existia no projeto e foi mantido **como compatibilidade para preservar os módulos e consultas tipadas**. Usa o conector MongoDB documentado na versão 6.19; Prisma 7 não oferece esse conector. PostgreSQL/pg e seu adaptador saíram da execução. A proposta anterior de driver direto não foi concluída nesta entrega: remover a camada Prisma exige substituir e testar todos esses acessos. A linha 6 tem manutenção limitada; acompanhar o suporte antes de produção e priorizar a troca por driver direto, sem atualizar cegamente para Prisma 7. Fontes: [conector MongoDB](https://www.prisma.io/docs/orm/v6/overview/databases/mongodb), [status de releases](https://www.prisma.io/docs/orm/release-status).

## Instalação

Requer Node.js 22.14+ e MongoDB configurado como **replica set** (Atlas ou instalação própria). Uma instância MongoDB standalone não atende às transações usadas por compras e cobranças.

Na raiz do repositório:

```powershell
npm install
Copy-Item server/.env.example server/.env
```

Preencha `DATABASE_URL` com seu banco e `AUTH_URL`/`NEXTAUTH_URL` com a URL do sistema. Gere um segredo aleatório e use o mesmo valor em `AUTH_SECRET` e `NEXTAUTH_SECRET`. Não publique `.env`. Os valores do exemplo não são credenciais prontas.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run db:generate
npm run db:push
npm run db:indexes
npm run dev
```

Abra `http://localhost:3001`, cadastre sua conta e gere o token em Configurações. A senha exige no mínimo dez caracteres. O comando `dev` também gera o plugin e o download disponível no painel.

`db:push` instala o schema/índices declarados; `db:indexes` instala índices únicos parciais necessários a campos opcionais. Execute nessa ordem em banco novo. **Não execute contra banco de produção sem backup e revisão:** Prisma db push não é um migrador de dados PostgreSQL→MongoDB e não administra todos os índices parciais do projeto. Nenhum banco real foi migrado nesta entrega.

Para build e execução:

```powershell
npm run build
npm run start --workspace @visionsync/web
```

Se o gerenciador bloquear scripts de instalação, `db:generate` gera o cliente Prisma explicitamente. O build do plugin utiliza os binários distribuídos pelo esbuild. Não aprove scripts de pacotes desconhecidos indiscriminadamente.

## Plugin Chrome

```powershell
npm run extension:build
```

1. Abra `chrome://extensions` e ative Modo do desenvolvedor.
2. Clique em **Carregar sem compactação** e selecione `extension/dist`.
3. No CRM, abra **Configurações**, gere e copie um token. Ele aparece apenas nessa geração.
4. No popup do plugin, informe a URL principal do CRM e o token; salve e teste. Se solicitado, permita acesso somente à origem do CRM.
5. Recarregue o WhatsApp Web e abra uma conversa individual.

Alternativa: no frontend, **Plugin WhatsApp → Baixar plugin para Chrome** entrega `visionsync-extension.zip`; extraia e carregue a pasta extraída. O pacote é gerado antes do build Next.js.

Para incluir seu domínio no pacote de produção:

```powershell
$env:CRM_ORIGIN = 'https://crm.seudominio.com'
npm run extension:build
```

O plugin não recebe acesso automático a todos os domínios Vercel. Usa permissão opcional por origem escolhida. Tokens ficam no armazenamento restrito da extensão; content script recebe somente estado de conexão. Não há código remoto nem envio automático de mensagens. A interface do WhatsApp e módulos internos podem mudar: homologação em WhatsApp real continua necessária. Não é uma integração oficial do WhatsApp.

## Segurança e integridade nesta entrega

- Telefones comparados integralmente com código do país e índice único por conta; removida a união por últimos oito dígitos na busca/importação.
- Tokens de extensão armazenados como SHA-256 no servidor, vencendo em 90 dias; geração substitui o anterior e revogação está disponível.
- Compras aceitam `Idempotency-Key`, conferem contato/conta, rejeitam mudanças de conteúdo com a mesma chave e repetem transações em conflitos transitórios. Novas compras preservam valor em centavos e BRL; `amount` é mantido por compatibilidade das telas existentes. Limite atual: R$ 21.474.836,47 por compra.
- Meta preservada como integração legada, **desativada por padrão** (`META_SEND_ENABLED=false`). Somente habilitar após configurar finalidade/base legal, validar payload e homologar dataset/conta. A fila durável e consentimento do roadmap ainda não foram implementados; o opt-in de ambiente não substitui esses requisitos.
- Atualização de segurança do Next.js e correções pontuais de dependências indiretas no arquivo de versões. Segredos nunca devem ir para Git/logs.

O token novo não autentica tokens legados em texto: gere outro e atualize o plugin após migrar. Contatos duplicados/telefones inválidos na base antiga exigem saneamento antes da carga; nenhuma mesclagem automática foi feita.

## Testes e demonstração

```powershell
npm run typecheck
npm test
npm run build
```

Os testes iniciam um MongoDB temporário em replica set e verificam unicidade, isolamento, relações, agregações, rollback, idempotência de compra, concorrência e credenciais. O primeiro teste pode baixar o binário oficial do MongoDB. Nenhum teste deve usar seu banco real.

Para uma demonstração **temporária, somente local e com dados fictícios**, após o build:

```powershell
npm exec --workspace @visionsync/web -- tsx scripts/preview.ts
```

Acesse `http://localhost:3001` com `demo@visionsync.local` e senha `VisionSync-demo-2026`. A base é apagada ao encerrar o processo; essa conta não é criada na instalação normal. Não exponha essa demonstração à Internet. As integrações externas ficam desativadas.

## Próximas entregas

Deals e etapas exclusivas, histórico, referência LP→WhatsApp com consentimento, outbox CAPI, integração ERP e BI continuam no roadmap. O kanban atual segue baseado em etiquetas: arrastar um contato não fecha venda. Nesta entrega não houve deploy, publicação na Chrome Web Store, migração de dados reais nem homologação Meta/ERP/WhatsApp real.

Veja [estado da implementação](docs/03-estado-da-implementacao.md), [arquitetura](docs/01-arquitetura-e-diretrizes.md) e [MVP/roadmap](docs/02-produto-mvp-roadmap.md).
