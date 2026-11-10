# Estado da primeira entrega — 09/11/2026

## Implementado

Frontend Next.js mantido e expandido com contatos (busca, cadastro e detalhes) e área do plugin (download e instalação). Home abre o painel do dia. Layout responsivo verificado no navegador a 360 px.

Persistência do protótipo adaptada ao MongoDB com IDs string, relações via conector Prisma 6.19, índices compostos e índices únicos parciais explícitos. Consultas existentes foram mantidas; o driver direto previsto na proposta 1.1 permanece pendente. Essa decisão é temporária para preservar os módulos existentes, não uma troca de stack: o banco executado é MongoDB.

Extensão empacotável MV3 com background/popup em TypeScript, adaptador legado JavaScript, pedido de permissão por origem, validação de destino/rotas, bloqueio de redirecionamento de token e restrição de acesso ao armazenamento de credenciais. Build gera pasta instalável e ZIP do frontend.

Tokens com hash, expiração e revogação; identidade por telefone completo; idempotência de compra com retries de conflito e centavos para novas compras. Valores legados `amount` ainda existem por compatibilidade; migração completa de Charge/financeiro para centavos não concluída.

## Verificado

- Build de produção Next.js e build do plugin.
- Verificação TypeScript de servidor e plugin.
- Testes de integração em MongoDB temporário: identidade/conta, índices opcionais, recompra/retry, concorrência, rollback/relações/agregações e token.
- Testes da política do plugin: origem HTTPS/localhost, caminhos, token e acesso a arquivos.
- Navegador: login, painel com dados fictícios, cadastro de contato persistido, detalhes, página do plugin e layout de contatos a 360 px.

## Não concluído

Não é o aceite integral dos documentos 1 e 2. Faltam driver direto/remoção do Prisma, migração de base real, Deals/pipeline exclusivo, estados/estornos financeiros completos, atribuição LP, preferências/consentimento, outbox durável, integração ERP e BI. Homologação em WhatsApp/Meta/ERP reais e publicação da extensão ficam pendentes.

Nenhum dado real foi acessado ou migrado. Integração Meta vem desativada. Os critérios AC dos documentos são requisitos futuros; apenas os cenários comprovados pelos testes desta entrega podem ser considerados verificados.

## Requisitos para uso com dados reais

Configurar MongoDB replica set e segredos em `server/.env`; criar índices; gerar novas credenciais da extensão; ensaiar a migração se houver histórico PostgreSQL. Não usar db push como ferramenta de migração nem reenviar eventos históricos. Revisar a manutenção do Prisma 6 e a alternativa de driver oficial antes de liberar produção.

## Revisão 1.3 — melhorias de arquitetura, UX, acessibilidade e desempenho

Implementado em 09/11/2026 no repositório VisionSync, preservando o trabalho local anterior:

- Paginação por cursor nos contatos, mantendo compatibilidade com a extensão e busca na URL.
- Filtro e paginação no servidor para cada coluna do funil; indicadores globais independentes dos cards carregados; sem corte global de 2.000 contatos.
- Filtro de cobranças antes da paginação e agregação global com soma em centavos; nenhum corte prévio dos últimos 500 para decidir vencidas/recebidas.
- Histórico de compras em lotes de 50 com estatísticas de todo o histórico e reutilização do contato autorizado; timeline informa seus limites.
- Dados iniciais de contatos/funil por Server Components; loading/error de rota, proteção contra respostas antigas e ficha sob demanda com fallback local.
- Ficha como diálogo com foco contido/restaurado, Escape, rótulos, abas por teclado e aviso interno de alterações não salvas. Kanban com botão para abrir contato e seletor para mover sem arrastar; navegação/atalho de conteúdo.
- Desenvolvimento separado de preparação do banco; remoção do seed automático. Preparação de schema/índices somente por comando explícito; demonstração por script temporário.
- Login/cadastro com contador atômico e expiração MongoDB; limites por email (chave hash) e por instalação. Índices adicionais definidos no script; não aplicados ao banco real.
- Novas cobranças validadas em duas casas decimais e limite seguro. Float permanece compatível; backfill e migração financeira não executados.

