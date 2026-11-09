// Roda DENTRO da página do WhatsApp Web (mundo "MAIN"), porque o telefone da
// conversa não aparece no HTML: ele só existe nos dados internos do WhatsApp.
// Aqui só LEMOS qual conversa está aberta e o número dela. Nada é alterado nem enviado.
// Fala com o content.js por eventos: "vcrm-req" (pedido) e "vcrm-res" (resposta).
//
// ⚠ PARTE FRÁGIL: nomes de módulos internos do WhatsApp mudam. Por isso tentamos
// vários caminhos e devolvemos um "debug" dizendo o que funcionou.
(() => {
  if (window.__vcrmBridge) return
  window.__vcrmBridge = true

  const req = (name) => {
    try { return window.require ? window.require(name) : null } catch { return null }
  }
  const mask = (s) => String(s == null ? "" : s).replace(/[0-9]/g, "9").slice(0, 60)
  const digits = (s) => String(s || "").replace(/\D/g, "")

  function collections() {
    for (const n of ["WAWebCollections", "WAWebChatCollection"]) {
      const m = req(n)
      if (m) return m
    }
    return null
  }

  function findActiveChat(dbg) {
    const C = collections()
    dbg.temCollections = !!C
    if (!C) return null
    const Chat = C.Chat || C
    dbg.temChat = !!Chat
    try { if (Chat.getActive) { const c = Chat.getActive(); if (c) { dbg.via = "getActive"; return c } } } catch (e) { dbg.erroGetActive = String(e).slice(0, 80) }
    const models = Chat.models || Chat._models || (Chat.getModelsArray && Chat.getModelsArray()) || []
    dbg.qtdChats = models.length
    const act = models.find((m) => m && (m.active === true || (m.getActive && m.getActive())))
    if (act) { dbg.via = "models.active"; return act }
    return null
  }

  function widOf(x) {
    if (!x) return null
    return { user: x.user || "", server: x.server || "", ser: x._serialized || "" }
  }

  function phoneFromChat(chat, dbg) {
    const id = widOf(chat.id)
    dbg.servidor = id ? id.server : null
    if (!id) return ""
    if (id.server === "g.us") return "GROUP"
    if (id.server === "c.us" && digits(id.user)) return digits(id.user)

    // conversa por LID: procurar o número real
    const tries = []
    const C = collections()
    try { if (chat.contact && chat.contact.phoneNumber) tries.push(["chat.contact.phoneNumber", widOf(chat.contact.phoneNumber)]) } catch {}
    try { if (chat.contact && chat.contact.id && chat.contact.id.server === "c.us") tries.push(["chat.contact.id", widOf(chat.contact.id)]) } catch {}
    try {
      const Contact = C && C.Contact
      const ct = Contact && Contact.get && Contact.get(chat.id)
      if (ct && ct.phoneNumber) tries.push(["Contact.get.phoneNumber", widOf(ct.phoneNumber)])
    } catch {}
    for (const mod of ["WAWebLidMigrationUtils", "WAWebApiContact", "WAWebLidPhoneMappingUtils", "WAWebLidUtils"]) {
      const M = req(mod)
      dbg["mod_" + mod] = !!M
      if (!M) continue
      for (const fn of ["getPhoneNumber", "toPn", "lidToPn", "getPhoneNumberFromLid"]) {
        try { if (typeof M[fn] === "function") { const r = M[fn](chat.id); tries.push([mod + "." + fn, widOf(r && r.user ? r : null)]) } } catch {}
      }
    }
    dbg.tentativas = tries.map(([n, w]) => n + "=" + (w && w.user ? mask(w.user) : "vazio"))
    for (const [n, w] of tries) {
      if (w && digits(w.user) && (w.server === "c.us" || !w.server)) { dbg.via = (dbg.via || "") + "+" + n; return digits(w.user) }
    }
    return ""
  }

  function answer() {
    const dbg = {}
    let phone = ""
    let name = ""
    let key = ""
    let lastT = 0
    try {
      const chat = findActiveChat(dbg)
      dbg.achouChat = !!chat
      if (chat) {
        key = serial(chat.id)
        const lm = lastMessageOf(chat)
        lastT = ((lm && lm.t) || chat.t || 0) * 1000
        phone = phoneFromChat(chat, dbg)
        name = (chat.formattedTitle || chat.name || (chat.contact && (chat.contact.name || chat.contact.pushname)) || "") + ""
        dbg.chaves = Object.keys(chat).slice(0, 20)
      }
    } catch (e) { dbg.erro = String(e).slice(0, 120) }
    return { phone, name, key, lastT, dbg }
  }

  // ── Leitura em massa: etiquetas, contatos e estado das conversas ──
  const arr = (col) => {
    if (!col) return []
    try {
      if (typeof col.getModelsArray === "function") return col.getModelsArray()
      if (Array.isArray(col.models)) return col.models
      if (Array.isArray(col._models)) return col._models
    } catch {}
    return []
  }
  const serial = (w) => (w && (w._serialized || (w.user ? w.user + "@" + w.server : ""))) || String(w || "")

  function lastMessageOf(chat) {
    try {
      const msgs = chat.msgs
      if (msgs && typeof msgs.last === "function") return msgs.last()
      const list = arr(msgs)
      return list.length ? list[list.length - 1] : null
    } catch { return null }
  }

  function scan() {
    const dbg = { versao: "scan1" }
    const labelsOut = []
    const chatsOut = []
    let semTelefone = 0
    let grupos = 0
    try {
      const C = collections()
      dbg.temCollections = !!C
      if (!C) return { labels: labelsOut, chats: chatsOut, semTelefone, grupos, dbg }

      // etiquetas (WhatsApp Business) e quais conversas estão em cada uma
      const labelModels = arr(C.Label)
      dbg.temLabel = !!C.Label
      dbg.qtdEtiquetas = labelModels.length
      const labelsOfChat = new Map() // id da conversa -> [nomes]
      for (const l of labelModels) {
        const name = String(l.name || "").trim()
        if (!name) continue
        labelsOut.push({ name, color: typeof l.hexColor === "string" ? l.hexColor : undefined })
        const items = arr(l.labelItemCollection)
        for (const it of items) {
          if (it.parentType && it.parentType !== "Chat") continue
          const key = serial(it.parentId)
          if (!key) continue
          if (!labelsOfChat.has(key)) labelsOfChat.set(key, [])
          labelsOfChat.get(key).push(name)
        }
      }
      dbg.conversasComEtiqueta = labelsOfChat.size

      const chats = arr(C.Chat)
      dbg.qtdConversas = chats.length
      const sample = []
      for (const chat of chats) {
        const id = chat && chat.id
        const server = id && id.server
        if (!id) continue
        if (server === "g.us" || chat.isGroup) { grupos++; continue }
        if (server !== "c.us" && server !== "lid") continue // lista de transmissão, canal, status...
        const throwaway = {}
        const phone = phoneFromChat(chat, throwaway)
        if (!phone || phone === "GROUP") { semTelefone++; if (sample.length < 3) sample.push(throwaway.tentativas || throwaway.servidor); continue }

        const last = lastMessageOf(chat)
        const lastAtSec = (last && last.t) || chat.t || 0
        const lastFromMe = last && last.id ? !!last.id.fromMe : null
        const name = String(chat.formattedTitle || chat.name || (chat.contact && (chat.contact.name || chat.contact.pushname)) || "").trim()
        const myLabels = new Set([...(labelsOfChat.get(serial(id)) || [])])
        chatsOut.push({
          phone,
          name: name && !/^[+\d\s()-]+$/.test(name) ? name : "",
          labels: [...myLabels],
          unread: typeof chat.unreadCount === "number" ? Math.max(0, chat.unreadCount) : 0,
          archived: !!chat.archive,
          lastFromMe,
          lastAt: lastAtSec ? lastAtSec * 1000 : null,
        })
      }
      dbg.amostraSemTelefone = sample
    } catch (e) { dbg.erro = String(e).slice(0, 160) }
    return { labels: labelsOut, chats: chatsOut, semTelefone, grupos, dbg }
  }

  // ── Foto da cliente: tenta vários lugares onde o WhatsApp guarda ──
  const okUrl = (u) => typeof u === "string" && /^(https:|blob:|data:image)/.test(u)
  function picOf(chat, C) {
    const holders = []
    const add = (fn) => { try { const h = fn(); if (h) holders.push(h) } catch {} }
    add(() => C.ProfilePicThumb && C.ProfilePicThumb.get && C.ProfilePicThumb.get(chat.id))
    add(() => C.ProfilePicThumb && C.ProfilePicThumb.get && chat.contact && C.ProfilePicThumb.get(chat.contact.id))
    add(() => chat.contact && chat.contact.profilePicThumb)
    add(() => chat.profilePicThumb)
    add(() => { const M = req("WAWebProfilePicThumbCollection"); const P = M && (M.ProfilePicThumbCollection || M.default || M); return P && P.get && P.get(chat.id) })
    for (const h of holders) {
      for (const k of ["eurl", "img", "previewEurl", "imgFull"]) {
        if (okUrl(h[k])) return h[k]
      }
    }
    return ""
  }

  // ── Quem está esperando resposta (a última mensagem é da cliente) ──
  const TYPE_LABEL = { ptt: "Mensagem de voz", audio: "Mensagem de voz", image: "Foto", video: "Vídeo", sticker: "Figurinha", document: "Documento", location: "Localização", vcard: "Contato", gif: "GIF" }

  function waiting(minMinutes, maxHours) {
    const dbg = { versao: "wait1" }
    const out = []
    try {
      const C = collections()
      if (!C) return { waiting: out, dbg: { ...dbg, semCollections: true } }
      const now = Date.now()
      for (const chat of arr(C.Chat)) {
        const id = chat && chat.id
        const server = id && id.server
        if (!id || server === "g.us" || chat.isGroup) continue
        if (server !== "c.us" && server !== "lid") continue
        if (chat.archive) continue
        const last = lastMessageOf(chat)
        if (!last || !last.id || last.id.fromMe !== false) continue
        const t = (last.t || chat.t || 0) * 1000
        if (!t) continue
        const mins = Math.floor((now - t) / 60000)
        if (mins < minMinutes || mins > maxHours * 60) continue
        const type = String(last.type || "chat")
        let preview = TYPE_LABEL[type] || ""
        if (!preview) preview = String(last.body || last.caption || "Mensagem").replace(/\s+/g, " ").slice(0, 50)
        const pic = picOf(chat, C)
        out.push({
          key: serial(id),
          lastT: t,
          pic,
          name: String(chat.formattedTitle || chat.name || (chat.contact && (chat.contact.name || chat.contact.pushname)) || "").trim() || "Contato",
          preview,
          mins,
        })
      }
      out.sort((a, b) => b.mins - a.mins)
      dbg.total = out.length
    } catch (e) { dbg.erro = String(e).slice(0, 160) }
    return { waiting: out.slice(0, 30), dbg }
  }

  // ── Abrir uma conversa pelo id ──
  function openChat(key) {
    const dbg = { versao: "open1" }
    try {
      const C = collections()
      const chat = C && arr(C.Chat).find((c) => c && c.id && serial(c.id) === key)
      dbg.achouChat = !!chat
      if (!chat) return { opened: false, dbg }
      for (const mod of ["WAWebCmd", "WAWebCmdCollection"]) {
        const M = req(mod)
        const Cmd = M && (M.Cmd || M)
        dbg["mod_" + mod] = !!Cmd
        if (!Cmd) continue
        for (const fn of ["openChatAt", "openChatBottom", "openChatFromUnread"]) {
          if (typeof Cmd[fn] === "function") {
            try { Cmd[fn](chat); dbg.via = mod + "." + fn; return { opened: true, dbg } } catch (e) { dbg["erro_" + fn] = String(e).slice(0, 80) }
          }
        }
      }
    } catch (e) { dbg.erro = String(e).slice(0, 120) }
    return { opened: false, dbg }
  }

  // ── Diagnóstico: o que a conversa guarda sobre o ANÚNCIO que a trouxe ──
  // Só LÊ. Não devolve texto de mensagem, só os nomes dos campos, os tipos e os valores que
  // parecem de anúncio (id, clique, link, origem).
  const AD_KEY = /ctwa|referral|adsource|ad_id|adid|entrypoint|conversionsource|externalad|sourceid|sourceurl|sourcetype|clid|campaign|utm|fbclid|greeting/i
  const brief = (v) => {
    if (v == null) return v
    if (typeof v === "string") return v.length > 24 ? v.slice(0, 14) + "…(" + v.length + " caracteres)" : v
    if (typeof v === "number" || typeof v === "boolean") return v
    if (Array.isArray(v)) return "lista(" + v.length + ")"
    if (typeof v === "object") return "objeto{" + Object.keys(v).slice(0, 12).join(",") + "}"
    return typeof v
  }
  function adKeys(obj, depth = 0, out = {}, prefix = "") {
    if (!obj || typeof obj !== "object" || depth > 2) return out
    let keys = []
    try { keys = Object.keys(obj) } catch {}
    for (const k of keys) {
      let v
      try { v = obj[k] } catch { continue }
      if (AD_KEY.test(k)) out[prefix + k] = brief(v)
      if (v && typeof v === "object" && !Array.isArray(v) && depth < 2 && /context|ctwa|referral|ad|source|signal/i.test(k)) adKeys(v, depth + 1, out, prefix + k + ".")
    }
    return out
  }

  function adInfo() {
    const dbg = { versao: "ad1" }
    const out = { chatKeys: {}, tipos: {}, mensagens: [], primeiras: [], banner: null, dbg }
    try {
      const chat = findActiveChat(dbg)
      if (!chat) return { ...out, erro: "nenhuma conversa aberta" }
      out.chatKeys = adKeys(chat)
      const msgs = arr(chat.msgs)
      dbg.qtdMensagensCarregadas = msgs.length
      let i = 0
      const counts = {}
      const typeKeys = {} // campos de cada TIPO de mensagem (pra achar o do aviso de anúncio)
      for (const m of msgs) {
        const t = String(m.type || "?") + (m.subtype ? "/" + m.subtype : "")
        out.tipos[t] = (out.tipos[t] || 0) + 1
        try {
          for (const k of Object.keys(m)) {
            counts[k] = (counts[k] || 0) + 1
            if (!typeKeys[t]) typeKeys[t] = new Set()
            typeKeys[t].add(k)
          }
        } catch {}
        if (i < 2) out.primeiras.push({ n: i, tipo: t, deMim: !!(m.id && m.id.fromMe) })
        const suspeitos = adKeys(m)
        const system = /notification|system|ctwa|gp2|e2e/i.test(t)
        if (Object.keys(suspeitos).length || (system && out.mensagens.length < 12)) {
          if (out.mensagens.length < 25) out.mensagens.push({ n: i, tipo: t, deMim: !!(m.id && m.id.fromMe), suspeitos })
        }
        i++
        if (i > 600) break
      }
      // Campos RAROS (aparecem em poucas mensagens): é onde costuma ficar o que é de anúncio.
      const n = msgs.length || 1
      out.camposRaros = Object.entries(counts).filter(([, c]) => c < n * 0.5).sort((a, b) => a[1] - b[1]).slice(0, 60).map(([k, c]) => k + ":" + c)
      // Campos que só existem em tipos "estranhos" (aviso/sistema), sem repetir os comuns
      const comuns = new Set(Object.keys(counts).filter((k) => counts[k] >= n * 0.5))
      out.camposPorTipoEspecial = {}
      for (const [t, set] of Object.entries(typeKeys)) {
        if (/^(chat|ptt|image|video|sticker|audio|document)$/.test(t)) continue
        out.camposPorTipoEspecial[t] = [...set].filter((k) => !comuns.has(k)).slice(0, 40)
      }
      // Campos da conversa (só os NOMES), pra ver se existe algum de origem
      try { out.camposDaConversa = Object.keys(chat).filter((k) => /entry|source|ad|ctwa|origin|referr|conversion|campaign|ref/i.test(k)).slice(0, 60) } catch {}
    } catch (e) { dbg.erro = String(e).slice(0, 160) }

    // O aviso "Esta conversa foi iniciada através de um anúncio..." na tela (texto do aviso e links dele)
    try {
      const main = document.querySelector("#main")
      if (main) {
        const hit = [...main.querySelectorAll("span, div")].find((n) => n.children.length < 4 && /an[uú]ncio|campanha|ad\b/i.test(n.textContent || "") && (n.textContent || "").length < 220 && /iniciad|veio|origem|come[cç]ou/i.test(n.textContent || ""))
        if (hit) {
          const box = hit.closest("[role='row'], [data-id], div") || hit
          out.banner = {
            texto: (hit.textContent || "").trim().slice(0, 200),
            links: [...box.querySelectorAll("a[href]")].map((a) => a.href).slice(0, 5),
            atributosData: [...new Set([...box.querySelectorAll("*")].flatMap((n) => [...n.attributes].map((a) => a.name).filter((x) => /^data-/.test(x))))].slice(0, 20),
          }
        }
      }
    } catch (e) { dbg.erroBanner = String(e).slice(0, 100) }
    return out
  }

  document.addEventListener("vcrm-req", (ev) => {
    let id = ev.detail
    let kind = "chat"
    let arg = null
    try { const d = JSON.parse(ev.detail); if (d && typeof d === "object") { id = d.id; kind = d.kind || "chat"; arg = d.arg } } catch {}
    const out =
      kind === "scan" ? scan()
      : kind === "waiting" ? waiting((arg && arg.minMinutes) || 60, (arg && arg.maxHours) || 72)
      : kind === "open" ? openChat(String(arg || ""))
      : kind === "adinfo" ? adInfo()
      : answer()
    document.dispatchEvent(new CustomEvent("vcrm-res", { detail: JSON.stringify({ id, ...out }) }))
  })
})()
