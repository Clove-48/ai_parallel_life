/**
 * 对话采集页 — AI 智能对话引导
 * 
 * 使用 LLM 驱动真实自然的对话，AI 根据用户回答实时调整问题。
 * 支持上传图片/音频，上传的内容会展示在时间线卡片中。
 * 后端不可用时自动降级到固定步骤模式。
 */
const ChatPage = {
  /** 对话历史 [{role, content}] */
  messages: [],
  /** 已提取的字段 */
  fields: {},
  /** 是否收集完成 */
  isComplete: false,
  /** 是否正在等待 AI 回复 */
  isWaiting: false,
  /** 是否为降级模式（后端不可用时） */
  isFallback: false,
  /** 降级模式步骤 — 后端不可用时的兜底文字 */
  _fallbackSteps: [
    { key: 'time', text: '嘿，你来啦～今天想聊点啥？有没有哪个瞬间你到现在还会想"如果当初……"？' },
    { key: 'location', text: '诶这个有意思，啥时候的事呀？' },
    { key: 'choice', text: '那时候在哪儿呢？' },
    { key: 'actual', text: '当时纠结啥？面临哪两个选择？' },
    { key: 'outcome', text: '那最后你选了哪个？' },
    { key: 'imagination', text: '那条路走得咋样，后悔过没？' },
  ],
  _fallbackStep: 0,
  _fallbackAnswers: {},
  /** 已上传的媒体文件 */
  uploadedMedia: [],

  render() {
    const stories = Store.getStories();
    return `
    <div class="page page-chat">
      <div class="chat-layout">
        <div class="chat-sidebar" id="chat-sidebar">
          <div class="sidebar-header">
            <span class="sidebar-title">📚 历史</span>
            <button class="sidebar-close" id="sidebar-close">×</button>
          </div>
          <div class="sidebar-list" id="sidebar-list">
            ${stories.length === 0
              ? '<div class="sidebar-empty">暂无记录</div>'
              : stories.slice(0, 10).map((s, i) => `
                <div class="sidebar-item${s._pending ? ' pending' : ''}" data-id="${s.id}" data-pending="${s._pending || false}" style="animation-delay:${i * 0.03}s">
                  <span>${s._pending ? '⏳' : '🪞'}</span>
                  <span>${s.title || '平行人生'}</span>
                </div>
              `).join('')
            }
          </div>
        </div>
        <div class="chat-main">
          <div class="chat-header">
            <button class="back-btn" id="chat-back">←</button>
            <button class="sidebar-toggle" id="sidebar-toggle">☰</button>
            <div>
              <h2>回忆时刻</h2>
              <div class="chat-subtitle">像朋友聊天一样，慢慢说</div>
            </div>
          </div>
          <div class="chat-messages" id="chat-messages">
            <div class="chat-messages-inner" id="chat-inner"></div>
          </div>
          <div class="chat-input-area">
            <div class="chat-upload-bar" id="chat-upload-bar"></div>
            <div class="chat-input-wrap">
              <input type="file" id="chat-file-input" accept="image/*,audio/*" multiple style="display:none">
              <button class="btn-attach" id="chat-attach" title="添加图片或语音" aria-label="添加图片或语音">
                <span class="btn-attach-icon">📎</span>
              </button>
              <textarea id="chat-input" rows="1" placeholder="说说你的回忆…" maxlength="500"></textarea>
              <button class="btn-send" id="chat-send" title="发送" aria-label="发送">↵</button>
            </div>
          </div>
        </div>
      </div>
    </div>`;
  },

  mount() {
    this._pageUnmounted = false;
    this._hasResumed = false;
    this.messages = [];
    this.fields = {};
    this.isComplete = false;
    this.isWaiting = false;
    this.isFallback = false;
    this._fallbackStep = 0;
    this._fallbackAnswers = {};
    this.uploadedMedia = [];

    const msgContainer = document.getElementById('chat-inner');
    const input = document.getElementById('chat-input');
    const sendBtn = document.getElementById('chat-send');
    const backBtn = document.getElementById('chat-back');
    const attachBtn = document.getElementById('chat-attach');
    const fileInput = document.getElementById('chat-file-input');

    // 检查是否有上次的会话存档
    const saved = Store.loadChatSession();
    if (saved && saved.messages && saved.messages.length > 0) {
      // 恢复存档
      this._showResumeBanner(msgContainer, saved, input);
    } else {
      // 全新对话 — 显示 "正在连接…"
      this._addMessage(msgContainer, 'ai', '正在连接…');
    }

    // 发送消息
    const handleSend = () => {
      const raw = input.value;
      // 输入校验
      if (Helpers.isEmptyInput(raw)) {
        input.value = '';
        input.style.height = 'auto';
        return;
      }
      if (this.isWaiting) return;
      const text = Helpers.sanitizeInput(raw, 500);
      input.value = '';
      input.style.height = 'auto';
      // 主动 abort 上一条未完成的流，避免 ERR_ABORTED 噪声
      if (this._abortController) {
        try { this._abortController.abort(); } catch (e) { /* ignore */ }
      }
      this._abortController = new AbortController();
      this._handleUserInput(msgContainer, input, text);
    };

    sendBtn.onclick = handleSend;
    input.onkeydown = (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        handleSend();
      }
    };
    input.oninput = () => {
      input.style.height = 'auto';
      input.style.height = Math.min(input.scrollHeight, 120) + 'px';
    };
    backBtn.onclick = () => Router.navigate('');

    // 文件上传
    attachBtn.onclick = () => fileInput.click();
    fileInput.onchange = () => this._handleFileUpload(fileInput);

    // 侧边栏切换
    const sidebar = document.getElementById('chat-sidebar');
    document.getElementById('sidebar-toggle').onclick = () => {
      sidebar.classList.toggle('collapsed');
    };
    document.getElementById('sidebar-close').onclick = () => {
      sidebar.classList.add('collapsed');
    };
    // 点击侧边栏项目跳转
    document.querySelectorAll('.sidebar-item').forEach(item => {
      item.onclick = () => {
        if (item.dataset.pending === 'true') {
          // 待推演 — 先保存会话再跳转聊天页
          const stories = Store.getStories();
          const story = stories.find(s => s.id === item.dataset.id);
          if (story && story._chatSession) {
            Store.saveChatSession(story._chatSession);
          }
          Router.navigate('chat');
        } else {
          Router.navigate(`timeline/${item.dataset.id}`);
        }
      };
    });

    // 仅在全新对话时启动 AI 开场白（恢复时跳过）
    if (!saved || !saved.messages || saved.messages.length === 0) {
      this._abortController = new AbortController();
      // 延迟 200ms 发起请求，避免页面切换时 fetch 被 abort
      this._initTimer = setTimeout(() => {
        this._initTimer = null;
        if (this._pageUnmounted) return;
        this._startConversation(msgContainer, input);
      }, 200);
    } else {
      // 恢复时仍创建 controller（虽然不用，但保持一致性）
      this._abortController = new AbortController();
    }
  },

  /** 转义 HTML 特殊字符 */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.appendChild(document.createTextNode(text == null ? '' : String(text)));
    return div.innerHTML;
  },

  /** 根据 uploadedMedia 拼接前端可访问的绝对 URL */
  _mediaUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const apiBase = (window.API && window.API.BASE_URL) || 'http://localhost:8000/api';
    const fileBase = apiBase.replace(/\/api\/?$/, '');
    return `${fileBase}${url}`;
  },

  /** 将纯文本转为安全的 HTML（换行 → <br>） */
  _textToHtml(text) {
    return this._escapeHtml(text).replace(/\n/g, '<br>');
  },

  /** 启动对话 — 流式获取 AI 开场白 */
  async _startConversation(container, input) {
    this.isWaiting = true;

    const bubble = document.createElement('div');
    bubble.className = 'msg ai';
    bubble.innerHTML = `<div class="msg-avatar ai">✦</div><div class="msg-bubble" id="greeting-bubble"></div>`;
    container.lastElementChild?.remove(); // 移除 "正在连接…"
    container.appendChild(bubble);
    const contentDiv = bubble.querySelector('.msg-bubble');

    let fullReply = '';
    let started = false;
    let timedOut = false;
    let renderPending = false;

    // 用 requestAnimationFrame 节流渲染，让文字逐帧出现
    const scheduleRender = () => {
      if (renderPending) return;
      renderPending = true;
      requestAnimationFrame(() => {
        contentDiv.innerHTML = this._textToHtml(fullReply);
        this._scrollToBottom();
        renderPending = false;
      });
    };

    // 用流式开场，但设置 20 秒超时降级（首次冷启动可能较慢）
    const timeoutId = setTimeout(() => {
      timedOut = true;
      // 后端不可用或无回复，切换降级
      this.isFallback = true;
      this._fallbackStep = 0;
      this._fallbackAnswers = {};
      bubble.remove();
      const text = this._fallbackSteps[0].text;
      this._addMessage(container, 'ai', text);
      this.messages.push({ role: 'assistant', content: text });
      this.isWaiting = false;
      setTimeout(() => input.focus(), 300);
      this._scrollToBottom();
    }, 20000);

    API.chatStream(
      [],  // 空消息，AI 开场
      (token) => {
        if (timedOut) return;
        clearTimeout(timeoutId);
        if (!started) { started = true; this.isFallback = false; }
        fullReply += token;
        scheduleRender();
      },
      (result) => {
        if (timedOut) return;
        clearTimeout(timeoutId);
        this.isFallback = false;
        this.messages.push({ role: 'assistant', content: fullReply });
        this.fields = result.fields || {};
        this.isComplete = result.complete || false;
        this.isWaiting = false;
        // 最终确保完整渲染
        contentDiv.innerHTML = this._textToHtml(fullReply);
        setTimeout(() => input.focus(), 300);
        this._scrollToBottom();
        this._saveSession();  // 持久化
      },
      (errMsg) => {
        if (timedOut || this._pageUnmounted) return;
        clearTimeout(timeoutId);
        // API 不可用时给出"重试"和"切换降级"两个选项，不再静默降级
        bubble.innerHTML = `
          <div class="msg-avatar ai">✦</div>
          <div class="msg-bubble">
            <div class="msg-error">
              <div class="msg-error-text">${this._escapeHtml(errMsg || '网络中断')}</div>
              <div class="msg-error-actions">
                <button class="btn-retry" id="btn-greeting-retry" title="重新连接" aria-label="重新连接">
                  <span class="retry-icon">↻</span>
                </button>
                <button class="btn-fallback-mode" id="btn-greeting-fallback" title="无网络也能用">
                  使用降级模式
                </button>
              </div>
            </div>
          </div>
        `;
        // 重试
        const retryBtn = bubble.querySelector('#btn-greeting-retry');
        if (retryBtn) {
          retryBtn.onclick = () => {
            bubble.remove();
            this._startConversation(container, input);
          };
        }
        // 降级
        const fallbackBtn = bubble.querySelector('#btn-greeting-fallback');
        if (fallbackBtn) {
          fallbackBtn.onclick = () => {
            bubble.remove();
            this._enterFallbackMode(container, input);
          };
        }
        this.isWaiting = false;
        this._scrollToBottom();
      },
      this._abortController?.signal  // 页面卸载时主动中止，避免 ERR_ABORTED 噪声
    );
  },

  /** 切换到降级模式（开场失败时的兜底） */
  _enterFallbackMode(container, input) {
    this.isFallback = true;
    this._fallbackStep = 0;
    this._fallbackAnswers = {};
    const text = this._fallbackSteps[0].text;
    this._addMessage(container, 'ai', text);
    this.messages.push({ role: 'assistant', content: text });
    setTimeout(() => input.focus(), 300);
    this._saveSession();  // 持久化
    this._scrollToBottom();
  },

  /**
   * 检测 AI 是否在邀请用户上传素材
   * 命中关键词时，温和地高亮 attach 按钮 + 显示气泡提示
   * — 不强迫，让按钮自己"亮"起来
   */
  _maybeHighlightUpload(reply) {
    if (!reply) return;
    const triggers = [
      /发[一]?[张张]?照?片?/,
      /拍[一]?张/,
      /给我看[一看]?/,
      /给我?发[一]?/,
      /上[传传]/,
      /发[来给]?[我]?/,
      /那段?语音/,
      /那段?视频/,
      /如果?手边有.*?照片/,
    ];
    const matched = triggers.some(rx => rx.test(reply));
    if (!matched) return;

    // 已经上传过的不重复提醒
    if (this.uploadedMedia && this.uploadedMedia.length > 0) return;

    const btn = document.getElementById('chat-attach');
    if (btn) {
      btn.classList.add('btn-attach-pulse');
      setTimeout(() => btn.classList.remove('btn-attach-pulse'), 8000);
    }
    // 显示一次性提示气泡（提示用户可以上传，也可以不传）
    if (window.GlobalToast) {
      window.GlobalToast.info('想分享当时的照片或一段语音吗？点击 📎 就能附上。\n没有也没关系，文字已经足够');
    }
  },

  /** 处理用户输入 */
  async _handleUserInput(container, input, text) {
    // 显示用户消息
    this._addMessage(container, 'user', text);
    this.messages.push({ role: 'user', content: text });
    this._saveSession();  // 持久化

    input.value = '';
    input.style.height = 'auto';
    this.isWaiting = true;

    if (this.isFallback) {
      await this._fallbackHandle(container, text);
    } else {
      this._llmHandleStream(container, text);
    }

    this._scrollToBottom();
  },

  /** LLM 模式处理（流式） */
  _llmHandleStream(container, text) {
    // 创建 AI 消息气泡（内容会逐步填充）
    const bubble = document.createElement('div');
    bubble.className = 'msg ai';
    bubble.innerHTML = `<div class="msg-avatar ai">✦</div><div class="msg-bubble"></div>`;
    container.appendChild(bubble);
    const contentDiv = bubble.querySelector('.msg-bubble');

    let fullReply = '';
    let streamDone = false;
    let renderPending = false;

    // 用 requestAnimationFrame 节流渲染，逐帧出现文字
    const scheduleRender = () => {
      if (renderPending) return;
      renderPending = true;
      requestAnimationFrame(() => {
        contentDiv.innerHTML = this._textToHtml(fullReply);
        this._scrollToBottom();
        renderPending = false;
      });
    };

    API.chatStream(
      this.messages,
      (token) => {
        fullReply += token;
        scheduleRender();
      },
      (result) => {
        streamDone = true;
        this.messages.push({ role: 'assistant', content: fullReply });
        this.fields = result.fields || {};
        this.isComplete = result.complete || false;

        // 确保最终内容完整渲染
        contentDiv.innerHTML = this._textToHtml(fullReply);

        // AI 主动邀请上传时 — 高亮 attach 按钮 + 滚动到位
        this._maybeHighlightUpload(fullReply);

        if (this.isComplete) {
          // AI 自动判断收集完成 → 禁用输入并自动推演
          const input = document.getElementById('chat-input');
          if (input) {
            input.disabled = true;
            input.placeholder = '正在为你推演平行人生…';
          }
          const sendBtn = document.getElementById('chat-send');
          if (sendBtn) sendBtn.style.opacity = '0.3';
          const attachBtn = document.getElementById('chat-attach');
          if (attachBtn) {
            attachBtn.style.opacity = '0.3';
            attachBtn.style.pointerEvents = 'none';
          }
          // 自动触发推演（不跳转页面，在聊天页内联展示）
          this._saveSession();  // 持久化完整状态
          // 延迟调用，确保 chatStream 的 SSE 连接完全释放后再发请求
          setTimeout(() => {
            if (!this._pageUnmounted) this._autoGenerateNarrative(container);
          }, 50);
        } else {
          this._saveSession();  // 普通消息也持久化
        }

        this.isWaiting = false;
        this._scrollToBottom();
      },
      (errMsg) => {
        if (streamDone) return;
        // 流式失败：清空气泡内容 + 加重发按钮
        fullReply = '';
        contentDiv.innerHTML = `
          <div class="msg-error">
            <div class="msg-error-text">${this._escapeHtml(errMsg || '网络中断')}</div>
            <div class="msg-error-actions">
              <button class="btn-retry" id="btn-retry-msg" title="重新发送" aria-label="重新发送">
                <span class="retry-icon">↻</span>
              </button>
            </div>
          </div>
        `;
        // 绑定重发
        const retryBtn = contentDiv.querySelector('#btn-retry-msg');
        if (retryBtn) {
          retryBtn.onclick = () => {
            // 移除这个失败气泡
            bubble.remove();
            // 从 messages 中移除最后一条 user 消息（因为没拿到 AI 回复）
            for (let i = this.messages.length - 1; i >= 0; i--) {
              if (this.messages[i].role === 'user') {
                this.messages.splice(i, 1);
                break;
              }
            }
            // 把用户消息重新加回数组 + 保存
            this.messages.push({ role: 'user', content: text });
            this._saveSession();
            // 重新走完整流程（用户气泡已存在于 DOM，只需重新请求 AI 回复）
            this._llmHandleStream(container, text);
          };
        }
        this.isWaiting = false;
        this._scrollToBottom();
      },
      this._abortController?.signal  // 页面卸载时主动中止
    );
  },

  /** 降级模式处理 */
  async _fallbackHandle(container, text) {
    const step = this._fallbackSteps[this._fallbackStep];
    this._fallbackAnswers[step.key] = text;

    this._showTyping(container);
    await Helpers.sleep(600 + Math.random() * 400);
    this._hideTyping(container);

    this._fallbackStep++;

    if (this._fallbackStep >= this._fallbackSteps.length - 1) {
      // 全部 6 步答完 — 禁用输入并自动推演
      this._fallbackAnswers.imagination = this._fallbackAnswers.imagination || text;
      const confirmText = this._buildFallbackConfirm();
      this._addMessage(container, 'ai', confirmText);
      this.messages.push({ role: 'assistant', content: confirmText });
      this.isComplete = true;
      // 禁用输入
      const input = document.getElementById('chat-input');
      if (input) {
        input.disabled = true;
        input.placeholder = '正在为你推演平行人生…';
      }
      const sendBtn = document.getElementById('chat-send');
      if (sendBtn) sendBtn.style.opacity = '0.3';
      // 自动推演（不跳转，在聊天页内联展示）
      this._saveSession();  // 持久化
      this._autoGenerateNarrative(container);
    } else {
      const nextStep = this._fallbackSteps[this._fallbackStep];
      this._addMessage(container, 'ai', nextStep.text);
      this.messages.push({ role: 'assistant', content: nextStep.text });
      this._saveSession();  // 持久化
    }

    this.isWaiting = false;
  },

  /** 构建降级模式确认文本 */
  _buildFallbackConfirm() {
    const a = this._fallbackAnswers;
    return `好的，我来梳理一下：\n\n${a.time}，在${a.location}\n面临的选择：${a.choice}\n最终选择了：${a.actual}\n结果是：${a.outcome}\n\n如果当初${a.imagination ? '做了另一个选择——' + a.imagination : '选择了另一条路'}……\n\n现在，让我为你推演这两条路上的故事。`;
  },

  /** 收集 LLM 模式下的用户输入 */
  _buildUserInputFromLLM() {
    const userInput = {
      time: this.fields.time || '',
      location: this.fields.location || '',
      choiceA: this.fields.actual || '',
      choiceB: this.fields.choice
        ? this.fields.choice.replace(/.*?(?:vs|VS|还是)\s*/i, '').trim()
        : '',
      actualChoice: this.fields.actual || '',
      actualOutcome: this.fields.outcome || '',
      imagination: this.fields.imagination || '',
      uploadedMedia: this.uploadedMedia,
    };

    // 如果 choiceB 解析失败，尝试用 choice 的另一半
    if (!userInput.choiceB && this.fields.choice) {
      const parts = this.fields.choice.split(/\s*(?:vs|VS|还是)\s*/);
      userInput.choiceA = parts[0]?.trim() || '';
      userInput.choiceB = parts[1]?.trim() || '';
      userInput.actualChoice = this.fields.actual || userInput.choiceA;
    }
    return userInput;
  },

  /** 收集降级模式下的用户输入 */
  _buildUserInputFromFallback() {
    const a = this._fallbackAnswers;
    const choice = a.choice || '';
    const parts = choice.split(/\s*(?:vs|VS|还是)\s*/);
    return {
      time: a.time || '',
      location: a.location || '',
      choiceA: parts[0]?.trim() || a.actual || '',
      choiceB: parts[1]?.trim() || '',
      actualChoice: a.actual || '',
      actualOutcome: a.outcome || '',
      imagination: a.imagination || '',
      uploadedMedia: this.uploadedMedia,
    };
  },

  /** AI 收集完成后自动推演（在聊天页内联展示，不跳转） */
  async _autoGenerateNarrative(container) {
    // 根据模式选择输入来源
    const userInput = this.isFallback
      ? this._buildUserInputFromFallback()
      : this._buildUserInputFromLLM();

    // 显示推演状态气泡
    const statusBubble = this._addGeneratingStatus(container);

    try {
      // 异步触发后端生成（通过 fetch 走 SSE）
      await new Promise((resolve) => {
        let _finished = false;
        const finish = () => { if (!_finished) { _finished = true; resolve(); } };

        // 页面已卸载则直接放弃
        const guard = () => {
          if (this._pageUnmounted) { finish(); return true; }
          return false;
        };

        API.generateNarrativeStream(userInput, {
          onThinking: (msg) => {
            if (guard()) return;
            const textEl = statusBubble.querySelector('.gen-status-text');
            if (textEl) textEl.textContent = msg || '正在为你推演平行人生…';
          },
          onDone: (storyData) => {
            if (_finished) return;
            if (guard()) return;
            // 把当时的聊天记录也附加到故事上 — 时间线页可回看对话
            // 优先用后端返回的（如果后端在 done 里带了），否则用本地 messages
            if (!storyData.chatMessages || !storyData.chatMessages.length) {
              storyData.chatMessages = this.messages.slice();
            }
            storyData.fields = { ...this.fields };
            // 后端 /api/generate 在 done 时已经写入数据库 — 这里只更新本地 Store
            // （不再额外调 API.saveStory，避免同一会话产生 2 条历史记录）
            Store.addStory(storyData);
            Store.setCurrentStoryId(storyData.id);
            Store.setCurrentNarratives(storyData.narratives);
            // 内联展示结果
            if (statusBubble.parentNode) statusBubble.remove();
            this._showNarrativeInline(container, storyData);
            // 清除会话存档
            this._clearSession();
            finish();
          },
          onError: (errMsg) => {
            if (_finished) return;
            if (guard()) return;
            if (statusBubble.parentNode) statusBubble.remove();
            this._showGenerateError(container, errMsg);
            finish();
          },
        }, this.messages.slice());  // 传入聊天记录供后端持久化

        // 兜底超时：60 秒后强制结束（防止 Promise 挂起）
        setTimeout(finish, 60000);
      });
    } catch (e) {
      if (statusBubble.parentNode) statusBubble.remove();
      this._showGenerateError(container, '网络中断');
    }
  },

  /** 显示推演状态气泡 */
  _addGeneratingStatus(container) {
    const div = document.createElement('div');
    div.className = 'msg ai msg-generating';
    div.innerHTML = `
      <div class="msg-avatar ai">✦</div>
      <div class="msg-bubble gen-status-bubble">
        <div class="gen-status-row">
          <span class="gen-spinner-mini"></span>
          <span class="gen-status-text">正在为你推演平行人生…</span>
        </div>
        <div class="gen-status-sub">AI 正在读取你的记忆，翻阅另一条路上的故事</div>
      </div>
    `;
    container.appendChild(div);
    this._scrollToBottom();
    return div;
  },

  /** 在聊天页内联展示推演结果 + 查看时间线按钮 */
  _showNarrativeInline(container, storyData) {
    // 媒体提示已精简 — 图片/音频已直接显示在聊天流里，
    // 推演结果不再重复展示，避免视觉噪声

    const reflection = storyData.reflection || {};
    const insight = reflection.insight || '';
    const message = reflection.message || '';
    const title = storyData.title || '你的平行人生';

    // 抽取前 2 条真实 + 2 条平行作为预览
    const realPreview = (storyData.narratives?.real || []).slice(0, 2);
    const parallelPreview = (storyData.narratives?.parallel || []).slice(0, 2);
    const fmtPreview = (arr, tag) => arr.map(n => `
      <div class="inline-card">
        <div class="inline-card-tag">${tag}</div>
        <div class="inline-card-scene">${this._escapeHtml(n.scene || '')}</div>
        <div class="inline-card-content">${this._escapeHtml((n.content || '').slice(0, 80))}${(n.content || '').length > 80 ? '…' : ''}</div>
        ${n.emotion ? `<div class="inline-card-emotion">· ${this._escapeHtml(n.emotion)}</div>` : ''}
      </div>
    `).join('');

    const div = document.createElement('div');
    div.className = 'msg ai msg-result';
    div.innerHTML = `
      <div class="msg-avatar ai">✦</div>
      <div class="msg-bubble msg-result-bubble">
        <div class="result-header">
          <div class="result-badge">✦ 平行人生已生成</div>
          <h3 class="result-title">${this._escapeHtml(title)}</h3>
        </div>
        ${message ? `<div class="result-message">${this._escapeHtml(message)}</div>` : ''}
        ${insight ? `<div class="result-insight">"${this._escapeHtml(insight)}"</div>` : ''}
        <div class="result-section">
          <div class="result-section-title">🛤 你走过的那条路</div>
          <div class="result-cards">${fmtPreview(realPreview, '现实')}</div>
        </div>
        <div class="result-section">
          <div class="result-section-title">✨ 另一条路上的你</div>
          <div class="result-cards">${fmtPreview(parallelPreview, '平行')}</div>
        </div>
        <div class="result-actions">
          <button class="btn-primary btn-result-continue" id="btn-view-timeline">查看完整时间线 →</button>
        </div>
      </div>
    `;
    container.appendChild(div);
    this._scrollToBottom();

    // 绑定按钮 — 跳转到时间线页查看完整内容
    document.getElementById('btn-view-timeline').onclick = () => {
      Router.navigate(`timeline/${storyData.id}`);
    };
  },

  /** 处理文件上传 */
  async _handleFileUpload(fileInput) {
    const files = fileInput.files;
    if (!files.length) return;

    const msgContainer = document.getElementById('chat-inner');
    const attachBtn = document.getElementById('chat-attach');
    const attachIcon = attachBtn.querySelector('.btn-attach-icon');
    const originalIcon = attachIcon ? attachIcon.textContent : '📎';
    attachBtn.disabled = true;
    if (attachIcon) attachIcon.textContent = '⏳';

    for (const file of files) {
      const chip = this._addUploadStatus(file.name, 'uploading');
      try {
        const result = await API.uploadFile(file, (progress) => {
          this._updateUploadStatus(file.name, progress);
        });

        const media = {
          url: result.url,
          type: result.type,
          filename: result.filename,
        };
        this.uploadedMedia.push(media);
        // 上传成功 — chip 短暂显示"已上传"状态后淡出移除，
        // 避免和聊天流里已展示的图片重复
        this._updateUploadStatus(file.name, 'done', result);

        // 把附件也写进 messages 数组 — 让历史/刷新后能复现
        this.messages.push({
          role: 'user',
          content: '',
          attachments: [media],
        });
        this._saveSession();

        // 关键：以"聊天消息"的方式把已上传的文件发到对话流里
        // —— 就像发微信图片/语音一样
        this._addAttachmentMessage(msgContainer, media);
        // 700ms 后让"已上传"chip 淡出消失（图片已经在聊天流里了）
        setTimeout(() => this._fadeOutAndRemoveChip(chip), 700);
      } catch (err) {
        // 上传失败 — chip 显示错误状态 + 重试按钮（用户可一键重传）
        this._updateUploadStatus(file.name, 'error', null, err.message, file);
      }
    }

    attachBtn.disabled = false;
    if (attachIcon) attachIcon.textContent = originalIcon;
    fileInput.value = '';  // 重置，允许再次选择同文件
  },

  /** 让上传 chip 淡出并从 DOM 移除 */
  _fadeOutAndRemoveChip(chip) {
    if (!chip || !chip.parentNode) return;
    chip.classList.add('chip-fading');
    setTimeout(() => {
      if (chip.parentNode) chip.parentNode.removeChild(chip);
    }, 280);
  },

  /** 在对话流中插入一条"附件消息"（用户头像 + 图片/音频预览） */
  _addAttachmentMessage(container, media) {
    if (!container) return;
    const div = document.createElement('div');
    div.className = 'msg user msg-attach-only';
    let inner = '';
    if (media.type === 'image') {
      const src = this._escapeHtml(this._mediaUrl(media.url));
      const alt = this._escapeHtml(media.filename || '图片');
      inner = `<div class="msg-attach msg-attach-image"><img src="${src}" alt="${alt}" loading="lazy" crossorigin="anonymous" onerror="this.parentNode.classList.add('img-failed');this.style.display='none'"></div>`;
    } else if (media.type === 'audio') {
      const src = this._escapeHtml(this._mediaUrl(media.url));
      inner = `<div class="msg-attach msg-attach-audio"><span class="msg-attach-icon">🎵</span><span class="msg-attach-name">${this._escapeHtml(media.filename || '语音')}</span><audio src="${src}" controls preload="none" crossorigin="anonymous"></audio></div>`;
    }
    div.innerHTML = `
      <div class="msg-avatar user">☾</div>
      <div class="msg-bubble msg-attach-bubble">${inner}</div>
    `;
    container.appendChild(div);
    this._scrollToBottom();
  },

  /** 添加上传状态提示 */
  _addUploadStatus(filename, status) {
    const bar = document.getElementById('chat-upload-bar');
    const chip = document.createElement('div');
    chip.className = 'upload-chip';
    chip.dataset.filename = filename;
    chip.id = `upload-${this._escapeHtml(filename).replace(/[^a-zA-Z0-9]/g, '_')}`;
    chip.innerHTML = `
      <span class="upload-icon">📎</span>
      <span class="upload-name">${this._escapeHtml(filename)}</span>
      <span class="upload-status">上传中…</span>
    `;
    bar.appendChild(chip);
    return chip;
  },

  /**
   * 更新上传状态
   * @param {string} filename
   * @param {string|number} status  'uploading' | 'done' | 'error' | 数字百分比
   * @param {object} [result]       upload API 返回的 { url, type, filename }
   * @param {string} [errorMsg]     错误信息（status === 'error' 时）
   * @param {File}   [origFile]     原始文件对象（重试用）
   */
  _updateUploadStatus(filename, status, result, errorMsg, origFile) {
    const id = `upload-${filename.replace(/[^a-zA-Z0-9]/g, '_')}`;
    const chip = document.getElementById(id);
    if (!chip) return;

    const statusEl = chip.querySelector('.upload-status');
    const iconEl = chip.querySelector('.upload-icon');

    if (status === 'done' && result) {
      if (result.type === 'image') {
        iconEl.textContent = '🖼️';
      } else {
        iconEl.textContent = '🎵';
      }
      statusEl.textContent = '已上传';
      chip.classList.add('upload-done');
    } else if (status === 'error') {
      iconEl.textContent = '❌';
      statusEl.textContent = '上传失败';
      chip.classList.add('upload-error');
      // 关键：注入重试按钮 — 用户一键重传失败的文件
      let retryBtn = chip.querySelector('.upload-retry-btn');
      if (!retryBtn) {
        retryBtn = document.createElement('button');
        retryBtn.className = 'upload-retry-btn';
        retryBtn.title = '重新上传';
        retryBtn.setAttribute('aria-label', '重新上传');
        retryBtn.innerHTML = '<span class="retry-icon">↻</span>';
        chip.appendChild(retryBtn);
      }
      // 让 chip 自身也可点击重试（更大的点击区域）
      chip.title = errorMsg ? `${errorMsg} — 点击重试` : '点击重试';
      chip.style.cursor = 'pointer';

      // 绑定重试（按钮 / chip 整体）
      const doRetry = async (e) => {
        if (e) e.stopPropagation();
        if (!origFile) {
          // 没有原文件引用 — 提示用户重新选择
          if (window.GlobalToast) window.GlobalToast.info('请重新选择文件');
          document.getElementById('chat-file-input').click();
          return;
        }
        // 切回"上传中"状态
        chip.classList.remove('upload-error');
        chip.classList.add('uploading');
        iconEl.textContent = '📎';
        statusEl.textContent = '上传中…';
        chip.title = '';
        chip.style.cursor = '';
        // 移除重试按钮
        if (retryBtn && retryBtn.parentNode) retryBtn.parentNode.removeChild(retryBtn);
        // 重新解绑 chip 整体点击
        chip.onclick = null;
        try {
          const result2 = await API.uploadFile(origFile, (progress) => {
            this._updateUploadStatus(filename, progress);
          });
          const media = {
            url: result2.url,
            type: result2.type,
            filename: result2.filename,
          };
          // 避免重复添加（先移除上次失败可能写入的）
          this.uploadedMedia = this.uploadedMedia.filter(
            (m) => m.url !== result.url && m.filename !== filename
          );
          this.uploadedMedia.push(media);
          this._updateUploadStatus(filename, 'done', result2);
          this.messages.push({
            role: 'user',
            content: '',
            attachments: [media],
          });
          this._saveSession();
          const msgContainer = document.getElementById('chat-inner');
          this._addAttachmentMessage(msgContainer, media);
          setTimeout(() => this._fadeOutAndRemoveChip(chip), 700);
        } catch (err2) {
          this._updateUploadStatus(filename, 'error', null, err2.message, origFile);
        }
      };
      retryBtn.onclick = doRetry;
      chip.onclick = doRetry;
    } else if (typeof status === 'number') {
      // 进度百分比
      chip.classList.add('uploading');
      statusEl.textContent = `上传中… ${status}%`;
    }
  },

  /** 添加消息气泡 */
  _addMessage(container, role, content) {
    const div = document.createElement('div');
    div.className = `msg ${role}`;
    // 头像：AI 用 ✦（小星星），用户用 ☾（月牙）— 像月光对照星光
    const avatar = role === 'ai' ? '✦' : '☾';
    div.innerHTML = `
      <div class="msg-avatar ${role}">${avatar}</div>
      <div class="msg-bubble">${content.replace(/\n/g, '<br>')}</div>
    `;
    container.appendChild(div);
    this._scrollToBottom();
  },

  /** 显示打字指示器 */
  _showTyping(container) {
    const div = document.createElement('div');
    div.className = 'msg ai';
    div.id = 'typing-indicator';
    div.innerHTML = `
      <div class="msg-avatar ai">✦</div>
      <div class="msg-bubble">
        <div class="typing-indicator">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    container.appendChild(div);
    this._scrollToBottom();
  },

  _hideTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  },

  /** 保存聊天会话到 localStorage（每次消息更新后调用） */
  _saveSession() {
    if (this._pageUnmounted) return;
    Store.saveChatSession({
      messages: this.messages,
      fields: this.fields,
      isComplete: this.isComplete,
      isFallback: this.isFallback,
      _fallbackStep: this._fallbackStep,
      _fallbackAnswers: this._fallbackAnswers,
      uploadedMedia: this.uploadedMedia,
    });
  },

  /** 清除聊天会话存档 */
  _clearSession() {
    Store.clearChatSession();
  },

  /** 显示"继续上次/重新开始"横幅
   * - 顶部小条：只有"重新开始"（点不动的话用户会困惑，放底部看不清）
   * - 底部卡片：「继续对话/开始推演」放在历史消息最下方
   */
  _showResumeBanner(container, saved, input) {
    const msgCount = saved.messages.length;
    const isComplete = saved.isComplete;
    const summary = isComplete
      ? `检测到上次对话（${msgCount} 条消息，已收齐素材）`
      : `检测到上次对话（${msgCount} 条消息）`;

    // 1) 顶部条：提示 + 重新开始
    const topBar = document.createElement('div');
    topBar.className = 'resume-topbar';
    topBar.innerHTML = `
      <span class="resume-topbar-text">${summary}</span>
      <button class="btn-resume-topbar-restart" id="btn-resume-topbar-restart">重新开始</button>
    `;
    container.appendChild(topBar);

    // 2) 恢复历史消息
    this._renderHistory(container, saved.messages);

    // 3) 底部卡片：主要操作（继续对话 / 开始推演）
    const bottomCard = document.createElement('div');
    bottomCard.className = 'resume-bottom-card';
    bottomCard.innerHTML = `
      <div class="resume-bottom-icon">✦</div>
      <div class="resume-bottom-text">
        <div class="resume-bottom-title">${isComplete ? '已收齐素材，可以推演了' : '继续刚才的对话'}</div>
        <div class="resume-bottom-sub">${isComplete ? '点击下方按钮开始推演平行人生' : '点击下方按钮接着聊'}</div>
      </div>
      <button class="btn-resume-bottom" id="btn-resume-continue">
        ${isComplete ? '开始推演 →' : '继续对话 →'}
      </button>
    `;
    container.appendChild(bottomCard);

    // 绑定顶部「重新开始」
    topBar.querySelector('#btn-resume-topbar-restart').onclick = () => {
      this._clearSession();
      topBar.remove();
      bottomCard.remove();
      // 清空所有消息气泡
      container.innerHTML = '';
      this.messages = [];
      this.fields = {};
      this.isComplete = false;
      this.isFallback = false;
      this._fallbackStep = 0;
      this._fallbackAnswers = {};
      this.uploadedMedia = [];
      this._addMessage(container, 'ai', '正在连接…');
      this._startConversation(container, input);
    };

    // 绑定底部「继续/开始推演」
    bottomCard.querySelector('#btn-resume-continue').onclick = () => {
      topBar.remove();
      bottomCard.remove();
      this._resumeSession(container, saved, input);
    };

    // 滚动到底部，让用户看到主要操作按钮
    setTimeout(() => this._scrollToBottom(), 50);
  },

  /** 渲染历史消息气泡 */
  _renderHistory(container, messages) {
    messages.forEach(m => {
      // 兼容两种 role 命名：'ai'（应用内部）和 'assistant'（OpenAI 风格）
      const role = m.role === 'assistant' ? 'ai' : m.role;
      const div = document.createElement('div');
      div.className = `msg ${role}`;
      const avatar = role === 'ai' ? '✦' : '☾';

      // 用户消息：支持内联图片/音频附件（聊天软件风格）
      let bubbleInner;
      if (role === 'user') {
        const text = m.content ? this._textToHtml(m.content) : '';
        const attachments = Array.isArray(m.attachments) ? m.attachments : [];
        const mediaHtml = attachments
          .filter(a => a && a.url)
          .map(a => {
            if (a.type === 'image') {
              const src = this._escapeHtml(this._mediaUrl(a.url));
              const name = this._escapeHtml(a.filename || '图片');
              return `<div class="msg-attach msg-attach-image"><img src="${src}" alt="${name}" loading="lazy" crossorigin="anonymous" onerror="this.parentNode.classList.add('img-failed');this.style.display='none'"></div>`;
            }
            if (a.type === 'audio') {
              const src = this._escapeHtml(this._mediaUrl(a.url));
              return `<div class="msg-attach msg-attach-audio"><span class="msg-attach-icon">🎵</span><span class="msg-attach-name">${this._escapeHtml(a.filename || '语音')}</span><audio src="${src}" controls preload="none" crossorigin="anonymous"></audio></div>`;
            }
            return '';
          })
          .join('');
        bubbleInner = `${text}${mediaHtml}`;
      } else {
        bubbleInner = this._textToHtml(m.content || '');
      }

      div.innerHTML = `
        <div class="msg-avatar ${role}">${avatar}</div>
        <div class="msg-bubble">${bubbleInner}</div>
      `;
      container.appendChild(div);
    });
    this._scrollToBottom();
  },

  /** 恢复会话状态 */
  _resumeSession(container, saved, input) {
    this._hasResumed = true;
    this.messages = saved.messages || [];
    this.fields = saved.fields || {};
    this.isComplete = saved.isComplete || false;
    this.isFallback = saved.isFallback || false;
    this._fallbackStep = saved._fallbackStep || 0;
    this._fallbackAnswers = saved._fallbackAnswers || {};
    this.uploadedMedia = saved.uploadedMedia || [];

    if (this.isComplete) {
      // 之前已经收齐 → 显示"开始推演"按钮
      this._showGeneratePrompt(container, input);
    } else {
      // 检查是否消息数足够（≥ 4 条用户消息）— 兜底让用户手动选择推演
      const userMsgCount = this.messages.filter(m => m.role === 'user').length;
      if (userMsgCount >= 3) {
        // 之前聊得差不多了但没标记完成 → 允许手动推演
        this.isComplete = true;
        this._showGeneratePrompt(container, input, true);
      } else {
        // 继续输入
        this.isWaiting = false;
        setTimeout(() => input.focus(), 100);
      }
    }
  },

  /** 显示"开始推演"提示 + 按钮 */
  _showGeneratePrompt(container, input, showContinueOption = false) {
    const promptDiv = document.createElement('div');
    const subtitle = showContinueOption
      ? 'AI 没明确标记收齐，但你已经聊了不少。可以直接推演，或继续聊几句。'
      : '准备好了就推演吧 — AI 会根据你的记忆翻阅另一条路上的故事。';
    promptDiv.className = 'msg ai';
    promptDiv.innerHTML = `
      <div class="msg-avatar ai">✦</div>
      <div class="msg-bubble">
        <div style="margin-bottom:0.6rem;opacity:0.7;font-size:0.88rem;">你的故事已收齐 ✦</div>
        <div style="margin-bottom:0.8rem;line-height:1.7;">${subtitle}</div>
        <button class="btn-continue btn-prompt-generate" id="btn-prompt-generate">开始推演平行人生 →</button>
      </div>
    `;
    container.appendChild(promptDiv);
    this._scrollToBottom();

    // 绑定按钮
    document.getElementById('btn-prompt-generate').onclick = () => {
      promptDiv.remove();
      this._autoGenerateNarrative(container);
    };
  },

  /** 显示推演失败并提供重试按钮 */
  _showGenerateError(container, errMsg) {
    this._saveSession();  // 推演失败也保存会话

    // 将未完成的会话保存到历史列表，方便用户之后回来继续推演
    this._saveToHistory();

    const div = document.createElement('div');
    div.className = 'msg ai msg-generate-error';
    div.innerHTML = `
      <div class="msg-avatar ai">✦</div>
      <div class="msg-bubble">
        <div class="msg-error">
          <div class="msg-error-text">${this._escapeHtml(errMsg || '网络中断')}</div>
          <div class="msg-error-actions">
            <button class="btn-retry" id="btn-retry-generate" title="重新推演" aria-label="重新推演">
              <span class="retry-icon">↻</span>
            </button>
          </div>
        </div>
      </div>
    `;
    container.appendChild(div);
    this._scrollToBottom();

    // 绑定重试
    const retryBtn = div.querySelector('#btn-retry-generate');
    if (retryBtn) {
      retryBtn.onclick = () => {
        div.remove();
        this._autoGenerateNarrative(container);
      };
    }
  },

  /** 将未完成的聊天会话保存到历史列表 */
  _saveToHistory() {
    try {
      const title = this._deriveTitleFromMessages();
      const pendingStory = {
        id: 'pending_' + Date.now(),
        title: title || '未完成的推演',
        _pending: true,
        _chatSession: {
          messages: this.messages,
          fields: this.fields,
          isComplete: this.isComplete,
          isFallback: this.isFallback,
          _fallbackStep: this._fallbackStep,
          _fallbackAnswers: this._fallbackAnswers,
          uploadedMedia: this.uploadedMedia,
        },
        createdAt: new Date().toISOString(),
      };
      Store.addStory(pendingStory);
    } catch (e) {
      console.warn('_saveToHistory failed:', e);
    }
  },

  /** 从聊天消息中提取标题 */
  _deriveTitleFromMessages() {
    const userMsgs = this.messages.filter(m => m.role === 'user');
    if (userMsgs.length === 0) return '未命名对话';
    const first = userMsgs[0].content || '';
    const clean = first.replace(/<[^>]+>/g, '').trim();
    return clean.length > 20 ? clean.slice(0, 20) + '…' : clean;
  },

  _scrollToBottom() {
    const container = document.getElementById('chat-messages');
    if (container) {
      requestAnimationFrame(() => {
        container.scrollTop = container.scrollHeight;
        setTimeout(() => { container.scrollTop = container.scrollHeight; }, 50);
        setTimeout(() => { container.scrollTop = container.scrollHeight; }, 200);
      });
    }
  },

  /** 卸载页面 — 中止挂起的请求 + 重置状态 */
  unmount() {
    this._pageUnmounted = true;
    if (this._initTimer) {
      clearTimeout(this._initTimer);
      this._initTimer = null;
    }
    if (this._abortController) {
      this._abortController.abort();
      this._abortController = null;
    }
    this.messages = [];
    this.fields = {};
    this.isComplete = false;
    this.isWaiting = false;
    this.isFallback = false;
    this.uploadedMedia = [];
  }
};