### Verificações desta revisão

- TypeScript do painel e extensão: aprovado.
- ESLint do painel: aprovado sem erros/avisos.
- Build de produção do painel e extensão: aprovado.
- Testes: 15 resultados no servidor (suíte principal + 14 cenários), 2 testes da extensão, todos aprovados. MongoDB temporário; nenhuma base real utilizada.
- Regressões: 2.002 contatos, coluna com 105 membros, 502 cobranças incluindo vencida antiga, 55 compras, isolamento entre contas, totais independentes da página e concorrência/expiração do limite de autenticação.

Navegador com MongoDB temporário: login de demonstração; dados iniciais de contatos/funil; abertura da ficha sob demanda sem perder o acionador; campos com nomes acessíveis; foco dentro do diálogo; abas por End/teclado; aviso de edição não salva com opção de continuar; descarte e retorno de foco ao contato. Movimentação pelo seletor confirmada na coluna de destino. Contatos, ficha e indicadores do funil conferidos a 360 × 800 px, sem extravasamento horizontal do documento; kanban mantém rolagem própria. Tema preservado. Evidência visual salva em `VisionSync-verificacao.png` nos arquivos de saída desta conversa. Demonstração encerrada ao final.

Cobranças novas: centavos/moeda persistidos pelo endpoint, rejeição de frações menores que um centavo, preferência do campo canônico na leitura e baixa concorrente quatro vezes gerando uma única compra. Cenários exercitados em banco temporário após a última alteração financeira. Não houve nova sessão visual após essa alteração de persistência; ela não alterou o desenho da interface.

### Ainda pendente

Não houve deploy, homologação de WhatsApp/Meta/ERP reais, migração de dados reais nem aplicação de índices no banco real. Para preparar os campos/índices novos, revisar o destino e executar `db:generate`, `db:push` e `db:indexes` conforme o README, sem usá-los como migração automática de dados. Métricas de Core Web Vitals, teste de carga e auditoria integral de acessibilidade permanecem pendentes. Também permanecem as funcionalidades do roadmap não implementadas: driver direto, Deals, outbox, atribuição, ERP e BI.

Os arquivos fornecidos do NexuSync AI Studio pertencem a outro produto e não foram editados. Os documentos originais de arquitetura e roadmap atualizados são os desta pasta `docs` do VisionSync.

### Compatibilidade financeira da revisão 1.3

Novas cobranças passam a gravar `amountMinor` (centavos inteiros) e `currency=BRL`. Na baixa, a compra usa esses mesmos centavos/moeda. A leitura e os resumos preferem centavos; registros legados sem esse campo continuam lidos por `amount`, preservado para compatibilidade. Nenhum histórico foi reescrito. Campos novos são aditivos; gerar o cliente faz parte do build. Backfill com reconciliação do legado e remoção futura de Float permanecem separados desta entrega, assim como estornos e demais estados financeiros do roadmap.

## Revisão 1.4 — fechamento da primeira etapa e temas

Quatro temas no painel e autenticação: escuro original, escuro minimalista, claro e claro minimalista. O original continua padrão. Seleção por rádio acessível em Configurações → Aparência e no detalhe Aparência do login/cadastro. Preferência visual persistida no cookie `visionsync-theme`, validada e aplicada no HTML pelo servidor. Cookie ausente/inválido retorna ao original; sem mudança de permissões ou dados de conta.

Temas alternativos cobrem superfícies, campos, menus, indicadores, fichas, mensagens semânticas e autenticação. Os minimalistas retiram brilhos, sombras e gradientes decorativos. Não foram adicionadas dependências de tema/Tailwind; extensão WhatsApp não foi redesenhada.

