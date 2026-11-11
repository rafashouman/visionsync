# VisionSync

Frontend Next.js/TypeScript e plugin Chrome MV3 para operar o CRM no WhatsApp Web. Persistência MongoDB. O protótipo original está preservado no histórico Git; esta é a primeira entrega de evolução, não o MVP completo descrito no roadmap.


## Documentação da primeira etapa

- [Documento de desenvolvimento](docs/04-documento-de-desenvolvimento.md): stack atual, módulos, regras, ambiente local e sistema de temas.
- [Roadmap consolidado](docs/05-roadmap.md): primeira etapa, próximos blocos, prioridades e critérios de liberação.
- [Estado da implementação](docs/03-estado-da-implementacao.md): verificações executadas e limitações.

### Aparência

Em **Configurações → Aparência**, escolha Escuro original (padrão), Escuro minimalista, Claro ou Claro minimalista. A mudança é imediata e fica salva neste navegador por um ano. O seletor também está disponível nas telas de login/cadastro. Preferência ausente/inválida mantém o original; os temas não mudam dados ou permissões. Painel e autenticação usam os mesmos tokens; a extensão no WhatsApp continua com seu visual independente.

O HTML já recebe o tema escolhido pelo servidor, sem depender de um script que recolora a tela após abrir. Para isso, o layout lê um cookie de preferência e as páginas web são renderizadas por requisição. Não foram adicionadas bibliotecas de tema nem Tailwind.

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

Preencha `DATABASE_URL` com seu banco e `AUTH_URL`/`NEXTAUTH_URL` com a URL do sistema. Gere um segredo aleatório e use o mesmo valor em `AUTH_SECRET` e `NEXTAUTH_SECRET`. Configure as variáveis SMTP de `server/.env.example` para ativação de contas e recuperação de senha. O cadastro é público e exige confirmação do email. Não publique `.env`. Os valores do exemplo não são credenciais prontas.

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
npm run db:generate
npm run db:prepare --workspace @visionsync/web
npm run dev
```

`db:prepare` é uma ação explícita: inicia o replica set local quando necessário, aplica o schema e cria índices. Para um MongoDB já administrado, use `db:push` e depois `db:indexes`, após revisar o destino. `dev` apenas compila a extensão e inicia Next.js; não cria usuários, não aplica schema e não insere demonstração.

Abra `http://localhost:3001`, cadastre seu email e use o link recebido para definir uma senha de pelo menos oito caracteres. Gere o token em Configurações. O comando `dev` também gera o plugin e o download disponível no painel.

Para começar do zero, cadastre o primeiro contato no painel ou use **Plugin WhatsApp** para instalar e conectar a extensão. Cada conta tem seus próprios dados; compartilhamento entre membros de uma equipe ainda não está disponível.

`db:push` instala o schema/índices declarados; `db:indexes` instala índices únicos parciais necessários a campos opcionais. Execute nessa ordem em banco novo. **Não execute contra banco de produção sem backup e revisão:** Prisma db push não é um migrador de dados PostgreSQL→MongoDB e não administra todos os índices parciais do projeto. Nenhum banco real foi migrado nesta entrega.

Se você já tem um legado PostgreSQL (ex.: Supabase), use o script de migração local:

1. No `server/.env`, mantenha `DATABASE_URL` apontando para o MongoDB de homologação e adicione `MIGRATION_SOURCE_DATABASE_URL` com a conexão PostgreSQL.
2. Faça um ensaio sem gravação:
   ```powershell
   npm run db:migrate:legacy -- --dry-run
   ```
3. Para gravar no MongoDB:
   ```powershell
   npm run db:migrate:legacy -- --apply
   ```
4. Se precisar sobrescrever um destino já preenchido (homologação), defina `MIGRATION_REPLACE_TARGET=true` no `server/.env` antes do `--apply`.

O script migra somente dados de CRM (users, contacts, purchases, lists, notes, reminders, pixels, charges e quick replies) e não dispara reenvio histórico para Meta.

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

Na barra lateral esquerda do plugin, use **Filtros de conversas** para acessar os filtros sem manter uma faixa sobre os contatos. Em **Aparência**, escolha Vision escuro, claro ou minimalista; a mesma preferência está no popup da extensão e é independente do tema do site. Em janelas estreitas, o painel aberto fica sobre o WhatsApp e pode ser fechado para recuperar espaço.

Alternativa: no frontend, **Plugin WhatsApp → Baixar plugin para Chrome** entrega `visionsync-extension.zip`; extraia e carregue a pasta extraída. O pacote é gerado antes do build Next.js.

Para incluir seu domínio no pacote de produção:

```powershell
$env:CRM_ORIGIN = 'https://crm.seudominio.com'
npm run extension:build
```

O plugin não recebe acesso automático a todos os domínios Vercel. Usa permissão opcional por origem escolhida. Tokens ficam no armazenamento restrito da extensão; content script recebe somente estado de conexão. Não há código remoto nem envio automático de mensagens. A interface do WhatsApp e módulos internos podem mudar: homologação em WhatsApp real continua necessária. Não é uma integração oficial do WhatsApp.

Para a prévia de importação comparar telefones completos, atualize o servidor e recarregue o plugin compilado. Versões antigas do plugin ainda comparam apenas os oito últimos dígitos na prévia.

## Segurança e integridade nesta entrega

- Telefones comparados integralmente com código do país e índice único por conta; removida a união por últimos oito dígitos na busca/importação.
- Tokens de extensão armazenados como SHA-256 no servidor, vencendo em 90 dias; geração substitui o anterior e revogação está disponível.
- Compras aceitam `Idempotency-Key`, conferem contato/conta, rejeitam mudanças de conteúdo com a mesma chave e repetem transações em conflitos transitórios. No funil e na extensão, a mesma chave é reutilizada após uma resposta com erro enquanto a página permanece aberta; após recarregar a aba, confira se a compra já foi registrada antes de tentar novamente. Novas compras preservam valor em centavos e BRL; `amount` é mantido por compatibilidade das telas existentes. Limite atual: R$ 21.474.836,47 por compra.
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

