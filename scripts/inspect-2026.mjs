import fs from "node:fs"

const htmlPath = new URL("../../frontend/web/public/2026.html", import.meta.url)
const s = fs.readFileSync(htmlPath, "utf8")

console.log("len", s.length)
const bi = s.toLowerCase().indexOf("<body")
console.log("bodyIdx", bi)
const body = bi >= 0 ? s.slice(bi) : s

const firstImgSrcs = Array.from(
  body.matchAll(/<img[^>]*?src="([^"]+)"[^>]*>/gi)
)
  .slice(0, 10)
  .map((m) => m[1])

const h1 = Array.from(body.matchAll(/<h1[^>]*>([\s\S]*?)<\/h1>/gi))
  .map((m) =>
    m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  )
  .slice(0, 10)

const firstPTexts = Array.from(body.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
  .map((m) =>
    m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&nbsp;/g, " ")
      .replace(/\s+/g, " ")
      .trim()
  )
  .filter(Boolean)
  .slice(0, 30)

console.log("first img srcs", firstImgSrcs)
console.log("h1", h1)
console.log("first p texts", firstPTexts)

