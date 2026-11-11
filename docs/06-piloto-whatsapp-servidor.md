# Envios de WhatsApp no servidor

O acesso é limitado por usuário no ambiente privado; não há lista de destinatários. A vinculação por QR e envio/entrega em contas reais exigem teste acompanhado. Não houve deploy na VPS.

## Abrir e conectar

1. Inicie o CRM normalmente. No diretório raiz, execute `npm run whatsapp:worker` em outro processo persistente.
2. Entre no CRM e abra **Mensagens → Envios no servidor**, em `/dashboard/whatsapp`.
3. Configure `ALLOWED_USER_EMAILS` no aplicativo e no worker, conforme [Acesso e recuperação](acesso-e-recuperacao.md). Cadastre os destinatários em Contatos.
4. Clique em **Conectar / gerar QR**. A solicitação também pode ser feita com o worker desligado; o QR aparece quando ele for iniciado.
5. No WhatsApp remetente, acesse aparelhos conectados e escaneie o QR privado da tela. A vinculação pode solicitar um novo QR caso expire.
6. Aguarde o estado conectado. O worker espera o processamento inicial das notificações antes de liberar transmissão.
7. Escolha um destinatário e prepare uma mensagem de teste. Confira o texto na fila, aprove individualmente e retome a fila.
8. Confira a conversa real e os estados transmitida, entregue e lida. Se houver resultado incerto, confira a conversa antes de preparar outro teste. Não há repetição automática.

O modo automático é uma opção explícita por conta. Cada regra também precisa ser habilitada. Alterar modelos afeta mensagens futuras; as já preparadas preservam o texto. Desabilitar modo automático devolve mensagens não aprovadas à revisão quando o worker as examina.

## Fluxos

| Fluxo | Origem | Regra |
|---|---|---|
| Aniversário | `birthDate` do contato | Geração no dia, uma chave por contato/ano. Expira 24 horas depois de preparada. Sem backfill de aniversários antigos. 29/2 só ocorre em anos bissextos nesta versão. |
| Retorno de orçamento | Ação **Marcar orçamento enviado** | Agenda em dias de calendário, às 9h, conforme intervalo salvo. Resposta observada, negócio ganho/perdido ou contato sem interesse cancelam o retorno pendente. |
| Pós-venda | Ação **Marcar serviço concluído** | Agenda em dias de calendário, às 9h, conforme intervalo salvo. Não é disparado pelo mero cadastro de uma compra. Se a conclusão for revertida, cancele manualmente a mensagem. |
| Teste | Preparação explícita com texto e contato | Sempre exige aprovação individual. |

Orçamento e pós-venda expiram 24 horas após o vencimento, sem replay indefinido; são agendados às 9h de Brasília no dia calculado, mas não há janela obrigatória para transmissão. A pausa não cancela transmissões que já cruzaram a fronteira de envio. A fila deve ser revisada antes de retomar após uma interrupção. Não há limite fixo de destinatários nem de uma tentativa por minuto.

## Persistência e segurança

- Next.js continua responsável pelo CRM e por rotas administrativas autenticadas por sessão. Token da extensão não administra o conector. Mutações verificam Origin, Zod e limite de corpo.
- Worker Node.js separado mantém a conexão. Não executar o socket em Route Handler, cron efêmero ou instância serverless.
- Novas coleções MongoDB: `wa_connections`, `wa_jobs`, `wa_auth` e `wa_exclusions`. Driver MongoDB oficial somente neste módulo; módulos existentes continuam em Prisma, sem migração ou mudança de schema.
- Índices são idempotentes. Jobs usam chave única por conta/evento e transição atômica para envio. Há lease por conta para evitar dois workers ativos. Após interrupção durante envio, o job fica incerto e não é reexecutado automaticamente.
- Credenciais e chaves Signal são serializadas com BufferJSON e criptografadas usando AES-GCM e `NEXTAUTH_SECRET`, reaproveitando a criptografia existente. Não trocar esse segredo sem planejar nova vinculação. QR também é criptografado, expira e só é entregue à sessão autenticada da mesma conta, sem cache.
- O worker não importa histórico completo nem registra conteúdo das mensagens recebidas. Usa metadados de mensagens individuais de contatos para cancelar retorno e reconhecer pedidos explícitos de parada. Variações de linguagem não reconhecidas exigem bloqueio manual no painel.
- Bloquear um contato cancela suas mensagens ainda não iniciadas. Reautorizar não recupera mensagens canceladas.
- As mensagens criadas pelo CRM ficam armazenadas no histórico de jobs. A tela permite navegar por todas as páginas e filtrar por status, tipo ou trecho de nome, telefone e mensagem. A busca ignora diferenças de maiúsculas/minúsculas para letras portuguesas, mas não ignora acentos. Os termos são enviados na URL da consulta e podem aparecer em logs de acesso; evite pesquisar conteúdo sensível em ambientes que os registrem. Não há exclusão automática de histórico nesta versão.
- O painel exibe totais da fila e o último heartbeat. A navegação avisa sobre falhas de conexão, aprovações pendentes e resultados incertos ainda não conferidos; a atualização não substitui monitoramento externo da disponibilidade do servidor. Após conferir uma conversa, marque o resultado incerto como conferido: isso não altera o status nem comprova entrega.

