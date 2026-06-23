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
          <div class="history-item" data-id="${s.id}" style="animation-delay:${i * 0.05}s">
            <div class="history-item-icon">🪞</div>
            <div class="history-item-info">
              <h4>${s.title || (typeof s === 'string' ? s : '平行人生')}</h4>
              <p>${Helpers.formatDate(s.createdAt)}</p>
            </div>
            <button class="delete-btn" data-id="${s.id}" title="删除">🗑</button>
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

    // 点击故事项跳转
    document.querySelectorAll('.history-item').forEach(item => {
      item.onclick = (e) => {
        if (e.target.closest('.delete-btn')) return;
        const id = item.dataset.id;
        Router.navigate(`timeline/${id}`);
      };
    });

    // 删除故事
    document.querySelectorAll('.delete-btn').forEach(btn => {
      btn.onclick = async (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        if (!confirm('确定删除这条记录吗？')) return;

        // 本地删除
        Store.deleteStory(id);

        // 尝试在后端也删除（不阻塞）
        try {
          await API.deleteStory(id);
        } catch { /* ignore */ }

        // 重新渲染页面
        Router.refresh();
      };
    });
  },

  unmount() {
    this._loading = false;
  }
};