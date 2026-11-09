# Documento 2 — Definição de Produto, MVP e Roadmap

Versão de revisão: 1.2 · 9 de novembro de 2026.

Uma primeira entrega de frontend, plugin e adaptação ao MongoDB já foi implementada. O inventário abaixo registra a base original, e o roadmap continua sendo escopo de destino. Consulte [estado da implementação](03-estado-da-implementacao.md) para evidências e pendências; o MVP completo ainda não foi concluído.

Stack de destino definida pelo usuário: **Next.js + MongoDB, com preferência por TypeScript**. JavaScript pode ser usado quando for melhor para um caso concreto; outras tecnologias só quando realmente necessárias, com justificativa. PostgreSQL/Prisma permanecem apenas como descrição da origem a migrar.

Documento complementar a [Arquitetura e Diretrizes](01-arquitetura-e-diretrizes.md). Escopo: evolução do protótipo Vision CRM em `C:\@sites\visionsync`, referido como NexuSync nos documentos de origem. Nome comercial permanece pendente; não renomear repositório ou produto durante implementação sem decisão explícita.

## 1. Problema e resultado esperado

Organizar atendimento originado no WhatsApp, distinguir contato de oportunidade e compra, registrar receita confirmada e entregar sinais elegíveis à Meta e ao ERP com rastreabilidade. A extensão reduz alternância de telas; o painel web permite operação e contingência no celular/desktop.

O produto deve conseguir responder: quem é o cliente, qual oportunidade está aberta, qual compra foi confirmada, qual origem foi conciliada e qual integração recebeu o evento. Não prometer que todo clique vira contato identificado, que não haverá custo, que o vendedor nunca sairá do WhatsApp ou que o algoritmo garantirá lucro.

## 2. O que já existe e o que muda

| Área | Base existente | Entrega necessária |
|---|---|---|
| Atendimento | sidebar JS/MV3; leitura de conversa; contatos, notas, respostas, cobranças e lembretes | homologar WhatsApp real; proteção de identidade e contingência |
| CRM | painel Next.js; contatos e listas/kanban | Deal/etapas/histórico sem perder etiquetas |
| Persistência | PostgreSQL/Prisma no protótipo | MongoDB com driver oficial, validação, índices únicos e transações; migração sem perda |
| Financeiro | compras e baixa manual de cobrança | centavos/moeda, idempotência geral, estados e estornos |
| Meta | Purchase/Recompra, pixels por lista, reenvio manual | catálogo de Lead/qualificação, outbox, destino fixo e privacidade |
| Origem | origem manual e ctwaClid opcional | LP, referências, preferências e conciliação assistida |
| ERP | não identificado no código | contrato canônico e um adaptador homologado |
| Mobile | aplicação web; sem artefatos PWA identificados | fluxo responsivo e alternativa a arrastar; instalação PWA posterior |
| Métricas | totais e recorrência básica; limites de leitura | agregação correta e cobertura; Ads/BI posterior |

O README relata simulações e falta de teste no WhatsApp/Meta reais; não há evidência nesta revisão de homologação de produção. Não repetir funcionalidades já implementadas como tarefas de criação; tarefas abaixo especificam estabilização, mudança ou expansão.

## 3. Público e jornada do piloto

Primeiro piloto: uma conta proprietária, uma operação no Brasil, BRL, um pipeline e um ERP identificado. O armazenamento atual isola por usuário; não contempla equipe compartilhada com permissões. Se o piloto precisar de equipe, antecipar Workspace/RBAC.

Jornada principal:

1. Visitante acessa LP e escolhe suas preferências; pode iniciar atendimento após recusa.
2. Se elegível, LP gera referência opaca e abre WhatsApp com mensagem; envio continua sendo ação do visitante.
3. Vendedor abre conversa individual; extensão sugere contato/ref e ele confirma associação. Se não detectado, usa painel manual.
4. Vendedor cria oportunidade e qualifica com intenção, interesse e próximo passo. Etiquetas continuam organizando contatos separadamente.
5. Ao fechar, informa valor/moeda/data e registra pagamento confirmado, vincula compra ou cria cobrança pendente.
6. CRM salva operação e eventos atomicamente. Worker entrega Meta e ERP independentemente; usuário acompanha pendências.
7. Nova compra tem identidade própria. Retry, dupla ação ou reabertura não criam compra nova.

No celular, vendedor conversa pelo WhatsApp e registra no painel web. Sem Chrome desktop ativo, não há captura automática. Em troca de dispositivo, telas recuperam o estado do servidor; indicar última sincronização e alterações pendentes.

