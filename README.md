# Vision CRM

CRM **separado** da agenda, que vive sobre o WhatsApp Web. Projeto próprio,
banco próprio, multiusuário. A integração com a agenda de tarot fica pra uma
fase final.

```
tarot-crm/
  extension/   extensão do Chrome (painel sobre o WhatsApp Web)
  server/      backend + login (Next.js 16, Prisma, Supabase, NextAuth)
```

## Rodar o backend (local)

1. Crie um projeto **novo** no Supabase (só pro CRM).
2. No SQL Editor do projeto novo, rode o conteúdo de
   `server/prisma/migrations/0_init/migration.sql`.
3. Copie `server/.env.example` para `server/.env` e preencha `DATABASE_URL`,
   `DIRECT_URL` e `NEXTAUTH_SECRET`.
4. Na pasta `server`:

```bash
npm run dev
```

Abre em `http://localhost:3001`. Cadastre sua conta, entre, e gere o token.

> A conexão direta do Supabase (porta 5432) não funciona em redes sem IPv6.
> Por isso as migrations são aplicadas pelo SQL Editor, não por
> `prisma migrate deploy`.

## Instalar a extensão

1. `chrome://extensions` → Modo do desenvolvedor → **Carregar sem compactação**
   → pasta `extension`.
2. Clique no ícone, cole a URL do sistema e o token, **Salvar e testar**.
3. Abra o web.whatsapp.com e clique no botão roxo ✦.

Em produção, adicione o domínio do CRM em `host_permissions` no
`extension/manifest.json`.

## Conversões pro Meta (Conversions API, vários pixels)

Cada compra vira um evento **Purchase** com valor, data e telefone criptografado (SHA-256). `action_source = chat` (WhatsApp Web; o formato business_messaging exige a API oficial).

- **Vários pixels:** cadastre quantos precisar em Configurações (cada um com nome, ID, token e código de teste opcional; token guardado criptografado, só os 4 últimos aparecem). Cada **lista** aponta pra um pixel ou usa o **pixel padrão**. A compra vai pro pixel da primeira lista da cliente (ordem do funil) que tiver pixel; sem nenhum e sem padrão, fica **Sem pixel** (nada é enviado e o motivo aparece).
- **Recompras por pixel:** todas como Purchase (padrão), como evento separado `Recompra`, ou não enviar. O evento leva `purchase_number`.
- Limite do Meta: eventos de até 7 dias; passou disso vira Expirado. `test_event_code` não isola a medição real.
- Testado só contra um Meta simulado (`META_GRAPH_BASE`); falta testar com o pixel real.

## Funil (kanban)

Página **Funil** do painel (`/dashboard/funil`). As colunas são as listas da
taróloga, mais "Sem lista". Arrastar um card troca de coluna.

- Card: nome, telefone, total gasto e nº de compras, próximo passo com prazo
  (atrasado / hoje / futuro) e "Parada há N dias" (3 dias ou mais).
- "Parada" conta dias desde a última movimentação (compra, mudar de lista,
  próximo passo). Abrir a conversa no WhatsApp **não** conta.
- Uma cliente pode estar em várias listas e aparece em cada coluna.
- Dá pra registrar compra e definir próximo passo direto no card, criar
  contato à mão, criar/renomear/excluir listas, buscar e filtrar.
- As rotas `/api/crm/funnel`, `/contacts` e `/lists` aceitam o token da
  extensão **ou** o login do painel (`getAuthUser`). Tudo checa o dono do dado.
- "Próximo passo" com data só (`2026-11-10`) é salvo ao meio-dia de Brasília,
  pra o dia não voltar por causa do fuso.
- Limite: lê até 2000 contatos e mostra até 100 cards por coluna.

## Cobranças

Página **Cobranças** (`/dashboard/cobrancas`): dinheiro a receber de uma cliente.

- Cria pelo botão **Cobrar** do card do funil ou por **+ Cobrança** na página:
  valor, vencimento, descrição e link de pagamento/Pix (opcionais).
- Abas Todas, A receber, Vencidas e Pagas, com o resumo no topo.
- **"Vencida" não é status do banco**: é cobrança pendente com vencimento antes
  de hoje (fuso de Brasília), calculada na leitura. Vence hoje = ainda a receber.
- **Cobrar no WhatsApp** abre a conversa com a mensagem pronta (`lib/charge-message.ts`).
  O sistema não envia nada sozinho.
- **Marcar paga** cria uma compra (`source: "cobranca"`) e dispara o evento
  Purchase pro Meta. Roda numa transação que "reserva" a cobrança
  (PENDING → PAID), então dois cliques ao mesmo tempo geram 1 compra e 1 evento.
