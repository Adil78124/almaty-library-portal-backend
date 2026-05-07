import path from "node:path"
import fs from "node:fs/promises"

import { prisma } from "../src/prisma.js"
import { normalizeKzPhone } from "../src/lib/phone-normalize.js"

type RawStaff = {
  fullNameRu: string
  birthDate: string
  branchRu: string
  phone: string
}

function slugifyBase(input: string): string {
  return input
    .toLowerCase()
    .replace(/ё/g, "е")
    .replace(/ә/g, "a")
    .replace(/ғ/g, "g")
    .replace(/қ/g, "q")
    .replace(/ң/g, "ng")
    .replace(/ө/g, "o")
    .replace(/ұ/g, "u")
    .replace(/ү/g, "u")
    .replace(/һ/g, "h")
    .replace(/і/g, "i")
    .replace(/й/g, "i")
    .replace(/[\s]+/g, " ")
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
}

function cyrToLat(input: string): string {
  const map: Record<string, string> = {
    а: "a",
    ә: "a",
    б: "b",
    в: "v",
    г: "g",
    ғ: "g",
    д: "d",
    е: "e",
    ё: "e",
    ж: "zh",
    з: "z",
    и: "i",
    й: "i",
    к: "k",
    қ: "k",
    л: "l",
    м: "m",
    н: "n",
    ң: "n",
    о: "o",
    ө: "o",
    п: "p",
    р: "r",
    с: "s",
    т: "t",
    у: "u",
    ұ: "u",
    ү: "u",
    ф: "f",
    х: "kh",
    һ: "h",
    ц: "c",
    ч: "ch",
    ш: "sh",
    щ: "sh",
    ы: "y",
    і: "i",
    э: "e",
    ю: "yu",
    я: "ya",
  }
  return input
    .toLowerCase()
    .split("")
    .map((ch) => map[ch] ?? ch)
    .join("")
}

function fileKey(name: string): string {
  return cyrToLat(name).replace(/[^a-z0-9]/g, "").toLowerCase()
}

async function main() {
  const imgDir = path.resolve(
    process.cwd(),
    "../frontend/web/public/structurpageimg"
  )
  const files = await fs.readdir(imgDir)
  const byKey = new Map<string, string>()
  for (const f of files) {
    const base = f.replace(/\.[^.]+$/, "")
    byKey.set(base.replace(/[^a-z0-9]/gi, "").toLowerCase(), f)
  }

  const people: RawStaff[] = [
    {
      fullNameRu: "Турсунова Аида Джапаровна",
      birthDate: "25.10.1971",
      branchRu: "Ұйғыр ауданы",
      phone: "87084426278",
    },
    {
      fullNameRu: "Ибрагимова Ақбота Қажымұханқызы",
      birthDate: "07.02.1990",
      branchRu: "Балқаш ауданы",
      phone: "87478717201",
    },
    {
      fullNameRu: "Әжікеева Қымбат Нұрданбекқызы",
      birthDate: "25.04.1992",
      branchRu: "Райымбек ауданы",
      phone: "8 775 825-25-66",
    },
    {
      fullNameRu: "Будугулова Карлыгаш Турановна",
      birthDate: "01.06.1965",
      branchRu: "Іле ауданы",
      phone: "87714946402",
    },
    {
      fullNameRu: "Отеева Улдархан Кахановна",
      birthDate: "27.07.1967",
      branchRu: "Қарасай ауданы",
      phone: "87478470828",
    },
    {
      fullNameRu: "Жанабилова Дариға Адилжановна",
      birthDate: "24.12.1983",
      branchRu: "Еңбекшіқазақ ауданы",
      phone: "87075322932",
    },
    {
      fullNameRu: "Ахметова Индира Алиевна",
      birthDate: "18.01.1979",
      branchRu: "Кеген ауданы",
      phone: "87056002080",
    },
    {
      fullNameRu: "Хармысов Махамбет Касымканович",
      birthDate: "19.01.1963",
      branchRu: "Талғар ауданы",
      phone: "8-705-210-58-41",
    },
    {
      fullNameRu: "Ақтанова Айгүл Бегімбайқызы",
      birthDate: "29.07.1989",
      branchRu: "Қонаев қаласы",
      phone: "8 771 557 34 89",
    },
    {
      fullNameRu: "Әділхан Әділжан Әділханұлы",
      birthDate: "20.05.1972",
      branchRu: "Алатау қаласы",
      phone: "87011223278",
    },
  ]

  // This import is idempotent and safe to re-run for structure page staff.
  await prisma.staff.deleteMany()

  for (let i = 0; i < people.length; i++) {
    const p = people[i]!
    const slug = `${fileKey(p.fullNameRu)}-${slugifyBase(p.branchRu)}`
    const dateParts = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(p.birthDate)
    const birthDate = dateParts
      ? new Date(
          Date.UTC(
            Number(dateParts[3]),
            Number(dateParts[2]) - 1,
            Number(dateParts[1])
          )
        )
      : null

    const key = fileKey(p.fullNameRu)
    let filename = byKey.get(key)
    if (!filename) {
      // Fuzzy: try last+first only
      const parts = p.fullNameRu.split(/\s+/).filter(Boolean)
      const lf = parts.slice(0, 2).join("")
      filename =
        byKey.get(fileKey(lf)) ??
        [...byKey.entries()].find(([k]) => k.includes(fileKey(lf)))?.[1]
    }
    if (!filename) {
      // Fuzzy: surname only
      const parts = p.fullNameRu.split(/\s+/).filter(Boolean)
      const surname = parts[0] ?? ""
      const sk = fileKey(surname)
      filename =
        byKey.get(sk) ??
        [...byKey.entries()].find(([k]) => k.includes(sk) || sk.includes(k))?.[1]
    }
    if (!filename) {
      // Last resort: any file that contains the full key (or vice versa)
      filename =
        [...byKey.entries()].find(([k]) => k.includes(key) || key.includes(k))?.[1] ??
        null
    }

    const imageUrl = filename ? `/structurpageimg/${filename}` : null
    const phone = normalizeKzPhone(p.phone)

    await prisma.staff.create({
      data: {
        slug,
        fullNameRu: p.fullNameRu,
        fullNameKz: p.fullNameRu,
        birthDate,
        phone,
        positionRu: "Директор",
        positionKz: "Директор",
        branchRu: p.branchRu,
        branchKz: p.branchRu,
        imageUrl,
        sortOrder: i,
        isActive: true,
      },
    })
  }

  const count = await prisma.staff.count()
  console.log(`[import] staff rows: ${count}`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })

