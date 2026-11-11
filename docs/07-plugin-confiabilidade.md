# Plugin 0.21.0 — modos de envio e diagnóstico

Primeira etapa do plano de aperfeiçoamento do plugin. Não inclui os futuros fluxos condicionais, workspace de equipes ou assistente de IA.

## Comportamento para quem atende

- Em Respostas rápidas, escolha **Preparar para revisão** ou **Enviar agora**. A barra de favoritos também mostra o modo atual e permite alterná-lo. A preferência existente é preservada.
- Preparar texto ou arquivo permite revisar no WhatsApp. Sequências não executam nesse modo. Notas de voz pelo conector ficam aguardando aprovação no servidor.
- Enviar agora solicita o envio na conversa atual. Se já houver um rascunho, a operação para antes de acrescentar outra mensagem ou enviar os dois textos juntos.
- Trocar de conversa interrompe os próximos passos. O destinatário é verificado novamente antes do clique de envio.
- O painel mantém o estado da última operação. **Solicitado** não significa **entregue**. Entrega e leitura só aparecem a partir dos estados informados pelo conector.
- Uma nota de voz colocada na fila não conclui o lembrete nem libera o próximo passo da sequência. Acompanhe e aprove pela página Envios no servidor.
- Cliques repetidos na mesma nota de voz e destinatário reutilizam a solicitação durante a vida desta aba. Para uma nova transmissão intencional, use **Preparar outro envio**, depois de conferir a conversa e a fila. Essa proteção em memória não sobrevive ao recarregamento da aba.
- Lembretes do navegador avisam no horário e dependem da ação do atendente. A execução no servidor é um fluxo separado, sujeito às configurações e à pausa da fila.

## Diagnóstico

No ícone do plugin, clique em **Testar conexão**. O relatório verifica configuração, permissão de acesso, CRM, vencimento do token, abas do WhatsApp, resposta da ponte, versão carregada, última sincronização da biblioteca e estado do conector do servidor.

O conector pode estar desligado sem impedir respostas comuns pelo navegador. A indicação de ponte respondendo confirma comunicação com o adaptador; não garante que todas as funções do WhatsApp estejam compatíveis.

**Copiar diagnóstico seguro** usa uma lista explícita de campos permitidos. O relatório não inclui token, URL configurada, QR, nomes, telefones, conteúdo de mensagens ou identidade do processo de envio. A coleta começa pelo botão; não envia relatórios automaticamente.

## Biblioteca

As respostas são atualizadas ao retornar à janela do WhatsApp e a cada minuto enquanto a página está visível. O botão **Atualizar respostas** oferece atualização manual. Falhas preservam a biblioteca anterior. A criação de novas respostas continua no site com os tipos abertos, conforme solicitado.

## Atualização e verificação

Publique o servidor e atualize o plugin juntos. O diagnóstico usa `GET /api/crm/diagnostics` com token; a consulta de um envio usa `GET /api/crm/quick-replies/jobs/:id`, limitada à conta e aos envios de resposta rápida. Nenhum desses endpoints administra a conexão.

Execute `npm run extension:build`, recarregue a extensão em `chrome://extensions` e recarregue o WhatsApp Web. ZIP, CRX e pasta instalável são gerados pelo build.

Os testes isolados cobrem modos de revisão/envio, troca de conversa, preservação de rascunhos, reutilização da solicitação, estados de fila/entrega e descarte de dados privados do diagnóstico. O teste com MongoDB inclui isolamento de conta e respostas sem dados privados; precisa de um ambiente que permita a conexão ao banco temporário. Homologação visual e envio real continuam necessários antes de ampliar o piloto.