Baileys está fixado em `7.0.0-rc14`, a versão publicada como latest consultada durante esta entrega. É uma versão candidata, não uma promessa de estabilidade. Revalidar antes de expandir o piloto. A integração não é oficial e pode desconectar ou sofrer incompatibilidades e restrições.

## Operação na VPS

Usar Node compatível com o projeto, `DATABASE_URL` e `NEXTAUTH_SECRET` do CRM. Instalar dependências incluindo as opcionais da plataforma para o Baileys. O usuário do worker deve ter acesso somente à configuração necessária. Gerenciar `npm run whatsapp:worker` como processo persistente via systemd ou gerenciador já adotado; iniciar com uma única instância. Não abrir MongoDB ou uma porta pública adicional para o worker.

O painel identifica ausência de heartbeat. Os avisos no aplicativo dependem de uma sessão aberta e não substituem supervisão do processo, reinício automático ou alertas externos. Se o servidor estiver indisponível ou a sessão for revogada, os envios não acontecem. Desconectar no painel pausa a fila e solicita logout/remoção das credenciais locais criptografadas. Se o worker estiver desligado, a solicitação será processada ao voltar; para revogação imediata use aparelhos conectados no próprio WhatsApp.

## Verificação e limites

Testes automatizados usam MongoDB temporário, números fictícios e transporte simulado. Cobrem calendário/fuso, sessão criptografada/isolamento, aniversários idempotentes, concorrência de claims, revisão, pausa, expiração, exclusão, resposta do contato, encerramento de negócio e resultado incerto. Nenhum teste automatizado envia mensagens reais.

O suporte a QR, eventos LID e confirmações está implementado, mas depende de validação com o WhatsApp real. A leitura de resposta enquanto a sessão está desconectada ou em outro aparelho não deve ser tratada como auditoria completa: o módulo observa os eventos disponibilizados pela sessão conectada. Não há chatbot, mensagens em grupo, importação de base, campanha em lote ou reenvio de incertos.

## Áudio e imagens (extensão 0.19.0)

Cadastre o arquivo em Respostas rápidas ou use o botão de salvar ao passar o mouse sobre a mensagem no WhatsApp. Arquivos capturados entram como favoritos. Limite: 4 MB. Conteúdo protegido ou indisponível não é importado.

- **Arquivo de áudio:** MP3 ou OGG, como novo upload; não é encaminhamento.
- **Nota de voz:** marque Enviar como nota de voz na biblioteca; exige OGG com codec Opus e conector conectado. Se necessário, converta fora do aplicativo, por exemplo `ffmpeg -i entrada.mp3 -c:a libopus -ac 1 -ar 48000 saida.ogg`. Não há conversão automática instalada nesta revisão.
- **Imagem:** PNG/JPEG/WebP, com legenda opcional. Não usar visualização única em agendamentos ou roteiros reutilizáveis.

Na Agenda, o anexo é assistido pela extensão e usa a versão atual da biblioteca. O link de WhatsApp apenas abre a conversa; não transporta o arquivo. No formulário Envios no servidor, escolha Agendar texto, áudio ou imagem, contato, arquivo e data/hora. Regras de aniversário, retorno e pós-venda também aceitam um anexo próprio. Áudio substitui o texto; imagem usa o texto como legenda. Arquivo alterado depois de enfileirar invalida o envio, em vez de trocar o conteúdo silenciosamente.

Roteiros podem incluir passos de áudio/imagem da biblioteca. Texto com áudio deve ficar em outro passo. Mídia nativa só avança com confirmação da preparação e solicitação de envio. Uma nota de voz delegada ao servidor pausa o roteiro local para preservar a ordem; confira a fila antes de continuar. As regras do servidor são independentes dos roteiros locais.

Após atualizar: reinicie o CRM e o worker, recarregue a extensão 0.19.0 e recarregue a aba do WhatsApp Web. Um script cujo contexto já foi invalidado não recupera a conexão sem essa recarga. A mensagem exibida de recarga não envia nem apaga seu rascunho.