Criados os guias consolidados `04-documento-de-desenvolvimento.md` e `05-roadmap.md`, preservando as especificações anteriores. Nenhum documento do NexuSync AI Studio foi alterado.

Verificação desta revisão: TypeScript, lint, testes e build aprovados. Servidor: 17 resultados (suíte de integração e cenários + 2 testes de temas); extensão: 2 testes. O teste de preferência cobre os quatro identificadores e fallback para valor ausente/inválido. Os tokens de texto dos temas alternativos foram testados com contraste mínimo 4,5:1 nos pares selecionados, e as bordas dos campos, 3:1; isso não declara conformidade integral de acessibilidade.

No navegador, com dados fictícios: quatro temas selecionados; escuro original e claro minimalista persistentes após recarga; navegação de rádio por seta; tema mantido entre Configurações, contatos, ficha e login; seletor compacto de autenticação; configurações e ficha a 360 px sem extravasamento horizontal do documento; novo contraste de campos conferido no login. Não foram observados erros/avisos de console na conferência final. Preferência de teste restaurada para escuro original e viewport restaurado. Demonstração temporária encerrada ao final.

Capturas: `VisionSync-tema-original.png`, `VisionSync-tema-escuro-minimalista.png`, `VisionSync-tema-claro.png` e `VisionSync-tema-claro-minimalista.png`, nos arquivos de saída desta conversa. Não houve deploy nem alteração de dados reais.

## Correção da inserção de respostas rápidas — 09/11/2026

Tratado o erro relatado no Chrome: `Uncaught (in promise) TypeError: Cannot read properties of undefined (reading 'catch')`, apontado na chamada `insertIntoComposer` da sequência. O fallback chamava `.catch` diretamente em `clipboard.writeText`; agora valida disponibilidade/retorno, trata falhas síncronas e rejeições, e só confirma texto copiado após resolução da operação. Inserção sem sucesso retorna false para interromper a sequência.

Regressão reproduz o retorno undefined e verifica que a sequência não lança erro nem avança para envio. Também testados bloqueio/rejeição da área de transferência, confirmação assíncrona de cópia, paste/insertText bem-sucedidos e campo ausente. Seis testes da extensão e TypeScript aprovados; pacote e ZIP recompilados e conferidos contra o fonte. Nenhum teste enviou mensagem em WhatsApp real. Recarregar a extensão e a página do WhatsApp para substituir o content script já aberto.

## Página de instalação — prévia da extensão revisada

Em 09/11/2026, o desenho abstrato com barras cinzas foi substituído por uma demonstração preenchida da estrutura real do painel: contato fictício, etiquetas, compras, registro de compra, próximo passo, histórico e coluna de ícones. A prévia é identificada como exemplo com dados fictícios e não apresenta controles funcionais nem simula uma conexão ativa. Mantém a paleta original da extensão, independente do tema do painel web.

Tipos e lint aprovados. Compilação Next.js de produção aprovada usando o cliente Prisma existente (a regeneração do cliente estava bloqueada por outro processo; não houve alteração de schema). Conferência no navegador em ambiente isolado na porta 3007: desktop, tela de 360 px e temas original, escuro minimalista e claro minimalista. Nenhum extravasamento horizontal do documento em 360 px. Capturas salvas como VisionSync-previa-plugin.png e VisionSync-previa-plugin-celular.png. Nenhuma conversa real foi acessada; instalação, download e configurações preservados.

## Ajustes iniciais para uso no celular - 09/11/2026

Menu recolhível abaixo de 820 px, com estado expandido acessível, fechamento por Escape e retorno de foco ao selecionar um destino. A navegação lateral de desktop e os quatro temas foram mantidos. Botões do conteúdo e saída com altura mínima de 44 px no mobile; campos com fonte de 16 px. Cabeçalhos longos podem quebrar linha. Os formulários de agenda e sequências passam para uma coluna; controles e ações das sequências podem quebrar linha e os roteiros prontos cabem em painéis estreitos.

