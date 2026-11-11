import { LoginForm } from "@/components/login-form"

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ cadastro?: string; senha?: string; respostas?: string }> }) {
  const query = await searchParams
  const notice = query.cadastro === "sucesso" ? "Confira seu email para confirmar o acesso e definir sua senha." : query.senha === "redefinida" ? "Senha atualizada! Entre com sua nova senha." : ""
  return <LoginForm notice={notice} replies={query.respostas} />
}
