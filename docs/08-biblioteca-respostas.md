# Biblioteca de respostas — plugin 0.22.0

## Gravação e revisão

No site, abra Respostas rápidas → Nova → Áudio → Gravar agora. Autorize o microfone. O gravador permite até três minutos e 4 MB; use Parar e ouvir para revisar. Regravar ou Descartar não altera a resposta já salva. O microfone é liberado ao parar, descartar ou fechar o editor, inclusive quando uma permissão pendente é concedida depois do fechamento.

Usar gravação envia o áudio para conversão em OGG/Opus. Depois, Salvar cria ou atualiza a resposta na biblioteca. A opção de nota de voz fica marcada para a gravação convertida e pode ser desmarcada; o envio como nota de voz continua dependendo do conector do servidor e das configurações da fila. Não há envio ao WhatsApp durante gravação, conversão ou prévia.

Se a conversão falhar, a gravação permanece disponível para ouvir, baixar, descartar ou tentar novamente. O editor impede salvar enquanto houver gravação pendente de aceitação. Upload de arquivos OGG e MP3 continua disponível.

### Preparação do servidor

Instale o [FFmpeg](https://ffmpeg.org/download.html) com o encoder `libopus`. No Ubuntu, o pacote normalmente pode ser instalado com:

```sh
sudo apt update
sudo apt install ffmpeg
ffmpeg -version
ffmpeg -encoders
```

Confirme que `libopus` aparece na lista de encoders. Por padrão, o aplicativo executa `ffmpeg` pelo PATH. Quando necessário, informe o caminho absoluto em `server/.env` ou nas variáveis do serviço:

```dotenv
FFMPEG_PATH="/usr/bin/ffmpeg"
```

No Windows, use o caminho do executável instalado, por exemplo `C:/ferramentas/ffmpeg/bin/ffmpeg.exe`. Reinicie o aplicativo depois da configuração. O processo do aplicativo precisa poder executar esse binário e criar arquivos no diretório temporário do sistema.

A conversão exige sessão e origem válidas, limita corpo, frequência, duração e tempo de processamento, executa uma conversão por processo de cada vez e limpa os arquivos temporários. Não usa shell nem aceita URLs como entrada. O binário não é distribuído com o projeto.

## Organização

- Em Minha organização, sem filtros ativos, arraste respostas dentro de uma categoria ou use as setas para mudar a ordem.
- Arraste os títulos das categorias ou use suas setas para ordenar os grupos. Sem categoria permanece por último.
- Nome e cor da categoria altera todas as respostas daquele grupo, somente na conta atual. Um nome já utilizado por outro grupo é recusado para evitar mesclagem acidental.
- Nome e Mais usadas oferecem ordenações de consulta sem alterar a ordem manual.
- A ordem e a cor salvas aparecem no plugin após a sincronização. A busca por atalho continua priorizando favoritos e uso, como antes.
- Atalhos repetidos são apontados no editor; a restrição de unicidade do servidor continua sendo a proteção definitiva.

As categorias existentes são reconhecidas sem backfill. Seus metadados são persistidos quando organizadas ou editadas.

## Prévias

O botão de olho abre uma prévia completa. O editor também mostra uma simulação com nome fictício de cliente e nome do atendente ajustáveis. Texto e legendas substituem as variáveis; áudio, imagem e vídeo podem ser revisados; documentos mantêm o download. Sequências mostram os intervalos e as mídias referenciadas. Editar uma sequência preserva as referências aos arquivos, inclusive nos passos sem texto.

O tipo Contato mostra nome e telefone: o plugin atual compartilha esses dados como texto, sem prometer cartão nativo.

## Atualização

Atualize servidor e extensão juntos. A coleção `quick_reply_categories` e seu índice único por conta/nome são declarados no schema Prisma:

```sh
npm run db:generate
npm run db:push
npm run db:indexes
npm run build
```

Revise o banco de destino e o backup antes de aplicar o schema em produção. Reinicie o aplicativo e recarregue o plugin e o WhatsApp Web. A nova extensão é a versão 0.22.0.

## Verificação

Os testes isolados cobrem validação de ordenação, cores, nomes de categoria, preservação de passos com mídia, variáveis da prévia e assinaturas de gravação. O teste de integração com MongoDB cobre persistência, rejeição de IDs de outra conta e renomeação isolada. Gravação real, conversão com FFmpeg, organização persistida no banco e envio no WhatsApp precisam ser conferidos em ambiente com esses recursos disponíveis.
