import {
  defineWebApplication,
  ApplicationSetupOptions,
  Extension,
  AppMenuItemExtension
} from '@opencloud-eu/web-pkg'
import { urlJoin } from '@opencloud-eu/web-client'
import '@opencloud-eu/extension-sdk/tailwind.css'
import { RouteRecordRaw } from 'vue-router'
import { computed } from 'vue'
import { useGettext } from 'vue3-gettext'

export default defineWebApplication({
  setup(args) {
    const { $gettext } = useGettext()

    const appInfo = {
      id: 'ocphotos',
      name: $gettext('Photos'),
      icon: 'image',
      color: '#0ea5e9'
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
          title: $gettext('Timeline')
        }
      },
      {
        path: '/memories',
        name: 'photos-memories',
        component: () => import('./views/MemoriesView.vue'),
        meta: {
          authContext: 'user',
          title: $gettext('Memories')
        }
      }
    ]

    const extensions = ({ applicationConfig }: ApplicationSetupOptions) => {
      return computed<Extension[]>(() => {
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
      extensions: extensions(args)
    }
  }
})
