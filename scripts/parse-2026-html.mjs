import fs from "node:fs"

function decodeNumericEntities(s) {
  return s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))
}

function stripTags(s) {
  return s
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/\s+\n/g, "\n")
    .replace(/\n\s+/g, "\n")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim()
}

function isKazakh(text) {
  // Если встречаются специфические казахские буквы — считаем KZ.
  return /[әғқңөұүһіӘҒҚҢӨҰҮҺІ]/.test(text)
}

const htmlPath = new URL("../../frontend/web/public/2026.html", import.meta.url)
let html = fs.readFileSync(htmlPath, "utf8")
html = decodeNumericEntities(html)

const bodyIdx = html.toLowerCase().indexOf("<body")
const body = bodyIdx >= 0 ? html.slice(bodyIdx) : html

const parts = body.split(/<hr[^>]*page-break-before:always[^>]*>/i)

const items = []

for (const part of parts) {
  const h1m = part.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)
  if (!h1m) continue
  const titleRaw = stripTags(h1m[1])
  if (!titleRaw) continue

  const img = Array.from(part.matchAll(/<img[^>]*?src="([^"]+)"[^>]*>/gi)).map(
    (m) => m[1]
  )

  const pRaw = Array.from(part.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((m) => stripTags(m[1]))
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t.length > 0 && t !== titleRaw)

  const paragraphsKz = []
  const paragraphsRu = []
  for (const t of pRaw) {
    if (isKazakh(t)) paragraphsKz.push(t)
    else paragraphsRu.push(t)
  }

  items.push({
    title: titleRaw,
    imageSrc: img[0] ?? null,
    paragraphsKz,
    paragraphsRu,
  })
}

console.log("items", items.length)
console.log("images referenced", (body.match(/<img\b/gi) || []).length)
console.log("first 2 items preview", JSON.stringify(items.slice(0, 2), null, 2))

const outPath = new URL("./2026.parsed.json", import.meta.url)
fs.writeFileSync(outPath, JSON.stringify(items, null, 2), "utf8")
console.log("written", outPath.pathname)

