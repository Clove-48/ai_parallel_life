/**
 * 时间线展示页 — 双线叙事沉浸式浏览
 * 支持分屏滑动交互（拖拽分割线缩放两侧）
 */
const TimelinePage = {
  currentView: 'dual', // 'dual' | 'real' | 'parallel'
  storyId: null,

  async render(params) {
    const id = params[0];
    this.storyId = id;
    let story = Store.getStory(id);

    // pending 记录只存在于本地（后端没有该 story）
    // 不要去后端拉 — 否则会产生 404 + ERR_ABORTED 噪声
    if (story && story._pending) {
      return `<div class="page page-timeline"><div class="container" style="padding:4rem 2rem;text-align:center;color:var(--muted)">
        <p>这个故事还没生成完，回到聊天继续推演吧。</p>
        <button class="btn-primary" onclick="Router.navigate('chat')" style="margin-top:1rem;">回到聊天</button>
      </div></div>`;
    }

    // 本地没有 OR 本地数据不完整（缺 node）→ 主动从后端拉详情
    const needFetch = !story
      || !story.node
      || !Object.keys(story.node).length
      || !story.narratives
      || !(story.narratives.real || []).length;

    if (needFetch) {
      try {
        const remote = await API.fetchStory(id);
        if (remote) {
          const fullStory = {
            id: remote.id,
            createdAt: remote.createdAt,
            title: remote.title || '平行人生',
            node: remote.node || {},
            narratives: remote.narratives || { real: [], parallel: [] },
            reflection: remote.reflection || {},
            chatMessages: remote.chatMessages || [],
          };
          Store.addStory(fullStory);  // addStory 已按 id 去重
          story = fullStory;
        }
      } catch { /* ignore */ }
    }

    // 即使本地有 story，若 node.uploadedMedia 缺失，尝试拉远程补全
    if (story && (!story.node || !story.node.uploadedMedia || !story.node.uploadedMedia.length)) {
      try {
        const remote = await API.fetchStory(id);
        if (remote && remote.node && Array.isArray(remote.node.uploadedMedia) && remote.node.uploadedMedia.length) {
          // 仅补 uploadedMedia，不破坏本地其它数据
          const merged = {
            ...story,
            node: { ...(story.node || {}), uploadedMedia: remote.node.uploadedMedia },
          };
          Store.addStory(merged);
          story = merged;
        }
      } catch { /* ignore */ }
    }

    if (!story) {
      return `<div class="page page-timeline"><div class="container" style="padding:4rem 2rem;text-align:center;color:var(--muted)"><p>故事未找到</p><button class="btn-primary" onclick="Router.navigate('')">返回首页</button></div></div>`;
    }

    const title = story.title || '平行人生';
    const narratives = story.narratives;

    return `
    <div class="page page-timeline">
      <div class="timeline-header">
        <button class="back-btn" id="tl-back">←</button>
        <h2>${title}</h2>
        <div class="timeline-toggle" id="tl-toggle">
          <button class="toggle-btn active" data-line="dual" id="toggle-dual">双线</button>
          <button class="toggle-btn" data-line="real" id="toggle-real">真实</button>
          <button class="toggle-btn" data-line="parallel" id="toggle-parallel">平行</button>
        </div>
      </div>
      <div class="timeline-content" id="tl-content">
        ${this._renderTimeline(narratives, 'dual')}
      </div>
      ${this._renderChatSection(story)}
    </div>`;
  },

  /** 渲染聊天记录回看区（折叠样式）
   * 老数据没有 chatMessages 字段时，用 node（用户原始输入）做降级展示
   *
   * 用户消息中可能包含 attachments（图片/音频），需要在回看中展示，
   * 否则聊天记录会"空一块"内容
   */
  _renderChatSection(story) {
    const messages = (story && story.chatMessages) || [];
    if (messages.length) {
      // 渲染每条消息；用户消息的 attachments 也要展示（图片/音频）
      const renderedMessages = messages.map(m => {
        const role = m.role === 'assistant' ? 'ai' : m.role;
        const avatar = role === 'ai' ? '✦' : '☾';
        let bubbleInner;
        if (role === 'user') {
          // 用户消息：文字 + 附件（图片/音频）
          const text = m.content ? this._escapeHtml(m.content) : '';
          const attachments = Array.isArray(m.attachments) ? m.attachments : [];
          const mediaHtml = attachments
            .filter(a => a && a.url)
            .map(a => this._renderChatAttachment(a))
            .join('');
          bubbleInner = `${text.replace(/\n/g, '<br>')}${mediaHtml}`;
        } else {
          // AI 消息：纯文字
          bubbleInner = this._escapeHtml(m.content || '').replace(/\n/g, '<br>');
        }
        return `
          <div class="chat-history-msg ${role}">
            <div class="chat-history-avatar">${avatar}</div>
            <div class="chat-history-bubble">${bubbleInner}</div>
          </div>
        `;
      }).join('');
      return `
        <div class="chat-history-section" id="chat-history-section">
          <button class="chat-history-toggle" id="chat-history-toggle">
            <span class="chat-history-icon">💬</span>
            <span>查看当时的对话记录（${messages.length} 条）</span>
            <span class="chat-history-arrow">▾</span>
          </button>
          <div class="chat-history-body" id="chat-history-body" style="display:none">
            <div class="chat-history-list">
              ${renderedMessages}
            </div>
          </div>
        </div>
      `;
    }
    // 老数据降级：用 node 里的字段拼一份"输入摘要"
    const node = (story && story.node) || {};
    const hasNode = node && (node.time || node.location || node.choiceA || node.choiceB || node.actualChoice || node.actualOutcome || node.imagination);
    if (!hasNode) return '';
    const row = (label, val) => val ? `
      <div class="chat-history-node-row">
        <span class="chat-history-node-label">${this._escapeHtml(label)}</span>
        <span class="chat-history-node-val">${this._escapeHtml(val)}</span>
      </div>
    ` : '';
    return `
      <div class="chat-history-section" id="chat-history-section">
        <button class="chat-history-toggle" id="chat-history-toggle">
          <span class="chat-history-icon">📝</span>
          <span>查看当时的关键信息</span>
          <span class="chat-history-arrow">▾</span>
        </button>
        <div class="chat-history-body" id="chat-history-body" style="display:none">
          <div class="chat-history-node">
            <div class="chat-history-node-title">你讲述的关键节点</div>
            ${row('时间', node.time)}
            ${row('地点', node.location)}
            ${row('选择 A', node.choiceA)}
            ${row('选择 B', node.choiceB)}
            ${row('真实选择', node.actualChoice)}
            ${row('真实结果', node.actualOutcome)}
            ${row('平行想象', node.imagination)}
            <div class="chat-history-node-hint">💡 推演前的对话详情未持久化，仅保留关键输入</div>
          </div>
        </div>
      </div>
    `;
  },

  /**
   * 渲染一条聊天附件（图片/音频）— 聊天记录回看用
   * 复用 chat.js 的展示样式，结构与 _addAttachmentMessage 保持一致
   */
  _renderChatAttachment(att) {
    if (!att || !att.url) return '';
    if (att.type === 'image') {
      const src = this._escapeHtml(this._mediaUrl(att.url));
      const name = this._escapeHtml(att.filename || '图片');
      return `<div class="msg-attach msg-attach-image chat-history-attach"><img src="${src}" alt="${name}" loading="lazy" crossorigin="anonymous" onerror="this.parentNode.classList.add('img-failed');this.style.display='none'"></div>`;
    }
    if (att.type === 'audio') {
      const src = this._escapeHtml(this._mediaUrl(att.url));
      return `<div class="msg-attach msg-attach-audio chat-history-attach"><span class="msg-attach-icon">🎵</span><span class="msg-attach-name">${this._escapeHtml(att.filename || '语音')}</span><audio src="${src}" controls preload="none" crossorigin="anonymous"></audio></div>`;
    }
    return '';
  },

  /** 把后端相对路径（/uploads/...）转成可访问的绝对 URL */
  _mediaUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const apiBase = (window.API && window.API.BASE_URL) || 'http://localhost:8000/api';
    const fileBase = apiBase.replace(/\/api\/?$/, '');
    return `${fileBase}${url}`;
  },

  /** HTML 转义 */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(String(text || '')));
    return div.innerHTML;
  },

  mount(params) {
    const id = params[0];
    this.storyId = id;

    // "故事未找到" 等异常模板下，#tl-back 等元素可能不存在 — 全部 null-check 绑事件
    const tlBack = document.getElementById('tl-back');
    if (tlBack) tlBack.onclick = () => Router.goBack('');

    // 绑定"查看感悟卡片"按钮
    this._bindCardButton();

    // 绑定"查看对话记录"折叠按钮
    this._bindChatHistoryToggle();

    // 视图切换
    const toggleBtns = document.querySelectorAll('.toggle-btn');
    toggleBtns.forEach(btn => {
      btn.onclick = () => {
        toggleBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const view = btn.dataset.line;
        this.currentView = view;
        const story = Store.getStory(this.storyId);
        if (story) {
          document.getElementById('tl-content').innerHTML = this._renderTimeline(story.narratives, view);
          this._bindCardButton();
          if (view === 'dual') {
            this._initDrag();
          }
        }
      };
    });

    // 初始绑定拖动
    if (this.currentView === 'dual') {
      this._initDrag();
    }
  },

  /** 绑定对话记录折叠按钮 */
  _bindChatHistoryToggle() {
    const toggle = document.getElementById('chat-history-toggle');
    if (!toggle) return;
    toggle.onclick = () => {
      const body = document.getElementById('chat-history-body');
      const arrow = toggle.querySelector('.chat-history-arrow');
      if (!body) return;
      const expanded = body.style.display !== 'none';
      body.style.display = expanded ? 'none' : 'block';
      if (arrow) arrow.textContent = expanded ? '▾' : '▴';
      toggle.classList.toggle('expanded', !expanded);
    };
  },

  /** 绑定感悟卡按钮事件 */
  _bindCardButton() {
    const btn = document.getElementById('tl-to-card');
    if (btn) {
      btn.onclick = () => Router.navigate(`card/${this.storyId}`);
    }
  },

  /** 初始化分割线拖动 */
  _initDrag() {
    const dual = document.querySelector('.timeline-dual');
    if (!dual) return;

    // 移除旧 handle
    const old = dual.querySelector('.divider-handle');
    if (old) old.remove();

    // 创建拖动柄
    const handle = document.createElement('div');
    handle.className = 'divider-handle';
    dual.appendChild(handle);

    const cols = dual.querySelectorAll('.timeline-col');
    if (cols.length < 2) return;

    let isDragging = false;
    let startX = 0;
    let startFlex = [1, 1];

    const onStart = (e) => {
      isDragging = true;
      dual.classList.add('dragging');
      startX = e.clientX || e.touches[0].clientX;
      startFlex = [1, 1];
      // 读取当前 flex 值
      const col0 = window.getComputedStyle(cols[0]).flex;
      const col1 = window.getComputedStyle(cols[1]).flex;
      if (col0 && col1) {
        const f0 = parseFloat(col0) || 1;
        const f1 = parseFloat(col1) || 1;
        startFlex = [f0, f1];
      }
    };

    const onMove = (e) => {
      if (!isDragging) return;
      e.preventDefault();
      const currentX = e.clientX || e.touches[0].clientX;
      const dx = currentX - startX;
      const containerWidth = dual.offsetWidth;

      // 限制范围：每侧最小 20%，最大 80%
      const delta = dx / containerWidth;
      let flex0 = startFlex[0] + delta * 2;
      let flex1 = startFlex[1] - delta * 2;

      // 确保 flex 值在 [0.25, 4] 之间
      flex0 = Math.max(0.25, Math.min(4, flex0));
      flex1 = Math.max(0.25, Math.min(4, flex1));

      // 保持总 flex 不变
      const total = flex0 + flex1;
      cols[0].style.flex = `${flex0 / total}`;
      cols[1].style.flex = `${flex1 / total}`;
    };

    const onEnd = () => {
      if (!isDragging) return;
      isDragging = false;
      dual.classList.remove('dragging');
    };

    handle.addEventListener('mousedown', onStart);
    handle.addEventListener('touchstart', onStart, { passive: true });

    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onEnd);
    document.addEventListener('touchmove', onMove, { passive: false });
    document.addEventListener('touchend', onEnd);

    // 清理函数（页面卸载时）
    this._dragCleanup = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onEnd);
      document.removeEventListener('touchmove', onMove);
      document.removeEventListener('touchend', onEnd);
    };
  },

  _renderTimeline(narratives, view) {
    if (!narratives) return '<p style="text-align:center;color:var(--muted);padding:2rem;">暂无叙事数据</p>';

    const real = narratives.real || [];
    const parallel = narratives.parallel || [];

    // 获取用户上传的媒体
    // 优先从 store 当前 story 取，缺失时再 fetch 一次（避免跨设备/多标签页的数据漂移）
    let story = Store.getStory(this.storyId);
    let mediaList = [];
    if (story && story.node) {
      mediaList = story.node.uploadedMedia || [];
    }

    // 如果本地没有 uploadedMedia 字段，尝试从原始 userInput 中找
    if ((!mediaList || mediaList.length === 0) && story && story.userInput) {
      mediaList = story.userInput.uploadedMedia || [];
    }

    // 用户上传了素材时，从"选择的语境"里取一句场景作为图注上下文
    const userNote = (story && story.node && (story.node.location || story.node.time)) || '';

    if (view === 'dual') {
      // 重置真实线图片轮询状态（确保多张图按顺序分配到 photo 卡片）
      CardFactory.resetRealMediaBinding();
      return `
      <div class="timeline-dual">
        <div class="timeline-col">
          <div class="timeline-col-header">
            <span class="dot real"></span>
            <h3 style="color:var(--real-color)">真实之路</h3>
          </div>
          ${real.map((c, i) => CardFactory.render(c, i, 'real', mediaList)).join('')}
          ${real.length === 0 ? '<p style="color:var(--muted);font-size:0.9rem;">暂无内容</p>' : ''}
        </div>
        <div class="timeline-col">
          <div class="timeline-col-header">
            <span class="dot parallel"></span>
            <h3 style="color:var(--parallel-color)">平行时空</h3>
          </div>
          ${parallel.map((c, i) => CardFactory.render(c, i, 'parallel', mediaList)).join('')}
          ${parallel.length === 0 ? '<p style="color:var(--muted);font-size:0.9rem;">暂无内容</p>' : ''}
        </div>
      </div>
      <div style="text-align:center;margin-top:2rem;padding-bottom:2rem;">
        <button class="btn-primary" id="tl-to-card">查看感悟卡片 →</button>
      </div>`;
    }

    const data = view === 'real' ? real : parallel;
    const color = view === 'real' ? 'var(--real-color)' : 'var(--parallel-color)';
    const label = view === 'real' ? '真实之路' : '平行时空';

    // 单线视图：重置轮询，避免上次的索引残留
    CardFactory.resetRealMediaBinding();

    return `
    <div class="timeline-single">
      <div class="timeline-col-header">
        <span class="dot ${view}" style="background:${color}"></span>
        <h3 style="color:${color}">${label}</h3>
      </div>
      ${data.map((c, i) => CardFactory.render(c, i, view, mediaList)).join('')}
      ${data.length === 0 ? '<p style="color:var(--muted);font-size:0.9rem;">暂无内容</p>' : ''}
    </div>
    <div style="text-align:center;margin-top:2rem;padding-bottom:2rem;">
      <button class="btn-primary" id="tl-to-card">查看感悟卡片 →</button>
    </div>`;
  },

  unmount() {
    if (this._dragCleanup) {
      this._dragCleanup();
      this._dragCleanup = null;
    }
  }
};