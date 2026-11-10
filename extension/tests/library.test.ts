import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

const source = readFileSync(new URL("../content.js", import.meta.url), "utf8")
test("plugin uses the library's saved category order, color and reply order", () => {
  const html = runInNewContext(`${source}
    state.replies = [
      { id: 'b1', name: 'Primeira', type: 'TEXT', category: 'ZETA', categoryPosition: 0, categoryColor: '#4288d4', text: 'Oi', usageCount: 0 },
      { id: 'b2', name: 'Segunda', type: 'TEXT', category: 'ZETA', categoryPosition: 0, categoryColor: '#4288d4', text: 'Oi', usageCount: 0 },
      { id: 'a', name: 'Terceira', type: 'TEXT', category: 'ALFA', categoryPosition: 1, text: 'Oi', usageCount: 0 }
    ]; renderReplies()`, { document: { addEventListener() {} }, setInterval() { return 1 } }) as string
  assert.ok(html.indexOf('ZETA') < html.indexOf('ALFA'))
  assert.ok(html.indexOf('Primeira') < html.indexOf('Segunda'))
  assert.ok(html.includes('background:#4288d4'))
})
