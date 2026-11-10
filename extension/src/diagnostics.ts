const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {}
const timestamp = (value: unknown) => typeof value === "string" && /^\d{4}-\d\d-\d\dT/.test(value) && Number.isFinite(Date.parse(value)) ? new Date(value).toISOString() : null

/** Explicit allowlist: never spread API responses or tab payloads into a support report. */
export function safeServerHealth(value: unknown) {
  const data = record(value), connector = record(data.connector)
  return {
    protocol: data.protocol === 1 ? 1 : 0,
    checkedAt: timestamp(data.checkedAt), tokenExpiresAt: timestamp(data.tokenExpiresAt),
    connector: { configured: connector.configured === true, workerOnline: connector.workerOnline === true, connected: connector.connected === true, paused: connector.paused !== false, enabled: connector.enabled === true },
  }
}
export function safeTabHealth(value: unknown) {
  const data = record(value)
  return { responsive: data.protocol === 1, currentVersion: typeof data.version === "string" && /^\d+\.\d+\.\d+$/.test(data.version) ? data.version : null, main: data.main === true, composer: data.composer === true, bridge: data.bridge === true, expired: data.expired === true, lastSyncAt: timestamp(data.lastSyncAt) }
}

export function crmFailure(status: number) {
  if (status === 401) return "Token inválido ou expirado. Gere outro em Configurações."
  if (status === 403) return "Acesso recusado pelo servidor. Confira a configuração da origem e as permissões."
  if (status === 426) return "Resposta incompatível. Atualize o servidor e a extensão juntos."
  if (status === 404) return "Atualize o servidor para disponibilizar o diagnóstico."
  if (status >= 500) return "CRM indisponível. Confira o aplicativo e o banco de dados no servidor."
  return "Sem conexão. Confira a URL, a permissão de acesso e se o CRM está em execução."
}

export type ConnectionReport = {
  version: string; checkedAt: string; configured: boolean; permitted: boolean;
  crm: { ok: boolean; status: number };
  server: ReturnType<typeof safeServerHealth> | null;
  tabs: ReturnType<typeof safeTabHealth>[];
}