## 4. Escopo MVP

### 4.1 Incluído

- Preservar módulos atuais de contatos, listas, notas, cobranças, lembretes, respostas e exportação; corrigir falhas que afetem o fluxo principal.
- Migrar persistência PostgreSQL/Prisma para MongoDB, preservando dados/IDs e substituindo os acessos ao banco; TypeScript como padrão de implementação, sem exigir novas tecnologias além do necessário.
- Identidade de contato com telefone internacional, unicidade por conta e revisão de colisões.
- Pipeline simples por Deal: Novo, Contatado, Qualificado, Proposta, Ganho e Perdido; múltiplas oportunidades por contato; histórico e concorrência.
- Registro explícito de compra confirmada e cobrança pendente; idempotência, moeda e centavos; estorno interno auditado.
- Um script/fluxo LP com origem cadastrada, preferências de marketing, referência segura e conciliação assistida.
- Eventos internos e Meta conforme catálogo do Documento 1; `Lead`, `CRMQualifiedLead` customizado sob homologação e `Purchase` para novas compras/recompras.
- Outbox durável, estados, tentativas e reprocessamento seguro; painel de integração.
- Um conector ERP, condicionado a contrato e sandbox reais; inbox/deduplicação/consulta externa quando disponíveis.
- Painel web utilizável no celular com seleção de etapa por botão/menu além de drag-and-drop.
- Controles mínimos de privacidade, isolamento, credenciais, retenção configurada e recuperação.

### 4.2 Fora do MVP

Aplicativo nativo; leitura automática do WhatsApp móvel; sincronização offline de vendas; WebSocket obrigatório; automação de mensagens/disparos; chatbot; API oficial de WhatsApp; múltiplos ERPs genéricos; emissão fiscal/estoque; equipe/RBAC salvo antecipação necessária; instalação PWA/offline; sequência automática de respostas; BI de margem/lucro; gastos Ads automáticos; recomendação automática de CPA; garantias de EMQ/ROAS/VBB.

Não remover capacidades existentes que ficam fora da expansão. A escolha de não expandir um módulo não autoriza regressão nem exclusão de dados.

## 5. Regras e critérios de aceite

Os critérios são verificáveis; aprovação depende de evidência do ambiente da entrega. Os números operacionais são metas propostas para o piloto, não desempenho medido do protótipo.

| ID | Cenário | Resultado exigido |
|---|---|---|
| AC-01 | Conta A solicita contato, Deal, arquivo, pixel ou entrega de B | sem leitura/alteração; resposta segura; teste cobre todos os novos endpoints |
| AC-02 | Dois telefones com últimos oito dígitos iguais e DDDs diferentes | dois contatos; nenhuma união por sufixo; colisão de normalização vai à revisão |
| AC-03 | Migração PostgreSQL→MongoDB | IDs, contagens, arquivos e referências preservados; valores reconciliados; índices/validadores instalados; transações verificadas em replica set; backup e corte/rollback ensaiados; zero evento externo disparado pelo backfill |
| AC-04 | Mesmo comando de compra em duas chamadas simultâneas | uma Purchase, um fato de confirmação e uma entrega por destino; mesma chave retorna mesmo ID; corpo diferente retorna 409 |
| AC-05 | Duas baixas da mesma cobrança | uma compra; segunda operação informa estado já processado; sem repetir integrações |
| AC-06 | Segunda compra real do mesmo contato | nova Purchase/ID, evento Purchase separado com valor correto; retry mantém esse ID |
| AC-07 | Mover etiqueta, reabrir Deal ou ir/voltar de etapa | sem receita ou evento de qualificação duplicado; histórico de etapas consistente |
| AC-08 | Dois vendedores/dispositivos mudam a mesma versão do Deal | uma alteração vence; outra recebe conflito e pode recarregar; nenhuma perda silenciosa |
| AC-09 | Preferência de publicidade recusada | atendimento funciona; nenhum cookie publicitário gerado pelo produto nem CAPI publicitário correspondente |
| AC-10 | Revogação após enfileirar, antes do envio | entrega suprimida; dados tratados conforme política; motivo visível sem expor conteúdo |
| AC-11 | Referência válida recebida no WA e confirmada | touch, contato e Deal vinculados na conta correta; clique isolado não dispara Lead |
| AC-12 | Token expirado, removido, encaminhado ou já ligado a outro contato | sem atribuição silenciosa; conflito/expiração ou fluxo manual; nenhuma leitura de CRM pelo token público |
| AC-13 | Sem telefone confiável, LID/grupo ou troca de chat durante leitura | nenhuma compra/vínculo em pessoa errada; confirmação e alternativa manual |
| AC-14 | Worker reinicia, dois workers executam, Meta responde timeout/429/5xx | registro durável; retries com mesma identidade; lease recuperável; falhas visíveis |
| AC-15 | Pixel/lista/mode muda após criação de entrega | retry conserva dataset/nome/valor/tempo originais; alteração não duplica receita |
| AC-16 | Cópia browser e server do mesmo evento em homologação, se utilizada | mesmo nome e ID no mesmo dataset; diagnóstico registra deduplicação; sem dois Leads para etapas diferentes |
| AC-17 | Meta aceita, rejeita ou evento expira | estados distintos; aceite não rotulado como atribuição; expirado não ganha horário novo |
| AC-18 | ERP fica indisponível e retorna | venda continua no CRM; Meta independente; mesmo pedido externo ou conciliação manual em timeout ambíguo |
| AC-19 | Mesmo webhook ERP chega duas vezes ou assinatura é inválida | um efeito para válido duplicado; inválido não atualiza financeiro; evento persistido antes do aceite |
| AC-20 | Estorno confirmado | receita líquida interna atualizada; histórico da compra preservado; sem Purchase negativo automático |
| AC-21 | Uso a 360 px, toque e teclado | criar/qualificar/mover/fechar sem arrastar; rótulos e feedback legíveis; foco utilizável |
| AC-22 | Chrome fecha ou a extensão perde compatibilidade | backend entrega fila existente; operador consegue continuar pelo painel |
| AC-23 | Mais de 2.000 contatos/500 cobranças | telas paginam e totais globais permanecem corretos; nenhum indicador usa amostra como total |
| AC-24 | Token revogado ou diagnóstico compartilhado | credencial deixa de funcionar; relatório não contém tokens, cookies, telefone bruto ou conversa |