- Só cobrança pendente muda: pagar ou cancelar de novo devolve 409.
- Não há integração de pagamento (Pix automático, Mercado Pago). Marcar como
  paga é manual.
- Telefones guardados com código do país (55) quando faltar: `lib/phone.ts`.
  O `wa.me` e o Meta exigem isso.

## Dados do lead e Notas

Clicar no **nome** de um card do funil abre a gaveta do contato, com três abas:

- **Dados:** nome, e-mail, origem (anúncio, orgânico, indicação, outro) e
  nascimento. O telefone é só leitura: ele identifica a cliente.
- **Notas:** várias, em ordem da mais nova pra mais antiga, até 2000
  caracteres, com opção de apagar. O texto é sempre exibido como texto (HTML
  digitado na nota não é executado).
- **Histórico:** compras, total gasto, recorrência e etiquetas.

Regras:

- Adicionar nota e mexer no próximo passo contam como atividade (zeram o
  "parada há N dias"). Corrigir e-mail, origem ou nascimento **não** conta.
- Nascimento e prazos são salvos ao meio-dia de Brasília (`lib/dates.ts`).
  Nascimento no futuro ou antes de 1900 é recusado.
- O funil ganhou o filtro **Origem** e mostra a origem e o nº de notas no card.
- O campo antigo `Contact.notes` (nunca usado) foi removido e trocado pelo
  modelo `Note`.

## Respostas rápidas

Página **Respostas rápidas** (`/dashboard/respostas`): mensagens prontas.

- **Tipos disponíveis: Texto, Contato, Áudio, Imagem, Vídeo e Documento.**
  Sequência de mensagens espera o formulário do Hotzapp (a API recusa, 400).
- **Arquivos ficam no banco** (tabela `QuickReplyFile`, separada de propósito
  pra a lista nunca ler o conteúdo). Foi a escolha da usuária. Consequências:
  - **4 MB por arquivo** (a Vercel recusa envios acima de ~4,5 MB) e
    **40 MB por conta** (o banco grátis tem 500 MB). Vídeo só cabe se for curto.
    Se precisar de mais, migrar pro Supabase Storage.
  - Envio em `POST /api/crm/quick-replies/upload` (multipart); trocar arquivo em
    `PUT .../[id]/file`; baixar em `GET .../[id]/file` (aceita login ou token da
    extensão, e pedidos de trecho `Range` pro player pular).
  - Formatos: Áudio `.ogg .mp3`, Imagem `.png .jpg .webp`, Vídeo `.mp4 .3gp`,
    Documento qualquer um **menos** programas e páginas (`.exe .bat .js .html
    .svg ...`, ver `BLOCKED_EXTS`).
  - **O conteúdo é conferido**, não só o nome: os primeiros bytes têm que
    bater com a extensão (`lib/quick-reply-files.ts`). Um HTML chamado
    `.png` é recusado.
  - O tipo (MIME) vem de uma tabela por extensão, nunca do navegador. O
    download sai com `nosniff` e `Content-Security-Policy: sandbox`, e
    documentos sempre baixam (`attachment`).
  - Imagem e vídeo têm "visualização única"; áudio tem "enviar como áudio
    gravado na hora"; imagem, vídeo e documento têm legenda (até 1024
    caracteres) com as mesmas variáveis do texto.
  - **"Gravar agora" (áudio) não existe**: o Chrome grava em webm, formato que o
    WhatsApp não aceita, e converter exigiria ffmpeg.
  - Apagar uma resposta apaga o arquivo (cascade). Duplicar copia o arquivo e
    conta no limite da conta.
- Cada resposta tem nome, categoria (sempre em MAIÚSCULAS), favorito, contador
  de uso e **atalho** (a palavra depois do `;`, única por conta, minúscula, sem
  acento nem espaço).
- **Variáveis** na mensagem: `{primeiro_nome}`, `{nome_completo}`, `{saudacao}`,
  `{seu_nome}`, `{telefone}`, `{data_de_hoje}`, `{hora_agora}`
  (`lib/quick-reply-vars.ts`). Saudação por horário de Brasília (5h-12h Bom dia,
  12h-18h Boa tarde, resto Boa noite). Se o nome da cliente é desconhecido, a
  variável some e a pontuação é arrumada ("Oi, Bom dia!").
- Ações ao passar o mouse: duplicar (cópia sem atalho, uso zerado), editar,
  excluir. O tipo não muda depois de criado.
- Limites: 500 respostas por conta, texto de até 4096 caracteres.
- **"Usar" na conversa (digitar `;`, chips acima do campo de mensagem) é papel
  da extensão e ainda não existe.** A rota `POST .../use` já soma o contador.
- Regra única de nomes em `lib/names.ts` (tira a palavra "cliente" e ignora
  "Cliente WhatsApp"), usada por mensagens, cobranças e Meta.