Verificação: TypeScript e ESLint do diretório src aprovados antes da última alteração de layout da agenda; lint dos quatro componentes alterados aprovado após ela. Build com webpack compilou e concluiu TypeScript, mas não finalizou por EPERM ao criar diretório durante prerenderização. Turbopack também foi impedido de criar junction pelo ambiente. O lint global encontra arquivos gerados antigos em .next-verify; lint de src não apresentou erros. Revisão visual em navegador/celular permanece pendente. Não houve deploy nem envio de mensagens.

Mensagens: a agenda atual armazena horário e texto e a extensão apresenta aviso para ação do atendente. Sequências são iniciadas por clique/atalho; não equivalem a respostas por gatilho. O cadastro já possui birthDate, mas geração anual de mensagens de aniversário ainda não está implementada. Esta etapa não adiciona automações de envio, PWA ou integração oficial.

## Piloto interno de envios no servidor - 09/11/2026

Adicionado conector Baileys 7.0.0-rc14 em worker Node.js separado, com tela autenticada `/dashboard/whatsapp` e até dois destinatários permitidos. Implementados QR privado, sessão e chaves Signal criptografadas no MongoDB, lease por conta, reconexão, pausa, aprovação/cancelamento de mensagens, exclusão de contato e distinção entre transmissão, entrega, leitura e resultado incerto. Falhas ambíguas e jobs interrompidos não são repetidos automaticamente.

Aniversários são gerados por contato/ano; retorno de orçamento e pós-venda partem de ações explícitas de orçamento enviado e serviço concluído. As regras ficam desligadas inicialmente; a fila começa pausada e em revisão. Resposta observada cancela retorno de orçamento; pedido reconhecido de parada bloqueia o contato. Não há disparo por simples cadastro de compra nem importação completa de conversas.

Verificação: 31 testes do servidor aprovados, incluindo 10 do módulo de WhatsApp com transporte simulado e MongoDB temporário; TypeScript e ESLint do código-fonte aprovados. Rota do painel redireciona visitante sem sessão (307); API devolve 401 sem login. Worker iniciou com MongoDB local. Build webpack de produção foi tentado em diretório isolado e bloqueado por EPERM ao criar diretório de tipos de uma rota existente. Não há build de produção aprovado para esta alteração nem conferência visual completa desta tela. Não houve envio real, vinculação real ou deploy na VPS.

Operação, implantação e roteiro de teste em [06-piloto-whatsapp-servidor.md](06-piloto-whatsapp-servidor.md). A vinculação exige que o usuário informe os destinatários autorizados e escaneie o QR no WhatsApp remetente.

## Extensão 0.19.0: contexto, favoritos e mídia - 09/11/2026

Corrigida comunicação central com Chrome runtime: captura de throws, rejeições e runtime.lastError, timeout e encerramento de timers/observers após contexto invalidado. A aba antiga mostra aviso de recarga, sem recarregar automaticamente ou enviar rascunhos. Removida função savePrefs duplicada que chamava a si mesma recursivamente. Preferências agora usam uma única gravação. Cliques concorrentes em respostas são bloqueados e troca de conversa durante download impede anexar ao contato errado.

Envio de arquivo tenta paste e input de arquivo existente. Legendas e clique automático ficam restritos à prévia, sem clicar no enviar do compositor de fundo quando uma prévia não foi confirmada. Sequências param quando a preparação/envio não é confirmado. Encaminhamento não é usado: texto é inserido como nova mensagem; arquivo é carregado como novo upload. Nota de voz usa o conector do servidor, com OGG/Opus real e flag PTT; MP3 continua como áudio comum, sem conversão automática. A preferência de envio direto é respeitada: desmarcada, a nota de voz aguarda aprovação no painel. Os dois destinatários do piloto continuam sendo o limite do conector.

