export default {
  apiPrefix: '/api/v1',
  swagger: {
    path: '/api/docs',
    spec: 'openapi.json',
  },
  auth: {
    path: '/auth',
    login: '/login',
    logout: '/logout',
    changePassword: '/password',
    register: '/register',
  },
  pageProcessing: {
    path: '/page-processing',
  },
  shopifytest: {
    path: '/shopify-test',
  },
  shopifytestuser: {
    path: '/shopify-test-user',
  },
  user: {
    path: '/user',
  },
  site: {
    path: '/'
  }
};