Homologação externa obrigatória: testar WhatsApp real com conta autorizada, um dataset Meta de homologação e um ERP sandbox. Registrar versão da extensão/Chrome, versão Graph, cenários e resultados. Simulação é necessária para falhas e concorrência, mas não substitui esses testes. Não usar clientes reais como massa de teste sem necessidade e autorização adequadas.

## 6. Métricas e limites de interpretação

| Métrica | Definição operacional |
|---|---|
| Cliques de WhatsApp | cliques observados elegíveis na LP; não equivalem a mensagens enviadas |
| Contatos iniciados | contatos distintos com atendimento registrado; separar origem desconhecida |
| Conversão de oportunidades | Deals qualificados/abertos e ganhos/abertos por coorte de abertura; não dividir estados atuais misturando períodos |
| Pedidos confirmados | Purchase confirmada distinta, excluindo canceladas e identificando estornos |
| Receita bruta / líquida observada | somatório confirmado / confirmado menos estornos, por moeda e período |
| AOV | receita definida no relatório ÷ pedidos correspondentes; declarar tratamento de estorno e denominador zero |
| Recorrência | clientes com 2+ pedidos confirmados ÷ clientes compradores, na coorte/janela informada |
| Receita acumulada por cliente | histórico observado; não chamar de LTV preditivo |
| Cobertura de atribuição | oportunidades/compras conciliadas ÷ total elegível, com desconhecidas e conflitos separados |
| Entrega técnica | entregues ÷ enfileiradas por destino; separar suprimidas, expiradas e bloqueadas |
| ROAS atribuído | receita atribuída segundo modelo declarado ÷ gasto Ads compatível em conta, moeda, fuso e período |

ROAS não é ROI nem lucro. ROI/margem requerem custos, impostos, devoluções, frete e regras contábeis. LTV requer janela/coorte e, para projeção, método explícito. Médias observadas não provam que aumentar CPA será lucrativo. Enviar `value` e novas identidades de compra melhora a estrutura dos sinais, mas não garante disponibilidade de otimização por valor nem resultados.

Metas operacionais iniciais: persistência antes de qualquer envio; pelo menos 95% de entregas elegíveis tentadas em até 5 minutos em condições normais; fila atrasada sinalizada após 15 minutos; acompanhar falhas diariamente durante piloto por processo humano definido. Validar essas metas com teste de carga e infraestrutura escolhida antes de assumir SLA. Nenhuma rotina pessoal foi criada nesta revisão.

## 7. Roadmap por dependências e portas de saída

Não há prazo fechado: equipe, ERP, infraestrutura e acesso às contas ainda não foram definidos. Cada fase tem saída verificável e pode ser liberada por conta, com rollback funcional.

