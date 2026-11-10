# VisionSync — Documento de Desenvolvimento

Versão 1.4 · 9 de novembro de 2026 · Fechamento da primeira etapa de desenvolvimento e da base visual.

## 1. Objetivo

O VisionSync organiza contatos, atendimento e vendas associados ao WhatsApp. O painel web concentra a operação e oferece uma alternativa à extensão; a extensão Chrome facilita o uso do CRM durante o atendimento no WhatsApp Web.

Esta etapa entrega uma base funcional local, com persistência MongoDB, melhorias de integridade e navegação e quatro temas visuais. Não representa o MVP completo com oportunidades exclusivas, atribuição de campanhas, fila durável, ERP ou BI.

Este é o guia consolidado para desenvolver e manter a aplicação atual. A [especificação de arquitetura](01-arquitetura-e-diretrizes.md) preserva os contratos de destino e o inventário histórico. O [roadmap consolidado](05-roadmap.md) organiza o próximo trabalho. O [estado da implementação](03-estado-da-implementacao.md) registra o alcance das verificações.

## 2. Princípios de desenvolvimento

- Evoluir o produto existente e preservar dados, identidade visual e funcionalidades úteis.
- Usar Next.js, MongoDB e TypeScript como base. Manter JavaScript no adaptador legado quando sua conversão não trouxer benefício concreto.
- Concentrar autorização, validação e regras comerciais no servidor. Dados da extensão e da página do WhatsApp são entradas não confiáveis.
- Reaproveitar serviços de domínio entre painel e extensão. Manter compatibilidade de contratos durante mudanças incrementais.
- Separar operação comercial de entrega a integrações: uma indisponibilidade externa não deve apagar uma venda registrada.
- Não apresentar planos como funcionalidades entregues. Nenhum resultado financeiro ou de anúncios é garantido pela existência do sistema.

## 3. Stack em uso

| Camada | Implementação atual | Diretriz |
|---|---|---|
| Aplicação | Next.js 16.4.5, App Router e React 19.2.4 | Leitura inicial no servidor quando aplicável; cliente para interação |
| Linguagem | TypeScript estrito | Validação em execução com Zod; tipos não substituem autorização |
| Dados | MongoDB em replica set, Prisma 6.19 | Preservar compatibilidade; avaliar driver oficial em fase própria |
| Identidade | NextAuth no painel e Bearer na extensão | Conta derivada da autenticação, nunca confiada ao corpo da requisição |
| Interface | CSS próprio, tokens e estilos compartilhados | Não adicionar Tailwind ou biblioteca de componentes sem necessidade |
| Extensão | Chrome MV3; background/popup TypeScript; adaptador JavaScript | Empacotar lógica, restringir origens e manter caminho manual |
| Testes | Node Test Runner, tsx e MongoDB temporário | Exercitar relações, índices, transações e concorrência reais |

Os valores de versão registram esta entrega; não são orientação para atualização automática de dependências.

## 4. Estrutura do repositório

| Caminho | Responsabilidade |
|---|---|
| `server/src/app` | Rotas web, layouts e Route Handlers |
| `server/src/app/dashboard` | Telas autenticadas, carregamento e recuperação de erro |
| `server/src/components` | Componentes interativos e visuais compartilhados |
| `server/src/lib` | Autorização, consultas, regras comerciais e contratos |
| `server/prisma/schema.prisma` | Modelos da persistência atual |
| `server/scripts` | Preparação explícita do banco, índices, migração e demonstração |
| `server/tests` | Regressões de banco, autenticação, financeiro e temas |
| `extension/src` | Background, popup e política de comunicação |
| `extension/content.js`, `page-bridge.js` | Adaptador legado do WhatsApp |
| `docs` | Especificações, estado atual e planejamento |

## 5. Módulos entregues

| Módulo | Comportamento atual | Limite conhecido |
|---|---|---|
| Acesso | Cadastro, login, sessão e limitação de tentativas | Equipe/RBAC não implementados |
| Contatos | Busca, cadastro, dados, notas e histórico; cursor de 20 resultados | Identidade continua por conta individual |
| Funil | Listas/etiquetas, busca no servidor e 100 cards por página/coluna | Lista não é etapa exclusiva de Deal |
| Cobranças | Filtros, páginas de 500, resumo global e baixa transacional | Estornos e reconciliação do histórico ainda pendentes |
| Compras | Idempotência, centavos para novas operações e histórico em lotes de 50 | Legado `amount` preservado |
| Organização | Painel do dia, agenda, pendências e lembretes | Não equivale a motor autônomo de envios |
| Mensagens | Respostas rápidas, mídia e sequências de apoio | Envio humano; homologação WhatsApp real permanece necessária |
| Extensão | Pacote MV3, configuração, token e acesso por origem | Não é integração oficial do WhatsApp |
| Integrações | Configuração Meta e envio legado protegido por configuração | Sem outbox durável, ERP ou homologação real nesta etapa |
| Aparência | Escuro original, escuro minimalista, claro e claro minimalista | Preferência neste navegador; não é preferência sincronizada de conta |

## 6. Regras essenciais de dados

Toda consulta e escrita comercial deve manter o escopo de `userId`. Telefones são normalizados integralmente, com código do país e unicidade por conta. Não unir pessoas pelo final do número.

Compras usam uma chave idempotente por operação: repetir a mesma intenção deve retornar a mesma compra; uma nova compra legítima recebe outra chave. A baixa de cobrança cria e vincula a compra na mesma transação, com tratamento de conflitos transitórios. Quatro baixas concorrentes são cobertas por teste de regressão.

