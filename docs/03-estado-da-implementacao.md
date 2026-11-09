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
