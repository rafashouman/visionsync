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