| Fase | Entregas | Dependências | Porta de saída |
|---|---|---|---|
| 0 — Contratos e base segura | confirmar piloto/ERP; baseline do protótipo; riscos; regra de venda; isolamento e credenciais | acesso de desenvolvimento e dados sintéticos | decisão de fonte de pagamento; plano de migração e homologação aprovado |
| 1 — Integridade comercial | migração para MongoDB, telefone canônico, dinheiro, idempotência, Deals/etapas e histórico | fase 0 | AC-01–08 e AC-20; migração ensaiada sem perda |
| 2 — Origem e sinais | LP/consentimento/ref, conciliação, catálogo, outbox e status Meta | fase 1; origem/dataset cadastrados | AC-09–17; fluxo real autorizado homologado |
| 3 — ERP e piloto MVP | adaptador único, inbox, conciliação, UX móvel e recuperação | contrato ERP, fases 1–2 | AC-18–24; piloto completo e operação documentada |
| 4 — BI e Ads | gastos de leitura, coortes, AOV, recorrência, ROAS com cobertura | qualidade e histórico de dados; permissões Ads | reconciliação por amostras; desconhecidos visíveis; definições acessíveis |
| 5 — Expansão | workspace/RBAC, PWA instalável, novos ERPs; avaliar canal WhatsApp oficial | validação do piloto e demanda | critérios específicos por capacidade; migração independente |

Se ERP ainda não tiver contrato, fases 1–2 podem resultar em **piloto técnico parcial**, com exportação manual de contingência; isso não encerra o MVP contratado com integração ERP. PWA instalável e equipe não devem ser anunciados antes de implementação/homologação.

## 8. Backlog implementável

Prioridades: P0 bloqueia piloto confiável; P1 compõe o MVP; P2 evolução. Esforço relativo S/M/L é estimativa de complexidade, não prazo. Cada tarefa termina com revisão do conteúdo/código existente e verificação de preservação de dados.

| ID / prioridade | Tarefa e ponto de partida | Dependências | Evidência de conclusão | Porte |
|---|---|---|---|---|
| T01 P0 | Inventariar ambiente/configuração sem expor segredos; reproduzir instalação a partir de `server/package.json`, Prisma e README | nenhuma | instruções executáveis; divergências do README corrigidas em futura entrega; baseline registrado | S |
| T02 P0 | Definir ERP, fonte de confirmação de pagamento, parcela/pedido, piloto individual/equipe e origem LP | nenhuma | contrato de negócio e amostras sanitizadas de API/erros/webhooks | M |
| T03 P0 | Auditar escopo por userId e endurecer sessão/Bearer, token hash/rotação, domínio e TLS | T01 | AC-01/24; nenhuma credencial em log; certificado validado | M |
| T21 P0 | Preparar MongoDB replica set, repositórios TypeScript com driver oficial, coleções/índices/validadores e substituir acessos Prisma/pg, incluindo autenticação e arquivos; ensaiar importação/corte | T01/02 | AC-03; todos os acessos migrados; origem preservada; plano de rollback após novas escritas | L |
| T04 P0 | Migrar telefone; substituir sufixo em `lib/crm.ts` e importação; impedir criação concorrente duplicada | T01/21 | relatório de colisões, revisão humana e AC-02/03 | M |
| T05 P0 | Migrar Purchase/Charge Float→centavos/moeda e definir estados/estorno | T02/21 | reconciliação financeira, AC-03/20; compatibilidade legada | M |
| T06 P0 | Serviço único de compra e chave idempotente para extensão, painel, cobranças e ERP | T04/05 | AC-04/05/06, incluindo requests paralelos e timeout | M |
| T07 P1 | Adicionar Pipeline/Stage/Deal/StageHistory; manter etiquetas atuais | T02/04 | constraints e transições; AC-07/08; zero receita em troca de etiqueta | L |
| T08 P1 | UI de oportunidades no painel e sidebar; confirmação de fechamento e pagamento | T06/07 | criar/qualificar/fechar em desktop e 360 px; AC-21 | L |
| T09 P0 | Implementar DomainEvent, outbox/worker, lease, retry e snapshot de destino | T06/07 | crash/concorrência testados; AC-14/15; métrica de idade de fila | L |
| T10 P1 | LP/origem pública, preferências, touch e referência segura | T02/03 | AC-09/12; endpoint público limitado; atendimento após recusa | M |
| T11 P1 | Captura assistida de ref e associação transacional; tela de conflito/manual | T04/07/10 | AC-10–13; referência não permite acesso; sem corpo de conversa persistido | L |
| T12 P0 | Adaptar `lib/meta.ts` ao catálogo/payload mínimo; preservar IDs antigos; validar Graph/action_source/campos | T09/11 | matriz oficial conferida; Meta homologado; AC-16/17; nenhuma promessa de atribuição | M |
| T13 P1 | Painel de entregas com filtro/retry seguro e situação independente da venda | T09/12 | pendente/bloqueado/suprimido/expirado visíveis; sem dados secretos | M |
| T14 P1 | Adaptador ERP com upsert/consulta; ExternalMapping e inbox assinada | T02/06/09 | AC-18/19; pedido no sandbox e timeout reconciliado | L |
| T15 P0 | Isolar adaptador WA, validar mensagens da ponte e background; tratar troca de chat/LID; reduzir permissões | T03 | AC-13/22/24 no WhatsApp real autorizado; caminho manual operacional | L |
| T16 P1 | Paginação e agregações globais no funil/cobranças; estados de sincronização | T07/08 | AC-23 com massa acima dos limites existentes | M |
| T17 P0 | Privacidade: finalidades, retenção, revogação, atendimento de direitos e saneamento de diagnóstico | T02/03/10 | política configurada e cenários AC-09/10/24; dados sensíveis bloqueados no adaptador | M |
| T18 P0 | Ensaiar backup/restauração/migração e rollback; homologar fluxo integrado | T03–17 | relatório por AC, falhas conhecidas e responsáveis; sem pendência crítica | L |
| T19 P2 | BI por coortes e leitura Ads; distinguir ROAS, receita, margem e cobertura | MVP estável | reconciliação de amostras e definições da seção 6 | L |
| T20 P2 | PWA instalável e estratégia de atualização/cache; avaliar equipe/canal oficial | decisão após piloto | critérios próprios; nenhum cache indevido de dados pessoais | L |