## Importar do WhatsApp (extensão v0.4)

Aba **Importar** da extensão: lê, pelos dados internos do WhatsApp Web (`page-bridge.js`), as **etiquetas** (viram listas, com a cor), os **contatos** e o **estado da conversa** (última mensagem foi sua ou da cliente, não lidas, arquivada). Manda pro CRM em lotes de 250 (`POST /api/crm/import`). Nunca apaga nada, não sobrescreve nome já cadastrado e não duplica (compara pelos 8 últimos dígitos do telefone). Grupos, canais e conversas sem telefone descoberto ficam de fora. Testado só num WhatsApp simulado; no real pode precisar de ajuste (botão **Copiar diagnóstico da leitura**).

## Ferramentas

Página `/dashboard/ferramentas`: **abrir conversa sem salvar o contato** (número + mensagem opcional, abre o wa.me) e **exportar contatos** em CSV (`GET /api/crm/export`: nome, telefone, listas, origem, compras, total, última compra, aguardando resposta; UTF-8 com BOM e separador `;` pra abrir no Excel; texto que começa com = + - @ ganha apóstrofo pra não virar fórmula).

## Painel do dia

Página `/dashboard/painel` (API `GET /api/crm/day`): vendas de hoje e dos últimos 7 dias, clientes novos, bloco **Atenção** (falhas e compras sem pixel no envio ao Meta, cobranças vencidas, lembretes atrasados), lembretes de hoje, cobranças e quem espera resposta. "Esperam resposta" vem do estado guardado na última importação; o aviso ao vivo fica na extensão. O botão "Abrir o Painel do Dia" do aviso da extensão abre esta página.

## Pendências (lembretes e adiadas)

Página `/dashboard/pendencias`: lembretes com data e hora por cliente, agrupados em Atrasadas / Hoje / Próximas, com abas Adiadas (quantas vezes foi empurrado) e Feitas. Ações: Feito, Adiar (1 hora, hoje 18h, amanhã 9h, 3 dias, semana que vem), Conversa (wa.me) e apagar. API: `/api/crm/reminders` (GET com `contactId` e `status=feitos`, POST) e `/api/crm/reminders/[id]` (PATCH done/reopen/snooze, DELETE). Na extensão: aba Lembretes dentro da conversa. Ainda não há aviso/notificação no horário.

## Tema Vision (visual)

Todas as cores ficam em variáveis no topo de `server/src/app/globals.css` (fundo azul-marinho, vinho fluorescente `--accent`, vermelho do Visão `--vred`, dourado `--gold`). Estilos compartilhados de botões, cartões e selos ficam em `server/src/lib/ui.ts`. Pra criar o tema claro, basta trocar os valores dessas variáveis. Menu lateral em `components/dash-nav.tsx`, ícones Lucide.

## Extensão no WhatsApp Web (v0.2)

Coluna de ícones à direita (Esta conversa, Notas, Cobranças, Respostas rápidas, Painel web) e painel que abre ao lado. Acima do campo de mensagem fica a barra de respostas rápidas (clique escreve no campo; quem aperta Enter é você) e, ao digitar `;`, abre a lista de atalhos. Texto e contato escrevem no campo. Imagem, vídeo, documento e áudio são **colados na conversa como arquivo** (o WhatsApp abre a pré-visualização, a legenda é escrita e você envia); áudio entra como arquivo de áudio, ainda **não** como mensagem de voz gravada na hora. Cobrar escreve a mensagem no campo, não envia sozinho.

Testada contra um WhatsApp simulado (fluxos de compra, lista, nota, cobrança, chips e atalho). **Ainda não testada no WhatsApp Web real**: se algo não detectar o nome/telefone ou não escrever no campo, ajuste só `getActivePhone`, `getActiveName` e `getComposer` em `extension/content.js`.

## Fila de entregas

1. Etiquetas/Listas (feito)
2. Disparo pro Meta (feito e testado com um Meta simulado; falta testar com
   o Pixel real)
3. Funil kanban (feito; falta a aba "Resultados")
4. Cobranças (feito; falta o botão "Cobrar" no painel da extensão e a regra
   "quando pagar, mover de lista")
5. Dados do lead e Notas (feito na gaveta do funil; falta mostrar na extensão)
6. Respostas rápidas (Texto, Contato, Áudio, Imagem, Vídeo e Documento feitos;
   faltam Sequência e o uso na conversa pela extensão)
   Próxima etapa combinada: tema Vision (azul-marinho + vinho fluorescente,
   claro e escuro) em todas as telas.
7. Lembretes e Adiadas
8. Painel do Dia
9. Ferramentas (wa.me, exportar, iniciar sem salvar)
10. Integração com a agenda de tarot (por último)
