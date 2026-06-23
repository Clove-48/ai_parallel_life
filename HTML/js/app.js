/**
 * AI 平行人生 — 应用入口
 * 初始化路由，注册所有页面，每次都先播放入场动画再显示首页
 */
(function () {
  'use strict';

  // ─── 全局 Toast 通知 ──────────────────────────────────

  window.GlobalToast = {
    _timer: null,
    show(msg, type = 'info', duration = 3000) {
      // 移除旧 toast
      const old = document.querySelector('.global-toast');
      if (old) old.remove();
      if (this._timer) clearTimeout(this._timer);

      const el = document.createElement('div');
      el.className = `global-toast toast-${type}`;
      el.textContent = msg;
      document.body.appendChild(el);

      // 触发动画
      requestAnimationFrame(() => el.classList.add('show'));

      this._timer = setTimeout(() => {
        el.classList.remove('show');
        setTimeout(() => { if (el.parentNode) el.remove(); }, 300);
      }, duration);
    },
    success(msg) { this.show(msg, 'success', 2500); },
    error(msg) { this.show(msg, 'error', 4000); },
    warning(msg) { this.show(msg, 'warning', 3000); },
  };

  // 全局未捕获错误处理
  window.addEventListener('error', (e) => {
    console.error('全局错误:', e.message);
    if (e.target === window) {
      window.GlobalToast.error('页面出现异常，请刷新重试');
    }
  });

  window.addEventListener('unhandledrejection', (e) => {
    console.error('未处理的 Promise 拒绝:', e.reason);
    // 静默处理，避免干扰用户
  });

  // 注册路由
  Router.register('/', HomePage);
  Router.register('/chat', ChatPage);
  Router.register('/generating', GeneratingPage);
  Router.register('/timeline', TimelinePage);
  Router.register('/card', CardPage);
  Router.register('/history', HistoryPage);

  /** 启动时从后端同步历史记录到 localStorage
   *  - 解决 localStorage 被清空时历史记录"消失"的问题
   *  - 总是用后端完整数据补全本地缺失的字段
   */
  async function syncStoriesFromBackend() {
    try {
      const remoteList = await API.fetchStories();
      console.log('[sync] 后端故事列表：', remoteList.length, '条');
      if (!Array.isArray(remoteList) || remoteList.length === 0) return;
      const localStories = Store.getStories();
      const localById = new Map(localStories.map(s => [s.id, s]));
      let added = 0, updated = 0;
      for (const item of remoteList) {
        // 拉详情以拿到完整 narratives / reflection / chatMessages / node
        let remote = null;
        try {
          remote = await API.fetchStory(item.id);
        } catch (e) {
          console.warn('[sync] 拉取详情失败：', item.id, e.message);
          continue;
        }
        if (!remote) continue;
        // 转成前端 store 格式（确保每个字段都存在）
        const fullStory = {
          id: remote.id,
          createdAt: remote.createdAt || item.createdAt,
          title: remote.title || item.title || '平行人生',
          node: remote.node || {},
          narratives: remote.narratives || { real: [], parallel: [] },
          reflection: remote.reflection || {},
          chatMessages: remote.chatMessages || [],
        };
        const local = localById.get(fullStory.id);
        if (!local) {
          // 本地没有 → 添加完整数据
          Store.addStory(fullStory);
          added++;
        } else {
          // 本地有 → 用后端完整数据补全缺失字段
          // 注意：保留本地已有的非空数据（用户可能在本地有更新）
          const updates = {};
          if (!local.title && fullStory.title) updates.title = fullStory.title;
          if (!local.createdAt && fullStory.createdAt) updates.createdAt = fullStory.createdAt;
          // node / narratives / reflection：本地为空时用后端补全
          if (!local.node || !Object.keys(local.node).length) updates.node = fullStory.node;
          if (!local.narratives || !(local.narratives.real || []).length) updates.narratives = fullStory.narratives;
          if (!local.reflection || !Object.keys(local.reflection).length) updates.reflection = fullStory.reflection;
          // chatMessages：本地为空时用后端补全
          if (!(local.chatMessages || []).length && fullStory.chatMessages.length) {
            updates.chatMessages = fullStory.chatMessages;
          }
          if (Object.keys(updates).length) {
            Store.updateStory(fullStory.id, updates);
            updated++;
          }
        }
      }
      console.log(`[sync] 同步完成 — 新增 ${added} 条，更新 ${updated} 条`);
    } catch (e) {
      console.warn('[sync] 同步历史记录失败：', e.message);
    }
  }

  // 启动应用
  document.addEventListener('DOMContentLoaded', async () => {
    // 先异步从后端同步历史记录（不等完成，先开始播放动画）
    syncStoriesFromBackend();

    // 每次都播放入场动画（除非 URL 带 skip 参数）
    const url = new URL(window.location.href);
    const skipAnimation = url.searchParams.get('skip') === '1';

    if (!skipAnimation) {
      // 先播放入场动画，再初始化路由
      const app = document.getElementById('app');
      app.style.display = 'none';
      await EntryAnimation.play('你想回到哪个时刻？');
      app.style.display = '';
    }

    Router.init();
  });
})();