# Acesso e recuperação de senha

## Desenvolvimento local

Na raiz do projeto, execute `npm run dev`. O comando gera o cliente Prisma, prepara o MongoDB local como Replica Set, atualiza os índices, gera a extensão e inicia o site na porta 3001. É necessário ter o binário `mongod.exe` instalado ou disponível no cache usado pelo projeto.

Abra `http://localhost:3001`. Para acesso pela rede, `192.168.0.2` está autorizado no Next.js; outros IPs podem ser informados em `DEV_ALLOWED_ORIGINS`, separados por vírgula, sem protocolo ou porta. Reinicie o servidor após alterar essa variável. O endpoint de HMR `/_next/hmr` fica fora da proteção de login, como os demais recursos internos do Next.js. O erro do WebSocket refere-se à atualização de desenvolvimento; falhas no banco ou na autenticação devem ser verificadas separadamente no terminal.

## Produção

Configure `AUTH_URL` e `NEXTAUTH_URL` com `https://visionsync.nexusync.online`. Mantenha os secrets existentes. A proteção de origem das operações do WhatsApp usa essa URL pública, em vez da URL interna HTTP vista pelo Next.js atrás do proxy. O proxy deve sobrescrever os headers de host encaminhados e restringir o acesso direto ao processo Node.

Depois de instalar dependências, execute `npm run db:generate`, `npm run db:push`, `npm run db:indexes` e `npm run build`, e reinicie o aplicativo pelo gerenciador de processos usado no servidor. A preparação automática de MongoDB em `npm run dev` destina-se ao desenvolvimento; mantenha o banco persistente já configurado em produção.

## Email de recuperação

Configure no ambiente do servidor:

```dotenv
AUTH_URL="https://visionsync.nexusync.online"
NEXTAUTH_URL="https://visionsync.nexusync.online"
RESEND_API_KEY="sua-chave-privada"
AUTH_EMAIL_FROM="VisionSync <acesso@seu-dominio-verificado.com>"
```

O domínio remetente deve estar verificado no Resend. Reinicie o processo após configurar. Sem credenciais de envio, a tela informa que a recuperação está indisponível. Não são exibidos links de recuperação nos logs ou respostas da API.

O link expira em 30 minutos e só funciona uma vez. O banco armazena apenas o hash do token. A redefinição exige duas senhas iguais de pelo menos 8 caracteres e invalida as sessões anteriores, os demais links de recuperação e o token do plugin. Após redefinir, entre novamente e gere outro token da extensão em Configurações.

## Fluxos para conferir após publicar

- Cadastro com 7 caracteres deve falhar; com 8 e confirmação igual deve criar a conta e abrir o login com aviso de sucesso.
- Copiar ou arrastar a primeira senha e colar ou soltar conteúdo na confirmação deve ser bloqueado.
- Login normal deve abrir a Home; no primeiro acesso, o guia aparece no Painel do dia e pode ser reaberto em Guia de primeiro acesso.
- Esqueci minha senha deve enviar email para uma conta de teste; um link usado ou expirado não deve permitir nova alteração.
- No plugin 0.20.6, + Nova deve abrir Respostas rápidas no site com os tipos abertos, inclusive após login se a sessão tiver expirado.
- Salvar as configurações do WhatsApp deve funcionar pela origem pública correta; uma origem externa deve continuar recebendo 403.

Recarregue a extensão em `chrome://extensions` e o WhatsApp Web após atualizar a pasta instalada. O ZIP disponível na página Plugin WhatsApp também é atualizado pelo build.
