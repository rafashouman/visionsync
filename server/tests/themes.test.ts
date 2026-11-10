import { test } from "node:test"
import assert from "node:assert/strict"
import { DEFAULT_THEME, THEMES, isTheme, resolveTheme } from "../src/lib/themes"

test("three Vision themes are offered, with migration of older preferences", () => {
  assert.equal(THEMES.length, 3)
  assert.equal(new Set(THEMES.map(t => t.id)).size, 3)
  assert.equal(DEFAULT_THEME, "dark")
  assert.equal(resolveTheme("dark-original"), "dark")
  assert.equal(resolveTheme("dark-minimal"), "dark")
  assert.equal(resolveTheme("light-minimal"), "minimal")
  for (const theme of THEMES) { assert.equal(isTheme(theme.id), true); assert.equal(resolveTheme(theme.id), theme.id) }
  for (const invalid of [undefined, null, "", "system", "<script>", {}, "LIGHT"]) {
    assert.equal(isTheme(invalid), false); assert.equal(resolveTheme(invalid), DEFAULT_THEME)
  }
})

test("all Vision themes keep readable text and field borders", async () => {
  const { readFile } = await import("node:fs/promises")
  const css = await readFile(new URL("../src/app/globals.css", import.meta.url), "utf8")
  function luminance(hex: string) {
    assert.match(hex, /^#[0-9a-f]{6}$/i)
    const linear = [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16) / 255).map(v => v <= .04045 ? v / 12.92 : ((v + .055) / 1.055) ** 2.4)
    return linear[0] * .2126 + linear[1] * .7152 + linear[2] * .0722
  }
  function contrast(a: string, b: string) {
    const [lo, hi] = [luminance(a), luminance(b)].sort((x, y) => x - y)
    return (hi + .05) / (lo + .05)
  }
  for (const theme of THEMES) {
    const tokens: Record<string, string> = {}
    for (const block of css.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
      if (block[1].trim().endsWith(":root") || block[1].includes(`[data-theme="${theme.id}"]`)) {
        for (const variable of block[2].matchAll(/(--[\w-]+):\s*([^;]+);/g)) tokens[variable[1]] = variable[2].trim()
      }
    }
    // Original dark surfaces use transparency over the page or parent card.
    function flatten(value: string, background: string) {
      const rgba = value.match(/^rgba\(\s*([\d.]+),\s*([\d.]+),\s*([\d.]+),\s*([\d.]+)\)$/)
      if (!rgba) return value
      const alpha = Number(rgba[4])
      return "#" + [1, 2, 3].map((index) => Math.round(Number(rgba[index]) * alpha + parseInt(background.slice(index * 2 - 1, index * 2 + 1), 16) * (1 - alpha)).toString(16).padStart(2, "0")).join("")
    }
    tokens["--card-top"] = flatten(tokens["--card-top"], tokens["--bg"])
    for (const key of Object.keys(tokens)) tokens[key] = flatten(tokens[key], tokens["--card-top"])
    for (const [foreground, background] of [["--text", "--card-top"], ["--muted", "--inner"], ["--faint", "--field"], ["--on-accent", "--accent"], ["--ok-text", "--ok-bg"], ["--late-text", "--late-bg"], ["--wait-text", "--wait-bg"], ["--vio-text", "--vio-bg"]]) {
      assert.ok(contrast(tokens[foreground], tokens[background]) >= 4.5, `${theme.id}: ${foreground} on ${background}`)
    }
    assert.ok(contrast(tokens["--control-line"], tokens["--field"]) >= 3, `${theme.id}: field boundary`)
  }
})
