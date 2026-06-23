/**
 * AI 平行人生 — Hash 路由管理器
 * 简约 SPA 路由，支持页面生命周期
 */

const Router = (() => {
  /** 路由表: hash -> { render, mount, unmount } */
  const routes = new Map();

  /** 当前页面实例 */
  let currentPage = null;
  let currentHash = '';

  /** 注册路由 */
  function register(hash, page) {
    routes.set(hash, page);
  }

  /** 解析当前 hash */
  function getHash() {
    const raw = location.hash.replace(/^#\/?/, '');
    const parts = raw.split('/').filter(Boolean);
    return {
      path: '/' + (parts[0] || ''),
      params: parts.slice(1),
      full: raw,
    };
  }

  /** 导航到指定路由 */
  function navigate(hash) {
    location.hash = hash;
  }

  /** 返回上一页（如果有过历史） */
  function goBack(fallback = '') {
    if (window.history.length > 1) {
      window.history.back();
      // 兜底：等 200ms 后 hash 还没变就回 fallback
      const startHash = location.hash;
      setTimeout(() => {
        if (location.hash === startHash) {
          navigate(fallback);
        }
      }, 200);
    } else {
      navigate(fallback);
    }
  }

  /** 处理路由变化 */
  async function handleRoute() {
    const { path, params, full } = getHash();

    // 查找匹配路由
    let matched = null;
    for (const [pattern, page] of routes) {
      if (pattern === path) {
        matched = page;
        break;
      }
    }

    if (!matched) {
      // 默认重定向到首页
      navigate('');
      return;
    }

    // 卸载当前页面
    if (currentPage && currentPage.unmount) {
      currentPage.unmount();
    }

    currentHash = full;
    currentPage = matched;
    const app = document.getElementById('app');

    // 渲染新页面
    if (matched.render) {
      const html = await matched.render(params);
      app.innerHTML = html;
    }

    // 挂载新页面
    if (matched.mount) {
      matched.mount(params);
    }

    // 滚动到顶部
    window.scrollTo(0, 0);
  }

  /** 初始化路由 */
  function init() {
    window.addEventListener('hashchange', handleRoute);
    // 首次渲染：无论有没有 hash，都执行一次路由处理
    handleRoute();
  }

  /** 获取当前路由参数 */
  function getParams() {
    return getHash().params;
  }

  return {
    register,
    navigate,
    goBack,
    init,
    refresh: handleRoute,
    getParams,
    get currentHash() { return currentHash; },
  };
})();