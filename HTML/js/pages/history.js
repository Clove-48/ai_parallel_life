/**
 * 历史记录页 — 查看过往的平行人生故事
 * 支持从后端 API 同步 + 本地 localStorage 缓存
 */
const HistoryPage = {
  /** 是否正在从后端加载 */
  _loading: false,

  async render() {
    let stories = Store.getStories();

    // 如果本地没有故事，尝试从后端加载
    if (stories.length === 0 && !this._loading) {
      this._loading = true;
      // 先显示加载状态
      const loadingHtml = `
      <div class="page page-history">
        <div class="history-header">
          <button class="back-btn" id="history-back">←</button>
          <h2>历史记录</h2>
        </div>
        <div class="history-empty">
          <div class="empty-icon">⏳</div>
          <p>正在同步云端记录…</p>
        </div>
      </div>`;
      // 异步加载
      try {
        const remoteStories = await API.fetchStories();
        if (remoteStories && remoteStories.length > 0) {
          Store.saveStories(remoteStories);
          stories = remoteStories;
        }
      } catch { /* ignore */ }
      this._loading = false;
      // 如果加载到了数据，触发重新渲染
      if (stories.length > 0) {
        Router.refresh();
        return '';
      }
      return loadingHtml;
    }

    if (stories.length === 0) {
      return `
      <div class="page page-history">
        <div class="history-header">
          <button class="back-btn" id="history-back">←</button>
          <h2>历史记录</h2>
        </div>
        <div class="history-empty">
          <div class="empty-icon">📖</div>
          <p>还没有生成过平行人生</p>
          <p class="empty-sub">去创造属于你的"如果当初"吧</p>
          <button class="btn-primary" id="empty-start">开始体验 →</button>
        </div>
      </div>`;
    }

    return `
    <div class="page page-history">
      <div class="history-header">
        <button class="back-btn" id="history-back">←</button>
        <h2>历史记录</h2>
        <span style="font-size:0.8rem;color:var(--muted);margin-left:auto;">共 ${stories.length} 条</span>
      </div>
      <div class="history-list" id="history-list">
        ${stories.map((s, i) => `
          <div class="history-item" data-id="${s.id}" data-pending="${s._pending ? 'true' : 'false'}" style="animation-delay:${i * 0.05}s">
            <div class="history-item-icon">🪞</div>
            <div class="history-item-info">
              <h4>${s.title || (typeof s === 'string' ? s : '平行人生')}</h4>
              <p>${Helpers.formatDate(s.createdAt)}</p>
            </div>
            <button class="delete-btn" data-id="${s.id}" title="删除这条记录" aria-label="删除">
              <span class="delete-btn-icon">🗑</span>
              <span class="delete-btn-label">删除</span>
            </button>
          </div>
        `).join('')}
      </div>
    </div>`;
  },

  mount() {
    document.getElementById('history-back').onclick = () => Router.goBack('');

    const emptyBtn = document.getElementById('empty-start');
    if (emptyBtn) {
      emptyBtn.onclick = () => {
        Store.resetSession();
        Router.navigate('chat');
      };
    }

    // 点击故事项跳转（排除点中删除按钮的情况）
    document.querySelectorAll('.history-item').forEach(item => {
      item.onclick = (e) => {
        if (e.target.closest('.delete-btn')) return;
        const id = item.dataset.id;
        // pending 记录是本地的（仅占位），后端不存在该 story，
        // 直接跳到聊天页恢复会话，不要走 timeline（避免无意义的 fetch 404 + ERR_ABORTED 噪声）
        if (item.dataset.pending === 'true') {
          const story = Store.getStories().find(s => s.id === id);
          if (story && story._chatSession) {
            Store.saveChatSession(story._chatSession);
          }
          Router.navigate('chat');
        } else {
          Router.navigate(`timeline/${id}`);
        }
      };
    });

    // 删除故事 — 用自定义确认弹窗（更可靠，不依赖浏览器 confirm）
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        e.preventDefault();
        const id = btn.dataset.id;
        if (!id) return;
        const ok = await this._confirmDelete(btn);
        if (!ok) return;

        try {
          // 本地删除（同步、立即生效）
          Store.deleteStory(id);
        } catch (err) {
          console.warn('local delete failed:', err);
        }
        // 尝试在后端也删除（不阻塞，失败也无所谓）
        try {
          await API.deleteStory(id);
        } catch { /* ignore */ }
        // 从 DOM 中移除该 item（更平滑，避免整页刷新闪烁）
        const item = btn.closest('.history-item');
        if (item) {
          item.style.transition = 'all 0.3s ease';
          item.style.opacity = '0';
          item.style.transform = 'translateX(20px)';
          setTimeout(() => {
            item.remove();
            // 检查是否已空
            const list = document.getElementById('history-list');
            if (list && list.children.length === 0) {
              Router.refresh();
            }
            // 顶部计数更新
            const countEl = document.querySelector('.history-header span');
            if (countEl) {
              const remain = list ? list.children.length : 0;
              countEl.textContent = remain > 0 ? `共 ${remain} 条` : '';
            }
          }, 300);
        } else {
          Router.refresh();
        }
      };
    });
  },

  /**
   * 自定义删除确认弹窗 — 比浏览器 confirm 更可靠，体验更好
   * @returns {Promise<boolean>}
   */
  _confirmDelete(btn) {
    return new Promise((resolve) => {
      // 移除已有的弹窗
      const existing = document.getElementById('history-confirm-modal');
      if (existing) existing.remove();

      const modal = document.createElement('div');
      modal.id = 'history-confirm-modal';
      modal.className = 'history-confirm-modal';
      modal.innerHTML = `
        <div class="history-confirm-backdrop"></div>
        <div class="history-confirm-card" role="dialog" aria-modal="true">
          <div class="history-confirm-icon">🗑️</div>
          <div class="history-confirm-title">删除这条记录？</div>
          <div class="history-confirm-sub">删除后无法恢复，确认吗？</div>
          <div class="history-confirm-actions">
            <button class="history-confirm-cancel" type="button">取消</button>
            <button class="history-confirm-ok" type="button">删除</button>
          </div>
        </div>
      `;
      document.body.appendChild(modal);
      // 触发动画
      requestAnimationFrame(() => modal.classList.add('show'));

      const cleanup = (val) => {
        modal.classList.remove('show');
        setTimeout(() => {
          if (modal.parentNode) modal.parentNode.removeChild(modal);
        }, 200);
        resolve(val);
      };
      modal.querySelector('.history-confirm-cancel').onclick = () => cleanup(false);
      modal.querySelector('.history-confirm-ok').onclick = () => cleanup(true);
      modal.querySelector('.history-confirm-backdrop').onclick = () => cleanup(false);
      // ESC 关闭 = 取消
      const onKey = (e) => {
        if (e.key === 'Escape') {
          document.removeEventListener('keydown', onKey);
          cleanup(false);
        }
      };
      document.addEventListener('keydown', onKey);
    });
  },

  unmount() {
    this._loading = false;
  }
};