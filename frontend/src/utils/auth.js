// 令牌存取（仅 token；绝不存密码）
const K_ACCESS = 'cw_access';
const K_REFRESH = 'cw_refresh';
const K_ACCOUNT = 'cw_remember_account';

export const tokenStorage = {
  getAccess: () => localStorage.getItem(K_ACCESS),
  getRefresh: () => localStorage.getItem(K_REFRESH),
  set(access, refresh) {
    if (access) localStorage.setItem(K_ACCESS, access);
    if (refresh) localStorage.setItem(K_REFRESH, refresh);
  },
  clear() {
    localStorage.removeItem(K_ACCESS);
    localStorage.removeItem(K_REFRESH);
  },
};

// 「记住账号」只记账号
export const accountStorage = {
  get: () => localStorage.getItem(K_ACCOUNT) || '',
  set: (v) => (v ? localStorage.setItem(K_ACCOUNT, v) : localStorage.removeItem(K_ACCOUNT)),
};
