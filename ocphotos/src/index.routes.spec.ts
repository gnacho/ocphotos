import { beforeAll, describe, expect, it, vi } from 'vitest'

vi.mock('@opencloud-eu/web-pkg', () => ({
  defineWebApplication: (config: unknown) => config
}))

vi.mock('@opencloud-eu/web-client', () => ({
  urlJoin: (...parts: string[]) => parts.filter(Boolean).join('/')
}))

vi.mock('vue3-gettext', () => ({
  useGettext: () => ({ $gettext: (msg: string) => msg })
}))

type Route = {
  path: string
  name?: string
  redirect?: string
  component?: () => Promise<{ default?: unknown }>
}

const isComponent = (value: unknown) => {
  if (typeof value === 'function') {
    return true
  }
  if (!value || typeof value !== 'object') {
    return false
  }
  const candidate = value as { render?: unknown, setup?: unknown }
  return Boolean(candidate.render || candidate.setup)
}

const loadRoutes = async () => {
  const app = (await import('./index')).default as unknown as {
    setup: (args: unknown) => { routes: Route[] }
  }
  return app.setup({ applicationConfig: {} }).routes
}

describe('route components', () => {
  let routes: Route[]

  beforeAll(async () => {
    routes = await loadRoutes()
  })

  // the views are loaded lazily, so a renamed file or a lost default export only
  // breaks the app in the browser. This resolves every import the way the router does
  it('resolves every lazy view to a component', async () => {
    const lazy = routes.filter((route) => route.component)

    expect(lazy).toHaveLength(12)

    for (const route of lazy) {
      const module = await route.component!()
      expect(isComponent(module.default), `route ${route.name} does not export a component`).toBe(true)
    }
  })

  it('declares unique route names', () => {
    const names = routes.map((route) => route.name).filter(Boolean) as string[]

    expect(new Set(names).size).toBe(names.length)
  })

  // the host mounts the app under /<appId>, so the redirect carries the prefix while
  // the route paths in this file are relative to it
  it('redirects the root to a declared route', () => {
    const root = routes.find((route) => route.path === '/')
    const target = root?.redirect?.replace(/^\/[^/]+/, '')
    const paths = routes.map((route) => route.path)

    expect(root?.redirect).toBe('/ocphotos/timeline')
    expect(paths).toContain(target)
  })

  // documents the criterion the test above relies on, so it cannot be relaxed by accident
  it('rejects modules that are not components', () => {
    expect(isComponent({})).toBe(false)
    expect(isComponent(null)).toBe(false)
    expect(isComponent('PhotosView')).toBe(false)
    expect(isComponent({ setup: (): undefined => undefined })).toBe(true)
  })
})
