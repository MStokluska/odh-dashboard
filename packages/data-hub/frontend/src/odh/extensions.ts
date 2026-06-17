import type {
  NavExtension,
  RouteExtension,
  AreaExtension,
} from '@odh-dashboard/plugin-core/extension-points';

const DATA_HUB = 'data-hub';

const extensions: (NavExtension | RouteExtension | AreaExtension)[] = [
  {
    type: 'app.navigation/section',
    properties: {
      id: 'data-hub',
      title: 'Data Hub',
      group: '4_data_hub',
      iconRef: () => import('./DataHubNavIcon'),
    },
  },
  {
    type: 'app.navigation/href',
    properties: {
      id: 'data-hub-view',
      title: 'Browse catalogs',
      href: '/data-hub/main-view',
      section: 'data-hub',
      path: '/data-hub/main-view/*',
    },
  },
  {
    type: 'app.route',
    properties: {
      path: '/data-hub/main-view/*',
      component: () => import('./DataHubWrapper'),
    },
  },
  {
    type: 'app.route',
    properties: {
      path: '/data-hub/permissions/*',
      component: () => import('./DataHubPermissionsWrapper'),
    },
  },
  {
    type: 'app.route',
    properties: {
      path: '/data-hub/apps/*',
      component: () => import('./DataHubAppsWrapper'),
    },
  },
];

export default extensions;