Acesse `http://localhost:3001` com `aurora@visionsync.local`, `horizonte@visionsync.local` ou `estrela@visionsync.local`; a senha é `VisionSync-demo-2026`. São três contas fictícias separadas, ainda sem acesso compartilhado de equipe. A base é apagada ao encerrar o processo; essas contas não são criadas na instalação normal. Não exponha essa demonstração à Internet. As integrações externas ficam desativadas.

## Melhorias de arquitetura, UX e desempenho — 09/11/2026

- **Contatos:** busca paginada por cursor (20 por lote), desempate por ID, botão de continuidade e busca preservada na URL. O endpoint mantém o formato de array usado pela extensão; `paginate=1` retorna `{ items, nextCursor }`.
- **Funil:** busca/filtros executados no MongoDB antes da paginação; 100 cards por página de cada coluna, com contagens filtradas e indicadores globais. Não há mais corte nos primeiros 2.000 contatos. As agregações de compras/notas dos cards usam somente os contatos da página; os indicadores do topo usam a conta inteira.
- **Cobranças:** filtros aplicados no banco, páginas de 500, resumo global independente da página e somas de cobranças em centavos na agregação. Ordenação por vencimento e ID. Uma cobrança antiga não desaparece do filtro de vencidas por estar fora dos últimos 500 registros.
- **Ficha:** compras em lotes de 50 e estatísticas sobre todo o histórico; contato autorizado reutilizado. Linha do tempo identifica os limites de notas/cobranças/lembretes e das compras já carregadas.
- **App Router:** primeira página de contatos e funil carregada no servidor, estados de carregamento/erro por rota e ficha carregada sob demanda com fallback local.
- **Acessibilidade:** diálogo identificado, foco contido/restaurado, Escape, rótulos associados, abas por teclado, aviso de edição não salva, navegação identificada e atalho para o conteúdo. O kanban oferece seletor “Mover para” além do arraste.
- **Identidade visual:** mantidos tema, cores, tipografia, gradientes e CSS próprio. Ajustado o encaixe dos cinco indicadores; Tailwind não foi acrescentado.
- **Autenticação:** contador atômico compartilhado no MongoDB (`auth_attempts`), chaves com hash e expiração. Login: 20 tentativas/email a cada 15 minutos e 300 globais/minuto; cadastro: 5/email por hora e 30 globais/minuto. Login limitado usa a resposta genérica de credenciais; cadastro retorna 429 com `Retry-After`. Limites globais abrangem esta instalação inteira, sem depender de IP de proxy não confiável.

Após atualizar, faça backup e revise o destino antes de executar **`npm run db:generate`**, **`npm run db:push`** e **`npm run db:indexes`**, nessa ordem, para preparar campos aditivos e índices de paginação/TTL. `db:push` sincroniza o schema, não migra nem reconcilia o histórico financeiro. Esses comandos não criam contas. Não apliquei índices nem schema no banco real nesta revisão.

A persistência financeira legada em `Float` continua por compatibilidade. Novas cobranças rejeitam valores com mais de duas casas decimais e valores fora do limite de compra; a migração integral de Purchase/Charge para centavos e reconciliação do legado continuam pendentes. Também permanecem futuras as etapas exclusivas de Deal, outbox e integrações homologadas.

Validação desta revisão: TypeScript, ESLint, build de produção e testes em MongoDB temporário; regressões com 2.002 contatos, coluna acima de 100 cards, 502 cobranças, histórico acima de 50 compras, isolamento e limite atômico de autenticação. Verificação de navegador usa apenas contas fictícias. Consulte o estado de implementação para o alcance exato da verificação visual.

## Próximas entregas

Deals e etapas exclusivas, histórico, referência LP→WhatsApp com consentimento, outbox CAPI, integração ERP e BI continuam no roadmap. O kanban atual segue baseado em etiquetas: arrastar um contato não fecha venda. Nesta entrega não houve deploy, publicação na Chrome Web Store, migração de dados reais nem homologação Meta/ERP/WhatsApp real.

Veja [estado da implementação](docs/03-estado-da-implementacao.md), [arquitetura](docs/01-arquitetura-e-diretrizes.md) e [MVP/roadmap](docs/02-produto-mvp-roadmap.md).

### Compatibilidade financeira da revisão 1.3

Novas cobranças passam a gravar `amountMinor` (centavos inteiros) e `currency=BRL`. Na baixa, a compra usa esses mesmos centavos/moeda. A leitura e os resumos preferem centavos; registros legados sem esse campo continuam lidos por `amount`, preservado para compatibilidade. Nenhum histórico foi reescrito. Campos novos são aditivos; gerar o cliente faz parte do build. Backfill com reconciliação do legado e remoção futura de Float permanecem separados desta entrega, assim como estornos e demais estados financeiros do roadmap.

## Piloto de WhatsApp no servidor

Abra **Mensagens → Envios no servidor** para configurar até dois destinatários autorizados e vincular o WhatsApp por QR. Inicie o processo persistente com `npm run whatsapp:worker`, além do CRM. Regras de aniversário, retorno de orçamento e pós-venda começam desligadas, com fila pausada e revisão individual. Consulte o [guia do piloto](docs/06-piloto-whatsapp-servidor.md) antes do primeiro teste. Esta implementação não equivale a uma conta já vinculada ou a um deploy na VPS.