Novas compras e cobranças persistem centavos inteiros e BRL. `amount` continua como compatibilidade para os clientes e registros antigos. As leituras de cobrança preferem `amountMinor`; quando ausente, usam o valor legado. Não executar backfill, arredondar o histórico ou remover Float sem reconciliação e plano de reversão.

Contagens globais não são calculadas a partir dos cards visíveis. Buscas e filtros precedem paginação. A timeline informa seus limites: atividades recentes não devem parecer um histórico integral.

## 7. Arquitetura de interface e acessibilidade

As páginas iniciais de contatos e funil consultam o servidor e entregam os dados ao componente interativo. A ficha é carregada sob demanda com fallback local; a navegação tem estados de carregamento e recuperação de erro. Não usar cache compartilhada de dados privados sem chave e política apropriadas.

Novos componentes devem ter nomes acessíveis, foco visível, estados de erro/carregamento e caminho por teclado. A ficha atual identifica o diálogo, contém e restaura o foco, permite navegação entre abas por teclado e protege alterações não salvas. O kanban permite mover pelo seletor, além de arrastar.

Manter consistência de terminologia, datas de Brasília, formatação monetária e feedback de operação. O uso de uma integração não deve aparecer como concluído quando só a gravação local foi confirmada.

## 8. Sistema visual e temas

| Tema | Identificador | Proposta |
|---|---|---|
| Escuro original | `dark-original` | Padrão; azul profundo, vinho, gradientes e brilho existentes |
| Escuro minimalista | `dark-minimal` | Grafite, superfícies planas e linhas neutras |
| Claro | `light` | Superfícies claras, profundidade suave e destaques da marca |
| Claro minimalista | `light-minimal` | Branco e neutros, linhas discretas e pouca decoração |

O seletor fica em **Configurações → Aparência** e também no detalhe Aparência de login/cadastro. A escolha muda a interface imediatamente e grava apenas o identificador no cookie `visionsync-theme`, com duração de um ano. O servidor valida esse valor e entrega o atributo `data-theme` do HTML antes da hidratação. Valor ausente/inválido retorna ao escuro original. Não há escolha automática baseada no sistema operacional.

O cookie é uma preferência visual, não uma credencial. Ele não altera permissões, dados da conta ou configuração da extensão. Os temas abrangem painel, formulários, fichas, menus e autenticação; o visual inserido no WhatsApp pela extensão continua independente.

As cores e superfícies ficam em `globals.css`; o catálogo e a validação em `lib/themes.ts`; estado/seleção em `ThemeProvider` e `ThemePicker`. Minimalistas retiram brilhos, gradientes e sombras decorativas. Novos componentes devem consumir tokens, inclusive em menus e estados semânticos, em vez de fixar cores escuras.

O cookie no layout raiz torna as páginas web renderizadas por requisição. É uma escolha deliberada para aplicar a preferência já no HTML sem lampejo de outro tema. Se futuramente houver páginas públicas estáticas de marketing, isolar essa preferência em layouts apropriados antes de ampliar a aplicação.

## 9. Ambiente local e comandos

Requisitos: Node.js 22.14 ou superior, dependências instaladas e MongoDB em replica set. Copiar e preencher o exemplo de ambiente conforme o README; não versionar nem expor segredos.

| Ação | Comando na raiz |
|---|---|
| Instalar dependências | `npm install` |
| Gerar cliente de dados | `npm run db:generate` |
| Preparar replica set/schema/índices explicitamente | `npm run db:prepare --workspace @visionsync/web` |
| Iniciar desenvolvimento | `npm run dev` |
| Verificar tipos | `npm run typecheck` |
| Revisar código do painel | `npm run lint --workspace @visionsync/web` |
| Executar testes isolados | `npm test` |
| Gerar produção e extensão | `npm run build` |
| Iniciar produção local | `npm run start --workspace @visionsync/web` |

`dev` não aplica schema nem cria demonstração. `db:prepare` é uma operação explícita e deve ser executada apenas sobre um destino revisado. Em um banco administrado, revisar backup e destino antes de `db:push` e `db:indexes`. Nenhum desses comandos substitui migração de dados.

A demonstração usa `npm exec --workspace @visionsync/web -- tsx scripts/preview.ts` após o build. Ela cria MongoDB temporário, contas fictícias e desativa integrações externas. Não misturar esse ambiente com dados reais.

## 10. Qualidade e critérios de conclusão

Antes de encerrar uma alteração: conferir o conteúdo atual; preservar o trabalho existente; executar verificações proporcionais; reler documentos alterados; registrar comportamento entregue e pendências. Mudanças de dados exigem testes com isolamento, concorrência e compatibilidade; mudanças visuais exigem conferência dos quatro temas, teclado, desktop e celular.

Critérios da primeira etapa: build/tipos/lint/testes aprovados; consultas paginadas com totais globais; gravações financeiras protegidas; quatro temas selecionáveis e persistentes; documentação consolidada; nenhuma integração externa apresentada como homologada sem evidência.

O fechamento local da etapa não aprova produção. Driver direto, migração de dados reais, backup/restauração, homologação externa e itens de segurança pendentes seguem no roadmap. Não houve deploy, publicação em loja ou alteração do banco real neste fechamento.

## 11. Registro de validação do fechamento

Em 09/11/2026: tipos, lint, testes e build aprovados. Paletas alternativas passaram nas verificações dos pares de texto e bordas de campos selecionados; conferência visual incluiu os quatro temas, persistência após recarga, seleção por teclado, ficha e login no celular. O original foi restaurado ao terminar os testes. A cobertura exata, as capturas e os limites estão no estado da implementação. Não houve acesso a dados reais nem publicação.
