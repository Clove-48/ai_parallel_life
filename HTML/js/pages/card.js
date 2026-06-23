/**
 * 感悟卡片页 — 展示、翻转、保存并分享感悟卡片
 * 支持卡片正面/背面翻转、收藏夹、结束语动画
 */

/** 把字符串各字符的 charCode 累加起来作为种子 */
function sumCodes(s) {
  let sum = 0;
  for (let i = 0; i < s.length; i++) sum += s.charCodeAt(i);
  return sum;
}

const CardPage = {
  storyId: null,
  _isFlipped: false,

  async render(params) {
    const id = params[0];
    this.storyId = id;
    let story = Store.getStory(id);

    // 本地找不到时尝试从后端加载
    if (!story) {
      try {
        const remote = await API.fetchStory(id);
        if (remote) {
          story = {
            id: remote.id,
            createdAt: remote.createdAt,
            title: remote.title || '平行人生',
            node: remote.node || {},
            narratives: remote.narratives || { real: [], parallel: [] },
            reflection: remote.reflection || {},
          };
          Store.addStory(story);
        }
      } catch { /* ignore */ }
    }

    if (!story) {
      return `<div class="page page-card"><p style="color:var(--muted)">故事未找到</p><button class="btn-primary" onclick="Router.goBack('')">返回</button></div>`;
    }

    const ref = story.reflection || {};
    // 关键词对比：根据故事节点 + 反思内容动态变化，避免所有卡片都长得一样
    const keywords = ref.keywords || this._deriveKeywords(story);

    return `
    <div class="page page-card">
      <div class="flip-container" id="flip-container">
        <div class="flip-inner" id="flip-inner">
          <!-- 正面 -->
          <div class="flip-front">
            <div class="reflection-card" id="reflection-card">
              <div class="card-stripe"></div>
              <div class="card-icon-top">✨</div>
              <h2>你的平行人生感悟</h2>
              <div class="insight">${ref.insight || '每一条路都有风景'}</div>
              <div class="message">${(ref.message || '').replace(/\n/g, '<br>')}</div>
              <div class="card-footer">
                AI 平行人生 · 每一条路都有风景
              </div>
              <button class="flip-btn" id="flip-to-back">↻ 翻转查看关键词对比</button>
            </div>
          </div>
          <!-- 背面 -->
          <div class="flip-back">
            <div class="reflection-card" id="reflection-card-back">
              <div class="card-stripe"></div>
              <div class="card-back-content">
                <div class="back-title">两条路 · 两种风景</div>
                <div class="keyword-compare">
                  <div class="kw-col real">
                    <div class="kw-col-header">真实之路</div>
                    ${keywords.real.map(k => `<span class="kw-item">${k}</span>`).join('')}
                  </div>
                  <div class="kw-col parallel">
                    <div class="kw-col-header">平行时空</div>
                    ${keywords.parallel.map(k => `<span class="kw-item">${k}</span>`).join('')}
                  </div>
                </div>
                <div style="text-align:center;margin-top:0.5rem;font-size:0.75rem;color:var(--ink-tertiary);">
                  每条路都有属于它的风景
                </div>
              </div>
              <button class="flip-btn" id="flip-to-front">↻ 回到感悟</button>
            </div>
          </div>
        </div>
      </div>

      <!-- 隐藏 Canvas 用于导出 -->
      <canvas id="reflection-canvas" width="400" height="560" style="display:none;"></canvas>

      <div class="card-actions" id="card-actions-row1">
        <button class="btn-primary" id="card-share">
          ✦ 分享感悟
        </button>
        <button class="btn-primary" id="card-save" style="background:var(--parallel-color);box-shadow:0 4px 20px rgba(139,111,170,0.20);">
          ♡ 收藏
        </button>
      </div>
      <div class="card-actions" id="card-actions-row2" style="margin-top:0.75rem;">
        <button class="btn-secondary" id="card-ending">
          ☽ 尾声
        </button>
        <button class="btn-secondary" id="card-retry">
          ↻ 再来一次
        </button>
        <button class="btn-secondary" id="card-history">
          📚 历史记录
        </button>
        <button class="btn-secondary" id="card-feedback" style="border-color: var(--parallel-border); color: var(--parallel-color);">
          💬 反馈建议
        </button>
        <button class="btn-secondary btn-clear-data" id="card-clear" title="清除本机的所有故事、收藏和聊天记录">
          🧹 清除本地记录
        </button>
      </div>
      <div class="card-actions" id="card-actions-row3" style="margin-top:0.75rem;justify-content:center;">
        <button class="btn-secondary btn-home-link" id="card-home" title="回到首页">
          <span class="home-icon">🏠</span>
          <span>回到首页</span>
        </button>
      </div>

      <!-- 收藏夹 FAB -->
      <div class="collection-fab" id="collection-fab" style="display:none;">
        📖
        <span class="fab-badge" id="fab-badge">0</span>
      </div>
    </div>`;
  },

  mount(params) {
    const id = params[0];
    const story = Store.getStory(id);

    if (story) {
      // 在 Canvas 上绘制卡片
      const canvas = document.getElementById('reflection-canvas');
      if (canvas) {
        CanvasCard.draw(canvas, story);
      }
    }

    // 翻转 — 使用 2D class 切换替代 3D transform
    this._isFlipped = false;
    const flipInner = document.getElementById('flip-inner');
    document.getElementById('flip-to-back').onclick = () => {
      this._isFlipped = true;
      flipInner.classList.add('flipped');
    };
    document.getElementById('flip-to-front').onclick = () => {
      this._isFlipped = false;
      flipInner.classList.remove('flipped');
    };

    // 分享
    document.getElementById('card-share').onclick = () => {
      ShareSheet.show(story);
    };

    // 收藏/取消收藏
    document.getElementById('card-save').onclick = () => {
      this._toggleCollection(story);
    };

    // 结束语动画
    document.getElementById('card-ending').onclick = (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._showEnding();
    };

    document.getElementById('card-retry').onclick = () => {
      Store.resetSession();
      Router.navigate('chat');
    };

    document.getElementById('card-history').onclick = () => {
      Router.navigate('history');
    };

    // 反馈建议
    document.getElementById('card-feedback').onclick = () => {
      this._showFeedback();
    };

    // 清除本地记录
    const clearBtn = document.getElementById('card-clear');
    if (clearBtn) {
      clearBtn.onclick = () => this._confirmClearLocalData();
    }

    // 回到首页
    document.getElementById('card-home').onclick = () => {
      Router.navigate('home');
    };

    // 更新收藏夹 FAB
    this._updateFab();
    document.getElementById('collection-fab').onclick = () => {
      this._showCollection();
    };

    // 同步收藏按钮的初始状态
    this._updateSaveButton(story);
  },

  /** 同步收藏按钮的初始状态 — 已收藏显示"已收藏" */
  _updateSaveButton(story) {
    if (!story) return;
    const btn = document.getElementById('card-save');
    if (!btn) return;
    const saved = Helpers.storage.get('parallel_life_collection', []);
    const isSaved = saved.some(s => s.id === story.id);
    if (isSaved) {
      btn.textContent = '♥ 已收藏';
      btn.style.background = 'var(--ink-muted)';
      btn.style.boxShadow = 'none';
    } else {
      btn.textContent = '♡ 收藏';
      btn.style.background = 'var(--parallel-color)';
      btn.style.boxShadow = '0 4px 20px rgba(139,111,170,0.20)';
    }
  },

  /** 切换收藏/取消收藏 */
  _toggleCollection(story) {
    if (!story) return;
    const saved = Helpers.storage.get('parallel_life_collection', []);
    const idx = saved.findIndex(s => s.id === story.id);
    if (idx !== -1) {
      // 取消收藏
      saved.splice(idx, 1);
      Helpers.storage.set('parallel_life_collection', saved);
      this._updateSaveButton(story);
      this._updateFab();
      this._toast('已取消收藏');
    } else {
      saved.unshift({
        id: story.id,
        title: story.title || '平行人生',
        insight: (story.reflection && story.reflection.insight) || '',
        createdAt: story.createdAt || Helpers.nowISO(),
      });
      Helpers.storage.set('parallel_life_collection', saved);
      this._updateSaveButton(story);
      this._updateFab();
      this._toast('♡ 已收藏');
    }
  },

  /** 更新收藏夹 FAB */
  _updateFab() {
    const saved = Helpers.storage.get('parallel_life_collection', []);
    const fab = document.getElementById('collection-fab');
    const badge = document.getElementById('fab-badge');
    if (fab && badge) {
      if (saved.length > 0) {
        fab.style.display = 'flex';
        badge.textContent = saved.length;
      } else {
        fab.style.display = 'none';
      }
    }
  },

  /** 展示收藏夹 */
  _showCollection() {
    const saved = Helpers.storage.get('parallel_life_collection', []);
    if (saved.length === 0) {
      this._toast('还没有收藏的感悟');
      return;
    }

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay collection-modal';
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <h3>📖 我的收藏</h3>
        <div class="collection-list">
          ${saved.map((s, i) => `
            <div class="collection-item" data-id="${s.id}" style="animation-delay:${i * 0.05}s">
              <span class="ci-icon">🪞</span>
              <span class="ci-text">${s.insight || s.title}</span>
              <span class="ci-date">${Helpers.shortDate(s.createdAt)}</span>
              <button class="ci-remove" data-id="${s.id}" title="取消收藏">×</button>
            </div>
          `).join('')}
        </div>
        <button class="modal-close" id="col-close">关闭</button>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelectorAll('.collection-item').forEach(item => {
      item.onclick = (e) => {
        // 点击删除按钮不跳转
        if (e.target.closest('.ci-remove')) return;
        overlay.remove();
        Router.navigate(`timeline/${item.dataset.id}`);
      };
    });

    // 取消收藏
    overlay.querySelectorAll('.ci-remove').forEach(btn => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const id = btn.dataset.id;
        const current = Helpers.storage.get('parallel_life_collection', []);

        // 类型不匹配时（数字 vs 字符串）做宽松比较 — 防止"没有收藏"的误判
        const filtered = current.filter(s => String(s.id) !== String(id));
        // 没有任何变化时直接返回（避免误提示）
        if (filtered.length === current.length) {
          this._toast('这条收藏已经不在了');
          return;
        }
        Helpers.storage.set('parallel_life_collection', filtered);
        this._updateFab();
        // 同步当前页面"收藏"按钮的状态
        // （避免在弹窗里取消收藏后，卡片页还显示"已收藏"）
        const currentStory = Store.getStory(this.storyId);
        if (currentStory) this._updateSaveButton(currentStory);
        // 找到当前被点击的 item 元素
        const itemEl = btn.closest('.collection-item');
        // 移除该项的平滑动画
        if (itemEl) {
          itemEl.style.transition = 'opacity 0.25s, transform 0.25s';
          itemEl.style.opacity = '0';
          itemEl.style.transform = 'translateX(20px)';
        }
        setTimeout(() => {
          // 重新查询最新数据
          const latest = Helpers.storage.get('parallel_life_collection', []);
          if (latest.length === 0) {
            // 最后一个已取消 — 直接关闭弹窗
            overlay.remove();
            this._toast('已取消收藏');
          } else {
            // 还有其他收藏：重新渲染列表（保持弹窗打开）
            overlay.remove();
            this._showCollection();
            this._toast('已取消收藏');
          }
        }, 260);
      };
    });

    document.getElementById('col-close').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
  },

  /**
   * 兜底：根据故事内容推导关键词
   * 优先级：
   * 1) reflection.keywords（由 LLM 在生成时给出）
   * 2) 从 narratives.real / parallel 内容里抽 2~4 字实词
   * 3) 从用户聊天里抽 2~4 字实词
   * 4) 固定词库
   * 返回 4 个词的数组。
   */
  _deriveKeywords(story) {
    const ref = story.reflection || {};
    const realPool = [
      ['踏实', '陪伴', '日常', '安稳'],
      ['熟悉', '坚定', '温柔', '沉淀'],
      ['靠岸', '落地', '热汤', '灯下'],
      ['细水', '常伴', '累积', '坚守'],
      ['依靠', '规律', '平静', '归属'],
      ['扎稳', '烟火', '岁月', '港湾'],
    ];
    const parallelPool = [
      ['未知', '远行', '自由', '重启'],
      ['陌生', '漂泊', '独自', '跳出'],
      ['代价', '破局', '追光', '异乡'],
      ['大城', '海风', '霓虹', '迁徙'],
      ['夜行', '回响', '脱轨', '孤岛'],
      ['岔路', '起落', '未竟', '空旷'],
    ];

    // 停用词（与后端保持一致）
    const stop = new Set([
      '我们', '他们', '你们', '这是', '那个', '这个', '一些', '没有', '什么', '可以',
      '就是', '还是', '已经', '现在', '可能', '应该', '知道', '感觉', '觉得', '因为',
      '所以', '但是', '不过', '怎么', '为什么', '其实', '只是', '这样', '那样', '一种',
      '然后', '后来', '当时', '如果', '也许', '大概', '一定', '一直', '一下', '开始',
      '结束', '选择', '决定', '走', '去', '来', '做', '是', '在', '了', '的', '和',
      '与', '也', '都', '还', '再', '把', '让', '给', '用', '到', '从', '被', '我',
      '你', '他', '她', '它', '的', '地', '得', '啊', '吧', '呢', '嘛', '呗', '哇',
      '哦', '嗯', '啊', '呵', '嘿', '哈', '啦', '噢', '哎', '嘛', '如果', '会想',
    ]);

    // 校验一个词是否合规：必须是 2~4 字、不含标点/数字、不在停用词里
    const isValidWord = (w) => {
      if (typeof w !== 'string') return false;
      const t = w.trim();
      if (!t) return false;
      if (!/^[\u4e00-\u9fa5]{2,4}$/.test(t)) return false;
      if (stop.has(t)) return false;
      return true;
    };

    // 从字符串里抽 2 字 / 3~4 字 n-gram
    const extract = (text, limit) => {
      if (!text) return [];
      const clean = String(text).replace(/[^\u4e00-\u9fa5]/g, ' ');
      const freq = new Map();
      // 2 字
      const re2 = /[\u4e00-\u9fa5]{2}/g;
      let m;
      while ((m = re2.exec(clean)) !== null) {
        const w = m[0];
        if (isValidWord(w)) freq.set(w, (freq.get(w) || 0) + 1);
      }
      // 3~4 字（权重低些）
      const re34 = /[\u4e00-\u9fa5]{3,4}/g;
      while ((m = re34.exec(clean)) !== null) {
        const w = m[0];
        if (isValidWord(w)) freq.set(w, (freq.get(w) || 0) + 0.3);
      }
      return [...freq.entries()]
        .sort((a, b) => b[1] - a[1] || b[0].length - a[0].length)
        .slice(0, limit)
        .map(([w]) => w)
        .filter(isValidWord);
    };

    // 1) 优先用 reflection.keywords（必须每条 ≥ 4 个合法词）
    const kw = ref.keywords || {};
    const realFromBackend = Array.isArray(kw.real) ? kw.real.filter(isValidWord) : [];
    const parallelFromBackend = Array.isArray(kw.parallel) ? kw.parallel.filter(isValidWord) : [];

    // 真实线：来自真实叙述 + 真实结果 + 用户消息
    const realTexts = (story.narratives && story.narratives.real) || [];
    const parallelTexts = (story.narratives && story.narratives.parallel) || [];
    const userMsgs = (story.chatMessages || []).filter(m => m.role === 'user');

    const realText = [
      ...realTexts.map(c => `${c.scene || ''} ${c.content || ''} ${c.emotion || ''}`),
      story.node?.actualOutcome || '',
      story.node?.actualChoice || '',
      ...userMsgs.map(m => m.content || ''),
    ].join(' ');
    const parallelText = [
      ...parallelTexts.map(c => `${c.scene || ''} ${c.content || ''} ${c.emotion || ''}`),
      story.node?.imagination || '',
      story.node?.choiceB || '',
      ...userMsgs.map(m => m.content || ''),
    ].join(' ');

    const real = [];
    const parallel = [];

    // 2) 拼装真实线：后端 > 叙述抽取 > 固定池
    real.push(...realFromBackend);
    if (real.length < 4) {
      for (const w of extract(realText, 8)) {
        if (real.length >= 4) break;
        if (!real.includes(w)) real.push(w);
      }
    }
    while (real.length < 4) {
      const seed = sumCodes(story.id || 'r') % realPool.length;
      for (let i = 0; i < realPool[seed].length; i++) {
        if (real.length >= 4) break;
        const w = realPool[seed][i];
        if (!real.includes(w)) real.push(w);
      }
      break;
    }

    // 3) 拼装平行线
    parallel.push(...parallelFromBackend);
    if (parallel.length < 4) {
      for (const w of extract(parallelText, 8)) {
        if (parallel.length >= 4) break;
        if (!parallel.includes(w)) parallel.push(w);
      }
    }
    while (parallel.length < 4) {
      const seed = sumCodes((story.id || 'p') + 'p') % parallelPool.length;
      for (let i = 0; i < parallelPool[seed].length; i++) {
        if (parallel.length >= 4) break;
        const w = parallelPool[seed][i];
        if (!parallel.includes(w)) parallel.push(w);
      }
      break;
    }

    return { real: real.slice(0, 4), parallel: parallel.slice(0, 4) };
  },

  /**
   * 二次确认 → 清除本机 localStorage 里的所有故事 / 收藏 / 聊天记录
   * 不触碰后端数据库；这是一个本地数据治理工具，给在意隐私的用户一个明确的"出口"
   */
  _confirmClearLocalData() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <h3>🧹 清除本机记录？</h3>
        <p style="font-size:0.88rem;color:var(--ink-muted);line-height:1.7;margin-bottom:0.4rem;">
          这会删除你这台设备上保存的：
        </p>
        <ul style="font-size:0.85rem;color:var(--ink-muted);line-height:1.8;padding-left:1.4rem;margin-bottom:1rem;">
          <li>所有已生成的平行人生故事</li>
          <li>所有收藏的感悟</li>
          <li>当前未完成的聊天会话</li>
        </ul>
        <p style="font-size:0.78rem;color:var(--ink-tertiary);line-height:1.6;margin-bottom:1rem;">
          清除后无法恢复。服务器上不会保留这些内容。
        </p>
        <div class="feedback-actions">
          <button class="btn-primary" id="clear-confirm" style="background:#c66;color:#fff;box-shadow:0 4px 14px rgba(200,80,80,0.2);">确认清除</button>
          <button class="btn-secondary" id="clear-cancel">再想想</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);
    overlay.querySelector('#clear-cancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };
    overlay.querySelector('#clear-confirm').onclick = () => {
      try {
        // 清掉所有 parallel-life 相关的 key
        const keys = [];
        for (let i = 0; i < localStorage.length; i++) {
          const k = localStorage.key(i);
          if (k && (k.startsWith('parallel_life') || k.startsWith('parallel-life'))) {
            keys.push(k);
          }
        }
        keys.forEach(k => localStorage.removeItem(k));
        this._toast('本机记录已清除');
        overlay.remove();
        // 回到首页
        setTimeout(() => Router.navigate('home'), 600);
      } catch (e) {
        this._toast('清除失败，请稍后重试');
      }
    };
  },

  /** 展示结束语动画 */
  _showEnding() {
    const endings = [
      '"你刚才走过的两条路，其实都在指向同一个地方——<br>现在的你。"',
      '"每一个选择都值得被认真对待，<br>包括那个你没选的。"',
      '"平行时空里的你，也在为现在的你加油。"',
      '"那条没走的路，不一定更好，<br>只是不同——就像你这条路一样。"',
      '"人生没有白走的路，<br>每一步都算数。"',
      '"你拥有的不是完美选择的能力，<br>而是把选择变正确的能力。"',
      '"路的两端都是风景，<br>只不过你选了左边。"',
      '"如果当初选了另一条路，<br>你也会想看看这条路的尽头。"',
      '"不是所有的如果都有答案，<br>但每一个答案都曾是一个如果。"',
      '"你正在走的路，就是最好的路——<br>因为它通向现在的你。"',
    ];
    const text = endings[Math.floor(Math.random() * endings.length)];

    const overlay = document.createElement('div');
    overlay.className = 'ending-overlay';
    overlay.innerHTML = `
      <div class="ending-text">${text}</div>
      <div class="ending-amber-dot"></div>
      <button class="ending-close" id="ending-close" aria-label="关闭">×</button>
    `;

    // 必须加到 DOM！之前漏了
    document.body.appendChild(overlay);

    // 点击关闭
    document.getElementById('ending-close').onclick = () => {
      overlay.classList.add('ending-fade-out');
      setTimeout(() => {
        if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
      }, 1500);
    };
    // 点击空白也关闭
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        overlay.classList.add('ending-fade-out');
        setTimeout(() => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 1500);
      }
    };

    // 3.5 秒后自动淡出
    setTimeout(() => {
      if (overlay.parentNode && !overlay.classList.contains('ending-fade-out')) {
        overlay.classList.add('ending-fade-out');
        setTimeout(() => {
          if (overlay.parentNode) overlay.parentNode.removeChild(overlay);
        }, 1500);
      }
    }, 3500);
  },

  _toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  },

  /** 显示反馈弹窗 */
  _showFeedback() {
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.innerHTML = `
      <div class="modal-sheet">
        <div class="modal-handle"></div>
        <h3>💬 反馈建议</h3>
        <p style="font-size:0.85rem;color:var(--ink-muted);margin-bottom:1rem;line-height:1.6;">
          感谢你参与内测！你的每一个想法，都会让平行人生变得更好。
        </p>
        <textarea id="feedback-text" class="feedback-textarea" rows="4" placeholder="说说你的感受吧——有哪些让你触动的瞬间？有什么地方还可以做得更好？" maxlength="500"></textarea>
        <div class="feedback-actions">
          <button class="btn-primary" id="feedback-submit">提交反馈</button>
          <button class="btn-secondary" id="feedback-cancel">取消</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    const textarea = overlay.querySelector('#feedback-text');
    overlay.querySelector('#feedback-submit').onclick = async () => {
      const text = textarea.value.trim();
      if (!text) {
        window.GlobalToast.warning('请输入反馈内容');
        return;
      }
      try {
        await API.submitFeedback({ content: text, version: '1.0.0-beta' });
        window.GlobalToast.success('反馈已提交，感谢你的建议！');
      } catch {
        window.GlobalToast.warning('反馈提交失败，请稍后重试');
      }
      overlay.remove();
    };
    overlay.querySelector('#feedback-cancel').onclick = () => overlay.remove();
    overlay.onclick = (e) => { if (e.target === overlay) overlay.remove(); };

    // 自动聚焦
    setTimeout(() => textarea.focus(), 100);
  },

  unmount() {
    this._isFlipped = false;
    // 清理可能残留的 ending overlay
    document.querySelectorAll('.ending-overlay').forEach(el => el.remove());
  }
};