Botão de salvar ao passar o mouse ampliado para mensagens recebidas/enviadas. Texto abre o editor; áudio/imagem obtidos pelo adaptador de mídia do WhatsApp são enviados à biblioteca como favoritos, mediante clique e nome informado. Mídia indisponível/protegida, visualização única, tipos não suportados ou arquivos acima de 4 MB são recusados. A leitura depende dos módulos internos do WhatsApp e requer conferência na versão real em uso.

Agendamentos assistidos podem referenciar áudio/imagem da biblioteca por scheduledReplyId, novo campo opcional de Reminder. A consulta inclui lembretes antigos com doneAt ausente, além de null explícito; novos lembretes gravam doneAt null. Texto com áudio requer um passo separado; imagem usa legenda. Roteiros da extensão e do painel preservam referências de mídia por passo e validam conta/tipo. Nota de voz em roteiro é enfileirada no servidor e o roteiro local pausa nesse passo para evitar ultrapassagem das mensagens seguintes; não é um chatbot autônomo.

Envios no servidor permite data/hora manual com mídia e anexo por regra de aniversário, retorno e pós-venda. O job registra hash e tipo do anexo; alteração, exclusão ou troca de conta impede uso do arquivo. Áudio substitui o texto; imagem usa o texto como legenda. Falhas conhecidas antes da transmissão cancelam o job; falhas ambíguas continuam sem repetição automática.

Empacotamento atualizado: pasta extension/dist, ZIP público e CRX 0.19.0. O CRX é assinado usando a chave local já existente, sem criar nem expor outra. Verificados assinatura, vínculo do identificador à chave e os sete arquivos do ZIP incorporado. Arquivos PEM ficam ignorados no Git.

Validação: TypeScript de ambos workspaces e ESLint do código-fonte aprovados; 16 testes da extensão e 34 do servidor aprovados. Testes com runtime invalidado, recursão, cliques simultâneos, troca de chat, referências de mídia, propriedade do anexo, PTT/Opus, integridade de snapshot e persistência/listagem de agendamento. Nenhum teste envia mensagens reais.

Limites: a regeneração do Prisma escreveu cliente JS/tipos novos, mas o comando não terminou devido à DLL do engine em uso (EPERM). Testes MongoDB em processo novo confirmam o campo novo. Reiniciar o CRM e o worker para carregar o cliente atualizado. Build de produção webpack bloqueado por EPERM ao criar diretório de tipos, sem build integral aprovado. Nenhum teste visual/funcional em WhatsApp real ou deploy nesta revisão. Atualizar a extensão e recarregar a aba WhatsApp para substituir os scripts antigos.

## Extensão 0.20.0: recuperação, anexos e temas Vision — 10/11/2026

Os eventos assíncronos de formulário/clique agora têm uma fronteira de captura de erros. A invalidação cancela as requisições pendentes, timers, observers e listeners globais; a aba mostra aviso de recarga. O content script é empacotado em IIFE e permite substituir uma instância 0.20 sem redeclarações globais. A instalação/atualização reinsere os scripts nas abas do WhatsApp, e o popup oferece Reativar painel. A ponte usa eventos versionados para evitar resposta de uma ponte antiga. A migração de scripts anteriores ainda requer recarregar a aba uma vez para retirar os listeners antigos.

Ambos os agendadores da extensão (cabeçalho e painel Lembretes) permitem anexar OGG/MP3 ou PNG/JPEG/WebP de até 4 MB diretamente do computador, além de selecionar mídia da biblioteca. O upload seleciona o item criado sem apagar o formulário. O editor de respostas rápidas também aceita áudio e imagem diretamente. O envio aguarda upload concluído. MP3 é áudio comum; nota de voz requer OGG/Opus e o conector do servidor, conforme as restrições do piloto.

