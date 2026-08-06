/**
 * Catch-all proxy to FastAPI.
 * Prefer this over next.config rewrites for reliable streaming (chat/stream).
 */
import { NextRequest, NextResponse } from 'next/server'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BACKEND = (process.env.JARVIS_BACKEND_URL || 'http://127.0.0.1:8002').replace(/\/$/, '')

async function proxy(req: NextRequest, ctx: { params: { path: string[] } }) {
  const parts = ctx.params.path || []
  const path = parts.join('/')
  const url = new URL(req.url)
  const target = `${BACKEND}/${path}${url.search}`

  const headers = new Headers()
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase()
    if (k === 'host' || k === 'connection' || k === 'content-length') return
    headers.set(key, value)
  })

  const init: RequestInit & { duplex?: 'half' } = {
    method: req.method,
    headers,
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    init.body = req.body
    init.duplex = 'half'
  }

  const upstream = await fetch(target, init)
  const out = new Headers()
  upstream.headers.forEach((value, key) => {
    const k = key.toLowerCase()
    if (k === 'transfer-encoding' || k === 'connection') return
    out.set(key, value)
  })

  return new NextResponse(upstream.body, {
    status: upstream.status,
    statusText: upstream.statusText,
    headers: out,
  })
}

export async function GET(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx)
}
export async function POST(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx)
}
export async function PUT(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx)
}
export async function PATCH(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx)
}
export async function DELETE(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx)
}
export async function OPTIONS(req: NextRequest, ctx: { params: { path: string[] } }) {
  return proxy(req, ctx)
}
