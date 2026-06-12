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
    type: 'app.navigation/href',
    properties: {
      id: 'data-hub-admin',
      title: 'Manage catalogs & users',
      href: '/data-hub/admin',
      section: 'data-hub',
      path: '/data-hub/admin/*',
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
      path: '/data-hub/admin/*',
      component: () => import('./DataHubAdminWrapper'),
    },
  },
  {
    type: 'app.navigation/href',
    properties: {
      id: 'data-hub-permissions',
      title: 'Manage permissions',
      href: '/data-hub/permissions',
      section: 'data-hub',
      path: '/data-hub/permissions/*',
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
    type: 'app.navigation/href',
    properties: {
      id: 'data-hub-apps',
      title: 'Registered apps',
      href: '/data-hub/apps',
      section: 'data-hub',
      path: '/data-hub/apps/*',
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
