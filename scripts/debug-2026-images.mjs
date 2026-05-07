import fs from "node:fs"

let s = fs.readFileSync(new URL("../../frontend/web/public/2026.html", import.meta.url), "utf8")
s = s.replace(/&#(\d+);/g, (_, d) => String.fromCharCode(Number(d)))

const names = ["Серік Қалиев", "Сүйінбай Аронұлы", "Кенен Әзірбаев", "Үмбетәлі Кәрібаев"]

for (const n of names) {
  const i = s.indexOf(n)
  console.log("\n", n, "idx", i)
  if (i < 0) continue
  const before = s.slice(Math.max(0, i - 8000), i)
  let last = null
  for (const m of before.matchAll(/<img[^>]*src="([^"]+)"/gi)) {
    last = m[1]
  }
  console.log("prev img", last)
}

