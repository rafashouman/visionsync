# VisionSync — Roadmap Consolidado

Versão 1.4 · 9 de novembro de 2026 · Planejamento após a primeira etapa.

## 1. Resultado desta etapa

A primeira etapa consolida o CRM local, a extensão empacotável, MongoDB, correções de integridade, consultas paginadas e uma base visual com quatro temas. O escuro original continua sendo o padrão. Os três temas adicionais são alternativas do mesmo produto, com navegação, dados e funcionalidades compartilhados.

Este documento orienta a sequência de trabalho. A [especificação de produto](02-produto-mvp-roadmap.md) mantém os critérios AC-01 a AC-24 e as tarefas T01 a T21. O [guia de desenvolvimento](04-documento-de-desenvolvimento.md) descreve a aplicação em uso; o [estado da implementação](03-estado-da-implementacao.md) registra evidências de verificação.

## 2. Etapa 1 — Base funcional e visual

| Entrega | Situação | Evidência esperada |
|---|---|---|
| Painel Next.js e persistência MongoDB | Implementados localmente | Build, tipos e testes de relações/isolamento |
| Extensão MV3 e instalação pelo painel | Empacotáveis | Build da extensão e testes de política |
| Identidade por telefone completo e tokens protegidos | Implementados | Regressões de identidade, expiração e revogação |
| Compras idempotentes e baixa de cobranças | Implementadas | Repetição e concorrência sem duplicação |
| Paginação e totais globais | Implementados nas telas atuais | Massa superior a 2.000 contatos/500 cobranças |
| Acessibilidade principal e movimentação sem arraste | Implementadas na ficha/kanban | Teclado, foco e navegação conferidos |
| Quatro temas e preferência persistente | Implementados | Seleção, recarga e navegação nos quatro temas |
| Documentação de desenvolvimento e roadmap | Consolidados | Guias alinhados ao código e às pendências |

Fechamento desta etapa significa entrega local verificada, não MVP comercial completo. A identidade visual e o modelo atual de conta individual são preservados.

## 3. Próximas etapas

Os portes P/M/G indicam complexidade relativa, não prazo. Não há calendário fechado sem capacidade da equipe, infraestrutura e contratos externos definidos.

| Etapa | Objetivo | Entregas principais | Dependências | Saída verificável | Porte |
|---|---|---|---|---|---|
| 2 — Preparação para piloto | Tornar a base segura e recuperável com dados reais | Revisão de autenticação/CSRF e escopo, plano de persistência/driver, conciliação financeira, backup/restauração, migração ensaiada e carga | Cópia controlada do legado, ambiente de homologação e definição do piloto | Dados reconciliados, recuperação ensaiada e pendências críticas resolvidas | G |
| 3 — Oportunidades comerciais | Separar tentativa de venda de etiqueta e compra | Pipeline/Stage/Deal, histórico, concorrência e confirmação de fechamento/pagamento | Regras de negócio e financeiro da etapa 2 | Criar, qualificar, mover e fechar sem duplicar receita; operação por teclado/celular | G |
| 4 — Origem e integrações duráveis | Rastrear origem e entregar sinais elegíveis | Preferências/consentimento, LP/ref, associação assistida, DomainEvent, outbox, retry e painel de entregas | Origem/dataset definidos, regras de finalidade e etapas 2–3 | Revogação, conflitos, crash, concorrência e reenvio testados; Meta homologada | G |
| 5 — ERP e piloto integrado | Conectar um ERP com conciliação | Adaptador, mapeamento, inbox assinada, consulta de duplicidade e tratamento de retorno | ERP/versão/contrato/sandbox, fonte de pagamento e etapas anteriores | Venda confirmada conciliada entre CRM e ERP; falhas recuperáveis | G |
| 6 — Métricas e evolução | Medir a operação com definições e cobertura | Coortes, recorrência, receita, leitura Ads e indicadores de qualidade | Histórico confiável e permissões de leitura | Amostras reconciliadas; ausência de dados e estimativas identificadas | G |
| 7 — Expansão | Atender novas necessidades comprovadas | Workspace/RBAC, novos ERPs, PWA e avaliação de canal oficial WhatsApp | Piloto validado e decisão de produto | Critérios próprios para cada capacidade, sem comprometer a base | Variável |

