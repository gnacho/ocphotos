import {
  defineWebApplication,
  ApplicationSetupOptions,
  Extension,
  AppMenuItemExtension,
  AppNavigationItem
} from '@opencloud-eu/web-pkg'
import { urlJoin } from '@opencloud-eu/web-client'
import '@opencloud-eu/extension-sdk/tailwind.css'
import { RouteRecordRaw } from 'vue-router'
import { computed } from 'vue'
import { useGettext } from 'vue3-gettext'
import translations from '../l10n/translations.json'

export default defineWebApplication({
  setup(args) {
    const { $gettext } = useGettext()

    const appInfo = {
      id: 'ocphotos',
      name: $gettext('Photos'),
      icon: 'image',
      color: '#0ea5e9',
      // "Abrir con" en Files para imágenes y vídeos. routeName va prefijado con
      // el appId por el host, así que aquí se declara el nombre ya prefijado.
      extensions: [
        {
          mimeType: 'image',
          routeName: 'ocphotos-photos-viewer',
          label: $gettext('Photos')
        },
        {
          mimeType: 'video',
          routeName: 'ocphotos-photos-viewer',
          label: $gettext('Photos')
        }
      ]
    }

    const routes: RouteRecordRaw[] = [
      {
        path: '/',
        redirect: `/${appInfo.id}/timeline`
      },
      {
        path: '/timeline',
        name: 'photos-timeline',
        component: () => import('./views/TimelineView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Photos')
        }
      },
      {
        path: '/memories',
        name: 'photos-memories',
        component: () => import('./views/MemoriesView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('On this day')
        }
      },
      {
        path: '/explore',
        name: 'photos-explore',
        component: () => import('./views/ExploreView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Explore')
        }
      },
      {
        path: '/albums',
        name: 'photos-albums',
        component: () => import('./views/AlbumsView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Albums')
        }
      },
      {
        path: '/places',
        name: 'photos-places',
        component: () => import('./views/PlacesView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Places')
        }
      },
      {
        path: '/archive',
        name: 'photos-archive',
        component: () => import('./views/ArchiveView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Archive')
        }
      },
      {
        path: '/duplicates',
        name: 'photos-duplicates',
        component: () => import('./views/DuplicatesView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Duplicates')
        }
      },
      {
        path: '/tags',
        name: 'photos-tags',
        component: () => import('./views/TagsView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Tags')
        }
      },
      {
        path: '/folders',
        name: 'photos-folders',
        component: () => import('./views/FoldersView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Folders')
        }
      },
      {
        path: '/map',
        name: 'photos-map',
        component: () => import('./views/MapView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Map')
        }
      },
      {
        path: '/favorites',
        name: 'photos-favorites',
        component: () => import('./views/FavoritesView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Favorites')
        }
      },
      {
        // destino de "Abrir con" (Files): recibe el fichero por ruta y fileId
        path: '/:driveAliasAndItem(.*)?',
        name: 'photos-viewer',
        component: () => import('./views/FileOpenView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Photos')
        }
      }
    ]

    // Navegación en el sidebar IZQUIERDO nativo del host (como Files/News/Notes)
    const navItems: AppNavigationItem[] = [
      {
        name: $gettext('Photos'),
        icon: 'image',
        route: { path: `/${appInfo.id}/timeline` },
        priority: 10
      },
      {
        name: $gettext('On this day'),
        icon: 'calendar',
        route: { path: `/${appInfo.id}/memories` },
        priority: 20
      },
      {
        name: $gettext('Explore'),
        icon: 'apps-2',
        route: { path: `/${appInfo.id}/explore` },
        priority: 30
      },
      {
        name: $gettext('Albums'),
        icon: 'album',
        route: { path: `/${appInfo.id}/albums` },
        priority: 35
      },
      {
        name: $gettext('Places'),
        icon: 'map-pin',
        route: { path: `/${appInfo.id}/places` },
        priority: 40
      },
      {
        name: $gettext('Tags'),
        icon: 'price-tag-3',
        route: { path: `/${appInfo.id}/tags` },
        priority: 42
      },
      {
        name: $gettext('Duplicates'),
        icon: 'file-copy-2',
        route: { path: `/${appInfo.id}/duplicates` },
        priority: 43
      },
      {
        name: $gettext('Archive'),
        icon: 'archive-2',
        route: { path: `/${appInfo.id}/archive` },
        priority: 47
      },
      {
        name: $gettext('Folders'),
        icon: 'folder',
        route: { path: `/${appInfo.id}/folders` },
        priority: 44
      },
      {
        name: $gettext('Map'),
        icon: 'map-2',
        route: { path: `/${appInfo.id}/map` },
        priority: 45
      },
      {
        name: $gettext('Favorites'),
        icon: 'heart',
        route: { path: `/${appInfo.id}/favorites` },
        priority: 50
      }
    ]

    const extensions = ({ applicationConfig }: ApplicationSetupOptions) => {
      return computed<Extension[]>(() => {
        // NOTA F3(c): los metadatos de la foto (EXIF/tags/álbumes) se muestran en
        // un panel lateral PROPIO (PhotoDetailsPanel.vue, dentro de ViewerOverlay),
        // no vía el extension point `sidebarPanel`. Motivo: `sidebarPanel` solo lo
        // consume la sidebar derecha de Files (id "global.files.sidebar", ver
        // FileSideBar en @opencloud-eu/web-pkg) y su contexto son recursos WebDAV
        // (space/currentFolder/selectedResources), no el asset de la app. Para
        // usarlo haría falta resolver path DAV -> id de asset, que es justo lo que
        // aportará el endpoint pendiente GET /api/assets/resolve.
        //
        // Migración (cuando exista /api/assets/resolve): añadir aquí un
        // SidebarPanelExtension cuyo `panel.component` sea PhotoDetailsPanel y cuyo
        // `panel.componentAttrs` resuelva `items[0]` (WebDAV) a un Photo con
        // resolveFromFiles() y lo pase como prop `photo`.
        const menuItems: AppMenuItemExtension[] = [
          {
            // registra la app en el conmutador de aplicaciones
            id: `app.${appInfo.id}.menuItem`,
            type: 'appMenuItem',
            label: () => appInfo.name,
            color: appInfo.color,
            icon: appInfo.icon,
            path: urlJoin(appInfo.id)
          }
        ]
        return [...menuItems]
      })
    }

    return {
      appInfo,
      routes,
      navItems,
      translations,
      extensions: extensions(args)
    }
  }
})