A foto disponível no WhatsApp é apresentada antes da existência de um contato salvo; a persistência no CRM continua separada e respeita a identidade da conversa. A barra de favoritos fica dentro do rodapé, trata clique em captura, preserva o foco do compositor e permite rolagem horizontal. Toasts não refazem o painel inteiro; arquivo selecionado no editor não é descartado por uma atualização de fundo.

CRM e extensão oferecem somente Vision escuro e Vision claro: verde-petróleo, magenta e dourado; marfim nas superfícies claras. Preferências antigas do CRM migram para a variante correspondente. A extensão mantém sua própria preferência no popup. O painel mostra a versão 0.20.0 para diagnóstico.

Validação: 34 testes do servidor e 20 da extensão aprovados; TypeScript de ambos workspaces e ESLint de src aprovados. Testes cobrem cancelamento de chamadas pendentes, fronteira assíncrona de submit, upload direto e prévia de foto sem contato salvo. No navegador, teste isolado confirmou clique de favorito inserindo texto no compositor e campo de anexo no agendador do cabeçalho; login do CRM confirmou as duas opções de tema e persistência após recarga. Build da extensão gerou pasta instalável, ZIP e CRX 0.20.0. Não houve envio real, instalação no navegador do usuário nem deploy; comportamento dos seletores de mídia/foto ainda precisa de validação no WhatsApp real. Build integral de produção permanece sem validação nesta revisão (limitação EPERM registrada acima).

## Temas Vision do cinema e minimalista — 10/11/2026

Revisada a direção de cores conforme as referências do usuário: Vision escuro e Vision claro usam petróleo profundo, vinho dessaturado e dourado envelhecido. Acrescentado um único Vision minimalista claro, com branco, prata, azul frio, superfícies chapadas e sem brilho decorativo. Disponíveis no CRM e no popup da extensão; preferências dark/light existentes são preservadas e light-minimal legado migra para minimal. Contraste de texto, controles e estados aprovado nos três temas. TypeScript e build da extensão 0.20.1 verificados; não houve deploy.

## Restauração do tema escuro original

Por solicitação do usuário, o tema escuro voltou ao azul-marinho #040a1c/#0c2150 e vinho #e0245e originais, com dourado envelhecido #c4a56a em detalhes. Claro e minimalista preservados. Textos auxiliares e bordas dos controles mantêm contraste legível. Extensão 0.20.3 empacotada.

## Logos oficiais — 10/11/2026

Aplicados os quatro PNG fornecidos pelo usuário: logo-big-white e logo-small-wh no escuro; logo-big-dark e logo-small-dark no claro e minimalista. Componente compartilhado no login, cadastro e navegação; popup da extensão usa logo pequeno completo e trilho estreito mostra o olho do mesmo arquivo por recorte de CSS, sem modificar a imagem original. Recursos da extensão são empacotados e disponibilizados apenas às abas do WhatsApp. Proxy libera somente os quatro caminhos públicos de marca; dashboard continua redirecionando visitante e API continua exigindo autenticação. Conferência visual no login confirmou as duas versões. TypeScript, lint dos arquivos editados e pacote 0.20.4 verificados.

## Fundos de acesso e ícones oficiais — 10/11/2026

Aplicados os três BGs fornecidos no login e cadastro. Sorteio inicial no cliente e alternância aleatória a cada 15 segundos sem repetir imediatamente, com transição de opacidade; nova imagem só aparece após carregar. Aba oculta pausa as trocas e preferência por movimento reduzido mantém a imagem inicial estática. Formulário usa superfície opaca do tema para legibilidade. Recursos públicos de marca enumerados no proxy; dashboard continua protegido. Ícone fornecido aplicado ao trilho do plugin, toolbar e gerenciador do Chrome em 16/32/48/128 pixels, favicon ICO 16/32/48, PNG e Apple Touch 180. Pacote da extensão 0.20.5 gerado. TypeScript e lint aprovados; HTTP confirmou imagens e ícones sem login e redirecionamento do dashboard. Sem deploy nesta etapa.
