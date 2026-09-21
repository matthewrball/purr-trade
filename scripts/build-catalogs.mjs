/* eslint-disable no-console */
// Prebuild: snapshot every exchange PRODUCTS catalog (GET, https) into public/catalogs/
// so productsService can load them same-origin instead of through the CORS proxy.
// URLs are derived from src/worker/exchanges/**/*.ts. Never fails the build.
import { mkdir, readdir, readFile, rm, writeFile } from 'fs/promises'
import path from 'path'
import { fileURLToPath } from 'url'

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const EXCHANGES_DIR = path.join(ROOT, 'src/worker/exchanges')
const OUT_DIR = path.join(ROOT, 'public/catalogs')
const CONCURRENCY = 6
const TIMEOUT_MS = Number(process.env.CATALOG_TIMEOUT_MS) || 15000
const MAX_BYTES = 25 * 1024 * 1024 // Cloudflare Pages per-file limit

// Must match catalogName() in src/services/productsService.ts
const catalogName = url =>
  url.replace(/^https:\/\//, '').replace(/[^a-zA-Z0-9.-]+/g, '_')

async function listTsFiles(dir) {
  const files = []
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name)
    if (entry.isDirectory()) {
      files.push(...(await listTsFiles(full)))
    } else if (entry.name.endsWith('.ts')) {
      files.push(full)
    }
  }
  return files
}

function readStringLiteral(source, start) {
  const quote = source[start]
  let i = start + 1
  let value = ''
  while (i < source.length && source[i] !== quote) {
    if (source[i] === '\\') {
      i++
    }
    value += source[i++]
  }
  return { value, end: i + 1 }
}

// String literals of a `PRODUCTS:` value: a single string, or the strings of an
// array literal up to its closing bracket. Strings inside objects ({ url: ... }) are skipped.
function productsUrls(source, start) {
  let i = start
  while (/\s/.test(source[i])) i++

  if (/['"`]/.test(source[i])) {
    return [readStringLiteral(source, i).value]
  }

  if (source[i] !== '[') {
    return []
  }

  const urls = []
  let brackets = 0
  let braces = 0
  while (i < source.length) {
    const char = source[i]
    if (/['"`]/.test(char)) {
      const literal = readStringLiteral(source, i)
      if (braces === 0) {
        urls.push(literal.value)
      }
      i = literal.end
      continue
    }
    if (char === '/' && source[i + 1] === '/') {
      i = source.indexOf('\n', i)
      if (i === -1) break
      continue
    }
    if (char === '/' && source[i + 1] === '*') {
      i = source.indexOf('*/', i)
      if (i === -1) break
      i += 2
      continue
    }
    if (char === '[') brackets++
    if (char === ']' && --brackets === 0) break
    if (char === '{') braces++
    if (char === '}') braces--
    i++
  }
  return urls
}

async function deriveUrls() {
  const urls = new Set()
  for (const file of await listTsFiles(EXCHANGES_DIR)) {
    const source = await readFile(file, 'utf8')
    const regex = /\bPRODUCTS\s*:/g
    let match
    while ((match = regex.exec(source))) {
      for (const url of productsUrls(source, match.index + match[0].length)) {
        if (/^https:\/\//.test(url)) {
          urls.add(url)
        }
      }
    }
  }
  return [...urls].sort()
}

async function fetchCatalog(url) {
  const response = await fetch(url, {
    signal: AbortSignal.timeout(TIMEOUT_MS),
    headers: { Accept: 'application/json' }
  })
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`)
  }
  if (Number(response.headers.get('content-length')) > MAX_BYTES) {
    throw new Error('larger than 25 MiB')
  }
  const body = Buffer.from(await response.arrayBuffer())
  if (body.length > MAX_BYTES) {
    throw new Error('larger than 25 MiB')
  }
  JSON.parse(body.toString('utf8'))
  return body
}

async function main() {
  const urls = await deriveUrls()
  console.log(`[catalogs] ${urls.length} catalog urls`)
  if (process.env.CATALOG_LIST) {
    urls.forEach(url => console.log(url))
  }

  await rm(OUT_DIR, { recursive: true, force: true })
  await mkdir(OUT_DIR, { recursive: true })

  const skipped = []
  let ok = 0
  let next = 0
  const worker = async () => {
    while (next < urls.length) {
      const url = urls[next++]
      try {
        const body = await fetchCatalog(url)
        await writeFile(path.join(OUT_DIR, catalogName(url) + '.json'), body)
        ok++
      } catch (error) {
        skipped.push(url)
        const cause = error.cause
          ? `: ${error.cause.code || error.cause.message}`
          : ''
        console.warn(`[catalogs] skipped ${url} (${error.message}${cause})`)
      }
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, worker))

  console.log(`[catalogs] ok ${ok}, skipped ${skipped.length}`)
}

main()
  .catch(error => {
    console.warn('[catalogs] failed, continuing without static catalogs', error)
  })
  .finally(() => {
    process.exitCode = 0
  })
