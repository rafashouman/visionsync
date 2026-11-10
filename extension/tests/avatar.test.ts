import { test } from "node:test"
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"
import { runInNewContext } from "node:vm"

const script = readFileSync(new URL("../content.js", import.meta.url), "utf8")

function fixture(switched = false, registered = true) {
  const uploads: unknown[] = []
  const context = {
    document: { addEventListener() {} }, setInterval() { return 1 },
    chrome: { runtime: { async sendMessage() { return { ok: true, base64: "/9j/test" } } } },
    uploads,
  }
  return runInNewContext(`${script}
    state.phone = '5511999999999'; state.apiUrl = 'http://localhost:3001'; seq = 1;
    render = () => {};
    resolveChat = async () => ({ phone: '${switched ? "5521999999999" : "5511999999999"}', key: 'chat-a' });
    api = async (method, path, body) => { uploads.push({ method, path, body }); return { ok: true, data: { avatarUrl: '/api/crm/contacts/a/avatar' } } };
    const found = { phone: '5511999999999', key: 'chat-a', pic: 'https://pps.whatsapp.net/photo' };
    const contact = ${registered ? "{ contactId: 'a' }" : "null"};
    ({ run: () => syncContactAvatar(found, contact, 1), preview: () => avatarPreview, uploads });`, context) as { run: () => Promise<void>; preview: () => { phone: string; url: string }; uploads: unknown[] }
}

test("avatar follows contact identity and repeated observer events do not upload again", async () => {
  const adapter = fixture()
  await adapter.run(); await adapter.run()
  assert.equal(adapter.uploads.length, 1)
  assert.equal((adapter.uploads[0] as { path: string }).path, "/api/crm/contacts/a/avatar")
})

test("a chat switch during photo download prevents attaching to the previous contact", async () => {
  const adapter = fixture(true)
  await adapter.run()
  assert.equal(adapter.uploads.length, 0)
})
test("photo preview does not require a saved CRM contact or an avatar upload", async () => {
  const adapter = fixture(false, false)
  await adapter.run()
  assert.equal(adapter.preview().url, "https://pps.whatsapp.net/photo")
  assert.equal(adapter.preview().phone, "5511999999999")
  assert.equal(adapter.uploads.length, 0)
})
