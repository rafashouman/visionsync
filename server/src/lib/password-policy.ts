import { z } from "zod"

export const passwordSchema = z.string().min(8, "Use pelo menos 8 caracteres.").max(72).refine(value => Buffer.byteLength(value, "utf8") <= 72, "Senha deve ter no máximo 72 bytes.")
export const passwordPairSchema = z.object({ password: passwordSchema, confirmPassword: z.string() }).refine(data => data.password === data.confirmPassword, { message: "As senhas não são iguais.", path: ["confirmPassword"] })
