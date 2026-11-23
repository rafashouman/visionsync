import { build } from "esbuild"
import { cp, mkdir, readFile, writeFile } from "node:fs/promises"
import path from "node:path"
import { zipExtension } from "./zip.mjs"
import { packExistingKey } from "./crx.mjs"
const root = path.resolve(import.meta.dirname, "..")
const out = path.join(root, "dist")
await mkdir(path.join(out, "popup"), { recursive: true })
await mkdir(path.join(out, "vendor"), { recursive: true })
const waBundlePath = new URL(import.meta.resolve("@wppconnect/wa-js"))
const waBundle = await readFile(waBundlePath, "utf8")
if (!waBundle.includes("self.WPP=__webpack_exports__") || (waBundle.match(/window\.WPPConfig/g) || []).length !== 2) throw new Error("Formato inesperado do adaptador WhatsApp. Revise a versão fixada antes de empacotar.")
// Keep this bundled, pinned adapter separate from globals owned by other extensions.
const isolatedWa = waBundle.replace("self.WPP=__webpack_exports__", "self.__vcrmWA=__webpack_exports__").replaceAll("window.WPPConfig", "window.__vcrmWAConfig").replaceAll("wppconnect-wa.js.LICENSE.txt", "wa-js.LICENSE.txt")
await writeFile(path.join(out, "vendor/wa-adapter.js"), `/* VisionSync: WA-JS 4.8.2, modified only to isolate globals. */\nif (!window.__vcrmWA) {\nwindow.__vcrmWAConfig = { disableGoogleAnalytics: true, googleAnalyticsId: null };\n${isolatedWa}\n}\n`)
await writeFile(path.join(out, "vendor/wa-js.LICENSE.txt"), (await readFile(new URL("../LICENSE", waBundlePath), "utf8")) + "\n" + (await readFile(new URL("wppconnect-wa.js.LICENSE.txt", waBundlePath), "utf8")))
const origin = process.env.CRM_ORIGIN
if (origin) {
  const url = new URL(origin)
  if (url.protocol !== "https:" || url.origin !== origin) throw new Error("CRM_ORIGIN deve ser uma origem HTTPS sem caminho.")
}
const icons = Object.fromEntries([16, 32, 48, 128].map(size => [String(size), `icons/icon-${size}.png`]))
const manifest = {
  manifest_version: 3, name: "VisionSync - CRM no WhatsApp", version: "0.24.0",
  description: "Contatos, notas, cobranças e respostas rápidas conectados ao seu CRM.",
  permissions: ["storage", "scripting"], host_permissions: ["http://localhost:3001/*", "https://web.whatsapp.com/*", "https://*.whatsapp.net/*", "https://*.fbcdn.net/*", ...(origin ? [`${origin}/*`] : [])],
  optional_host_permissions: ["https://*/*", "http://127.0.0.1/*", "http://localhost/*"],
  web_accessible_resources: [{ resources: ["brand/*.png", "brand/*.woff2"], matches: ["https://web.whatsapp.com/*"] }],
  icons,
  action: { default_icon: icons, default_title: "VisionSync", default_popup: "popup/popup.html" },
  background: { service_worker: "background.js" },
  content_scripts: [
    { matches: ["https://web.whatsapp.com/*"], js: ["vendor/wa-adapter.js", "page-bridge.js"], run_at: "document_start", world: "MAIN" },
    { matches: ["https://web.whatsapp.com/*"], js: ["content.js"], css: ["panel.css"], run_at: "document_idle" },
  ],
}
await writeFile(path.join(out, "manifest.json"), JSON.stringify(manifest, null, 2))
await build({ entryPoints: [path.join(root, "src/background.ts")], outfile: path.join(out, "background.js"), bundle: true, target: "chrome120", format: "iife" })
await build({ entryPoints: [path.join(root, "src/popup.ts")], outfile: path.join(out, "popup/popup.js"), bundle: true, target: "chrome120", format: "iife" })
await build({ entryPoints: [path.join(root, "content.js")], outfile: path.join(out, "content.js"), bundle: true, target: "chrome120", format: "iife" })
for (const name of ["page-bridge.js", "panel.css", "popup/popup.html"]) await cp(path.join(root, name), path.join(out, name))
await cp(path.join(root, "brand"), path.join(out, "brand"), { recursive: true })
await cp(path.join(root, "icons"), path.join(out, "icons"), { recursive: true })
const emitted = JSON.parse(await readFile(path.join(out, "manifest.json"), "utf8"))
for (const script of emitted.content_scripts) for (const file of script.js) await readFile(path.join(out, file))
await zipExtension(out, ["manifest.json", "background.js", "content.js", "page-bridge.js", "vendor/wa-adapter.js", "vendor/wa-js.LICENSE.txt", "panel.css", "popup/popup.html", "popup/popup.js", "brand/logo-small-wh.png", "brand/logo-small-dark.png", "brand/icon.png", "brand/geist-latin.woff2", "brand/Geist-OFL.txt", ...Object.values(icons)], path.resolve(root, "../server/public/visionsync-extension.zip"))
if (await packExistingKey(path.resolve(root, "../server/public/visionsync-extension.zip"), path.join(root, "dist.pem"), path.join(root, "dist.crx"))) console.log("CRX atualizado com a chave existente; ZIP e pasta instalável também disponíveis.")
console.log(`Extensão gerada em ${out}. Carregue essa pasta no Chrome.`)
