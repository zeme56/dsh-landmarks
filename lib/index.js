/**
 * dsh-landmarks —— 宿主侧。
 *
 * 只做一件事：把插件 assets/ 目录以同源 HTTP 暴露给浏览器端
 * （GLB 模型、缩略图、three.js 运行时），并提供一份 manifest。
 * 面板本身完全由 lib/client.js 渲染，不依赖宿主 RPC。
 */
import { createReadStream } from 'node:fs'
import { promises as fs } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const name = 'landmarks-3d'
export const inject = ['webServer']

const HERE = path.dirname(fileURLToPath(import.meta.url))
const ASSETS = path.resolve(HERE, '..', 'assets')
const ROOMS = path.resolve(HERE, '..', 'rooms')
const PREFIX = '/api/landmarks'

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.bin': 'application/octet-stream',
  '.json': 'application/json; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.hdr': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.wasm': 'application/wasm',
}

function sendJson(res, status, body) {
  const data = Buffer.from(JSON.stringify(body), 'utf8')
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': data.byteLength,
    'cache-control': 'no-store',
  })
  res.end(data)
}

function safeRel(urlPath) {
  let decoded
  try {
    decoded = decodeURIComponent(urlPath)
  } catch {
    return null
  }
  if (decoded.includes('\0')) return null
  const rel = decoded.replace(/^\/+/, '')
  if (rel === '' || rel.split('/').some((part) => part === '..' || part === '')) return null
  return rel
}

async function serveFile(req, res, rootDir, rel) {
  const file = path.resolve(rootDir, rel)
  const root = rootDir.toLowerCase() + path.sep
  if (!file.toLowerCase().startsWith(root)) {
    return sendJson(res, 403, { error: 'forbidden' })
  }

  let stat
  try {
    stat = await fs.stat(file)
  } catch {
    return sendJson(res, 404, { error: 'not found', path: rel })
  }
  if (!stat.isFile()) return sendJson(res, 404, { error: 'not found', path: rel })

  const etag = `W/"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`
  const ext = path.extname(file).toLowerCase()
  const headers = {
    'content-type': MIME[ext] ?? 'application/octet-stream',
    'cache-control': ext === '.html' ? 'no-store' : 'public, max-age=300',
    etag,
    'accept-ranges': 'bytes',
    'x-content-type-options': 'nosniff',
  }

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers)
    return res.end()
  }

  const range = req.headers.range
  if (typeof range === 'string' && /^bytes=\d*-\d*$/.test(range)) {
    const [startRaw, endRaw] = range.slice(6).split('-')
    let start = startRaw === '' ? null : Number(startRaw)
    let end = endRaw === '' ? null : Number(endRaw)
    if (start === null && end !== null) {
      start = Math.max(0, stat.size - end)
      end = stat.size - 1
    }
    start = start ?? 0
    end = end === null ? stat.size - 1 : Math.min(end, stat.size - 1)
    if (start > end || start >= stat.size) {
      res.writeHead(416, { 'content-range': `bytes */${stat.size}` })
      return res.end()
    }
    headers['content-range'] = `bytes ${start}-${end}/${stat.size}`
    headers['content-length'] = String(end - start + 1)
    headers['cache-control'] = 'public, max-age=3600'
    res.writeHead(206, headers)
    createReadStream(file, { start, end }).pipe(res)
    return
  }

  headers['content-length'] = String(stat.size)
  res.writeHead(200, headers)
  createReadStream(file).pipe(res)
}

export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: PREFIX,
    handler: async (req, res) => {
      const pathname = (req.url ?? '').split('?')[0]
      const route = pathname.slice(PREFIX.length) || '/'

      if ((req.method === 'GET' || req.method === 'HEAD') && route.startsWith('/rooms')) {
        let rel = route.slice('/rooms'.length).replace(/^\/+/, '')
        if (rel === '') rel = 'index.html'
        const safe = safeRel(rel)
        if (safe === null) return sendJson(res, 400, { error: 'bad path' })
        return serveFile(req, res, ROOMS, safe)
      }

      if (req.method === 'GET' && route === '/health') {
        let models = []
        try {
          const manifest = JSON.parse(await fs.readFile(path.join(ASSETS, 'manifest.json'), 'utf8'))
          models = manifest.models.map((m) => ({
            id: m.id,
            model: m.model,
            thumb: m.thumb,
          }))
        } catch {
          /* assets 还没就绪时 health 仍然可用 */
        }
        return sendJson(res, 200, {
          ok: true,
          plugin: 'dsh-landmarks',
          version: '1.0.0',
          root: ASSETS,
          models,
        })
      }

      if (req.method === 'GET' && route === '/manifest') {
        try {
          const data = await fs.readFile(path.join(ASSETS, 'manifest.json'), 'utf8')
          res.writeHead(200, {
            'content-type': 'application/json; charset=utf-8',
            'cache-control': 'no-store',
          })
          return res.end(data)
        } catch (error) {
          return sendJson(res, 500, {
            error: 'manifest unavailable',
            detail: error instanceof Error ? error.message : String(error),
          })
        }
      }

      if ((req.method === 'GET' || req.method === 'HEAD') && route.startsWith('/assets/')) {
        const rel = safeRel(route.slice('/assets/'.length))
        if (rel === null) return sendJson(res, 400, { error: 'bad path' })
        return serveFile(req, res, ASSETS, rel)
      }

      return sendJson(res, 404, { error: 'unknown route', route })
    },
  }), 'dsh-landmarks: static assets')
}
