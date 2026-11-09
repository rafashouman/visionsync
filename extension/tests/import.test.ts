import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

test("import preview compares complete normalized phone numbers", () => {
  const script = readFileSync(new URL("../content.js", import.meta.url), "utf8")
  const context = {
    document: { addEventListener() {} },
    setInterval() { return 1 },
  }
  const preview = runInNewContext(
    `${script}\n;({ imp, importable })`,
    context,
  ) as {
    imp: { scan: unknown; known: Set<string>; selected: Set<string>; onlyNew: boolean; archived: boolean }
    importable: () => { phone: string }[]
  }
  preview.imp.known = new Set(["5511999999999"])
  preview.imp.selected = new Set(["Cliente"])
  preview.imp.scan = { chats: [
    { phone: "(11) 99999-9999", labels: ["Cliente"], archived: false },
    { phone: "(21) 99999-9999", labels: ["Cliente"], archived: false },
  ] }
  assert.deepEqual(Array.from(preview.importable(), c => c.phone), ["(21) 99999-9999"])
})