Caminho crítico inicial: T01/T02 → T21 → T04/T05/T06 → T07/T09 → T10/T11/T12 → T14/T18. T18 também depende de T21. Segurança, extensão e privacidade acompanham as fases e podem bloquear liberação. A ordem não autoriza iniciar desenvolvimento nesta revisão.

## 9. Plano de validação e liberação

1. **Serviços e banco:** testar identidade, dinheiro, transições, idempotência, outbox/inbox e isolamento com MongoDB de teste em replica set. Validar migração a partir de uma cópia controlada do PostgreSQL de origem. Não usar apenas mocks para índices únicos, transações e concorrência.
2. **Adaptadores simulados:** falhas de rede, aceite seguido de timeout, payload inválido, rate limit, credencial revogada e retries. Preservar IDs e valores nas tentativas.
3. **Fluxo de interface:** LP→ref→conversa→Deal→qualificação→compra→status; recusa, celular manual, troca de chat e conflito de versão.
4. **Homologação externa:** WhatsApp autorizado, dataset separado e ERP sandbox; confirmar payloads e documentos externos, registrar diagnósticos redigidos. Testar deduplicação browser/server apenas quando houver emissão dupla no produto.
5. **Piloto restrito:** habilitar por conta, observar fila e comparar compras CRM/ERP/Meta recebidas, distinguindo recebimento de atribuição; rollback desabilita adaptadores e captura sem apagar vendas.

Definition of Done: critérios aplicáveis passam; documentação reflete comportamento final; migração tem plano de reversão; dados reconciliados; segredos protegidos; métricas/alertas do produto funcionam; falhas recuperáveis têm procedimento; acessos externos necessários foram homologados. Não declarar MVP completo enquanto conector ERP ou validação real obrigatória estiverem ausentes.

## 10. Decisões ainda necessárias

- Qual ERP/versão, contrato e sandbox? Exige SKU, CPF, endereço, nota, estoque ou itens?
- A confirmação de pagamento nasce no CRM, ERP ou provedor? Como tratar parcelas e pagamentos parciais?
- Piloto individual ou equipe com carteira compartilhada? Quem pode configurar pixel e reprocessar?
- Quais domínio/LP, conta/dataset Meta e modelo de atribuição serão homologados?
- Quem é controlador, quais dados são sensíveis na operação e qual política de retenção será adotada?

Enquanto faltarem essas respostas, os contratos propostos permitem preparar a implementação interna, mas não concluir integrações reais nem assumir comportamentos do ERP. Nenhum conteúdo foi salvo no Notion; nenhuma rotina ou memória foi criada.