Se a operação precisar de equipe compartilhada já no piloto, antecipar Workspace/RBAC. Se não houver contrato ERP, admitir piloto técnico parcial com exportação manual identificada; não declarar integração concluída.

## 4. Backlog prioritário da próxima etapa

| ID | Prioridade | Trabalho | Impacto | Esforço | Critério de conclusão |
|---|---|---|---|---|---|
| R01 | P0 | Definir operação piloto, pagamento, parcelas e necessidade de equipe | Evitar modelagem comercial ambígua | M | Decisões registradas e casos de exemplo |
| R02 | P0 | Revisar sessão, CSRF, isolamento, limites e erros de APIs | Reduzir risco de acesso indevido | M | Testes por conta e mutação; respostas sem segredos |
| R03 | P0 | Definir manutenção da camada de persistência e migração para driver oficial | Sustentar MongoDB e suas transações | G | Repositórios/contratos testados; plano de reversão |
| R04 | P0 | Reconciliar dados financeiros antigos e planejar backfill de centavos/moeda | Evitar divergência de receita | M | Relatório antes/depois; nenhuma correção silenciosa |
| R05 | P0 | Ensaiar backup, restauração e migração do legado | Recuperar a operação sem perda | M/G | Restauração comprovada em ambiente separado |
| R06 | P1 | Medir consultas, índices e interface com carga realista | Sustentar crescimento | M | Latências e gargalos registrados; correções verificadas |
| R07 | P1 | Completar auditoria de acessibilidade e cobertura dos temas | Manter uso consistente de todas as telas | M | Formulários, modais, erros, mídia, zoom e teclado revisados |
| R08 | P1 | Preparar homologação de extensão no WhatsApp autorizado | Validar adaptação à interface real | M/G | Troca de conversa, LID, mídia e contingência verificados |

P0 bloqueia piloto confiável; P1 completa preparação e qualidade. R03 não autoriza atualização cega de ORM nem migração destrutiva. Novos serviços/dependências exigem necessidade concreta.

## 5. Continuidade da fase visual

Os quatro temas são a base visual inicial. Manter o escuro original intacto, com alterações apenas quando solicitadas. Componentes novos devem usar tokens semânticos e funcionar nos quatro temas; evitar cores escuras fixas em painéis, campos e menus.

Na próxima revisão visual: ampliar cobertura de estados vazios/erros, modais secundários, mídia, tabelas longas, zoom e alto contraste. Só considerar sincronização de preferência por conta se houver necessidade de produto; a entrega atual é por navegador. PWA e temas da extensão não fazem parte desta entrega.

## 6. Portas de liberação

1. **Desenvolvimento local:** tipos, lint, testes e build aprovados; interface conferida; documentação atualizada.
2. **Homologação:** configuração segura, dados sintéticos/controlados, integrações desativadas até validação e plano de recuperação.
3. **Piloto restrito:** migração reconciliada, responsáveis e contingência definidos; testes externos autorizados concluídos.
4. **Produção ampliada:** observação do piloto, correções prioritárias concluídas e capacidade de suporte demonstrada.

Nenhuma dessas portas é cumprida apenas pela existência do código ou por uma resposta de aceite de API. Não prometer atribuição, ROAS, lucro ou disponibilidade de canais sem validação pertinente.

## 7. Decisões em aberto

- Qual conta/negócio será o piloto e quem operará a aplicação?
- O pagamento é confirmado no CRM, no ERP ou em um provedor? Haverá parcelas ou pagamentos parciais?
- Qual ERP, versão, contrato e sandbox serão usados? Exige SKU, dados fiscais ou estoque?
- Quais domínio/LP, dataset e finalidade de mensuração serão homologados?
- A operação exige equipe compartilhada? Quais papéis e permissões?
- Qual ambiente de hospedagem, procedimento de backup e responsabilidade operacional serão adotados?

O roadmap registra essas dependências sem criar serviços, rotinas pessoais ou integrações externas automaticamente. O trabalho seguinte deve partir do código e dos documentos atuais, preservando os dados e a identidade do produto.
