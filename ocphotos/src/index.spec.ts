import { describe, expect, it, vi } from 'vitest'

vi.mock('@opencloud-eu/web-pkg', () => ({
  defineWebApplication: (config: unknown) => config
}))

vi.mock('@opencloud-eu/web-client', () => ({
  urlJoin: (...parts: string[]) => parts.filter(Boolean).join('/')
}))

vi.mock('vue3-gettext', () => ({
  useGettext: () => ({ $gettext: (msg: string) => msg })
}))

const load = async () => {
  const app = (await import('./index')).default as unknown as {
    setup: (args: unknown) => {
      appInfo: { id: string, name: string, icon: string, extensions: Array<{ mimeType: string, routeName: string }> }
      routes: Array<{ path: string, name?: string, redirect?: string, meta?: Record<string, unknown> }>
      navItems: Array<{ name: string, route: { path: string }, priority: number }>
      translations: Record<string, unknown>
      extensions: { value: Array<Record<string, unknown>> }
    }
  }
  return app.setup({ applicationConfig: {} })
}

describe('extension registration', () => {
  it('declares the app identity', async () => {
    const { appInfo } = await load()

    expect(appInfo.id).toBe('ocphotos')
    expect(appInfo.name).toBe('Photos')
    expect(appInfo.icon).toBe('image')
  })

  // the host mounts app routes as `<appId>-<route name>`, so the open-with
  // target must be the prefixed name even though the route itself is declared bare
  it('registers open-with for both images and videos against a real route', async () => {
    const { appInfo, routes } = await load()
    const routeNames = routes.map((r) => r.name)

    expect(appInfo.extensions.map((e) => e.mimeType)).toEqual(['image', 'video'])
    for (const ext of appInfo.extensions) {
      expect(ext.routeName).toBe(`${appInfo.id}-photos-viewer`)
      expect(routeNames).toContain(ext.routeName.slice(appInfo.id.length + 1))
    }
  })

  it('redirects the app root to the timeline', async () => {
    const { routes } = await load()

    expect(routes[0]).toEqual(expect.objectContaining({ path: '/', redirect: '/ocphotos/timeline' }))
  })

  it('keeps the open-with route as the catch-all', async () => {
    const { routes } = await load()
    const last = routes[routes.length - 1]

    expect(last.name).toBe('photos-viewer')
    expect(last.path).toBe('/:driveAliasAndItem(.*)?')
  })

  it('protects every route behind the user auth context', async () => {
    const { routes } = await load()
    const real = routes.filter((r) => !r.redirect)

    expect(real.length).toBeGreaterThan(0)
    for (const route of real) {
      expect(route.path.startsWith('/')).toBe(true)
      expect(route.meta?.authContext).toBe('user')
      expect(route.name).toMatch(/^photos-/)
    }
  })

  it('exposes a navigation entry per view, all under the app path', async () => {
    const { navItems } = await load()

    expect(navItems.map((n) => n.route.path)).toEqual([
      '/ocphotos/timeline',
      '/ocphotos/memories',
      '/ocphotos/explore',
      '/ocphotos/albums',
      '/ocphotos/places',
      '/ocphotos/tags',
      '/ocphotos/duplicates',
      '/ocphotos/archive',
      '/ocphotos/folders',
      '/ocphotos/map',
      '/ocphotos/favorites'
    ])
  })

  it('registers a single app menu item in the app switcher', async () => {
    const { extensions } = await load()

    expect(extensions.value).toHaveLength(1)
    expect(extensions.value[0]).toEqual(
      expect.objectContaining({
        id: 'app.ocphotos.menuItem',
        type: 'appMenuItem',
        path: 'ocphotos'
      })
    )
  })
})
