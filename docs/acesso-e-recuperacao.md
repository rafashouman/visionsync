# Acesso e recuperação de senha

## Desenvolvimento local

Na raiz do projeto, execute `npm run dev`. O comando gera o cliente Prisma, prepara o MongoDB local como Replica Set, atualiza os índices, gera a extensão e inicia o site na porta 3001. É necessário ter o binário `mongod.exe` instalado ou disponível no cache usado pelo projeto.

Abra `http://localhost:3001`. Para acesso pela rede, `192.168.0.2` está autorizado no Next.js; outros IPs podem ser informados em `DEV_ALLOWED_ORIGINS`, separados por vírgula, sem protocolo ou porta. Reinicie o servidor após alterar essa variável. O endpoint de HMR `/_next/hmr` fica fora da proteção de login, como os demais recursos internos do Next.js. O erro do WebSocket refere-se à atualização de desenvolvimento; falhas no banco ou na autenticação devem ser verificadas separadamente no terminal.

## Produção

O cadastro é público: novos usuários informam nome e email e recebem um link para definir sua própria senha. O cadastro não aceita senha fornecida antes da confirmação do email. Contas já existentes continuam com suas senhas. Cada usuário mantém dados separados: não há carteira compartilhada de equipe. A variável antiga `ALLOWED_USER_EMAILS` não é mais utilizada.

Configure `AUTH_URL` e `NEXTAUTH_URL` com `https://visionsync.nexusync.online`. Mantenha os secrets existentes. A proteção de origem das operações do WhatsApp usa essa URL pública, em vez da URL interna HTTP vista pelo Next.js atrás do proxy. O proxy deve sobrescrever os headers de host encaminhados e restringir o acesso direto ao processo Node.

Depois de instalar dependências, execute `npm run db:generate`, `npm run db:push`, `npm run db:indexes` e `npm run build`, e reinicie o aplicativo pelo gerenciador de processos usado no servidor. A preparação automática de MongoDB em `npm run dev` destina-se ao desenvolvimento; mantenha o banco persistente já configurado em produção.

## Email de ativação e recuperação

Configure no ambiente do servidor:

```dotenv
AUTH_URL="https://visionsync.nexusync.online"
NEXTAUTH_URL="https://visionsync.nexusync.online"
SMTP_HOST="smtp.hostinger.com"
SMTP_PORT="587"
SMTP_USER="email@seu-dominio.com"
SMTP_PASSWORD="senha-da-caixa-postal"
SMTP_FROM="email@seu-dominio.com"
```

Use uma caixa postal existente da Hostinger e sua senha SMTP; normalmente o remetente deve ser a própria caixa ou um endereço autorizado pelo provedor. A porta 587 exige STARTTLS; a 465 usa TLS direto. A hospedagem do aplicativo precisa permitir conexões SMTP de saída. As variáveis substituem `RESEND_API_KEY` e `AUTH_EMAIL_FROM` para os dois fluxos. Configure-as no ambiente privado do processo do servidor e reinicie-o; não coloque a senha no código nem a compartilhe. Sem configuração completa, cadastro e recuperação ficam indisponíveis. Não são exibidos links de recuperação nos logs ou respostas da API.

O link expira em 30 minutos e só funciona uma vez. O banco armazena apenas o hash do token. A redefinição exige duas senhas iguais de pelo menos 8 caracteres e invalida as sessões anteriores, os demais links de recuperação e o token do plugin. Após redefinir, entre novamente e gere outro token da extensão em Configurações.

## Fluxos para conferir após publicar

- Cadastro deve enviar link por email; sem ele não é possível definir a senha. Sete caracteres devem falhar e oito com confirmação igual devem funcionar.
- Copiar ou arrastar a primeira senha e colar ou soltar conteúdo na confirmação deve ser bloqueado.
- Login normal deve abrir a Home; no primeiro acesso, o guia aparece no Painel do dia e pode ser reaberto em Guia de primeiro acesso.
- Esqueci minha senha deve enviar email para uma conta de teste; um link usado ou expirado não deve permitir nova alteração.
- No plugin 0.20.6, + Nova deve abrir Respostas rápidas no site com os tipos abertos, inclusive após login se a sessão tiver expirado.
- Salvar as configurações do WhatsApp deve funcionar pela origem pública correta; uma origem externa deve continuar recebendo 403.

Recarregue a extensão em `chrome://extensions` e o WhatsApp Web após atualizar a pasta instalada. O ZIP disponível na página Plugin WhatsApp também é atualizado pelo build.
