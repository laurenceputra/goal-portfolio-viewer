export const SyncContracts = Object.freeze({
  userIds: Object.freeze({
    primary: 'user-1',
    owner: 'owner-user',
    other: 'other-user',
    login: 'login-user',
    refresh: 'refresh-user',
    payload: 'payload-user',
    route: 'route-user',
    rateLimit: 'limit-user',
    testerEmail: 'tester@example.com'
  }),
  kvKeys: Object.freeze({
    syncUserPrefix: 'sync_user:',
    syncUser(userId) {
      return `sync_user:${userId}`;
    },
    rateLimit(ipOrUser, pathTemplate, method) {
      return `ratelimit:${ipOrUser}:${pathTemplate}:${method}`;
    }
  }),
  routes: Object.freeze({
    syncPathTemplate: '/sync/:userId'
  })
});
