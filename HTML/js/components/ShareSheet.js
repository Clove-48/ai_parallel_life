/**
 * 共享面板 — 分享感悟卡片的弹窗（美化版）
 */
const ShareSheet = {
  /** 显示分享面板 */
  show(story) {
    const ref = story.reflection || {};
    const insight = ref.insight || '每一条路都有风景';

    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay';
    overlay.id = 'share-modal';
    overlay.innerHTML = `
      <div class="modal-sheet" style="padding-top:0.5rem;">
        <div class="modal-handle"></div>

        <!-- 卡片预览 -->
        <div style="background:linear-gradient(135deg, #fdf8f0, #f5efe3);border-radius:var(--radius-md);padding:1.25rem;margin-bottom:1.25rem;border:1px solid var(--hairline-soft);text-align:center;">
          <div style="font-size:1.6rem;margin-bottom:0.5rem;">✨</div>
          <div style="font-family:var(--font-serif);font-size:0.95rem;color:var(--real-color);line-height:1.6;margin-bottom:0.5rem;">"${insight}"</div>
          <div style="font-size:0.7rem;color:var(--ink-tertiary);">AI 平行人生 · What If You Had Chosen Differently?</div>
        </div>

        <h3 style="font-family:var(--font-serif);font-size:1rem;font-weight:400;margin-bottom:1rem;text-align:center;color:var(--ink-strong);">分享这份感悟</h3>

        <div class="share-options">
          <button class="share-option" id="share-save">
            <span class="so-icon" style="background:rgba(200,132,44,0.1);color:var(--real-color)">💾</span>
            <span class="share-label">保存图片到本地</span>
            <span class="share-hint">PNG 格式</span>
          </button>
          <button class="share-option" id="share-copy">
            <span class="so-icon" style="background:rgba(139,111,170,0.1);color:var(--parallel-color)">📋</span>
            <span class="share-label">复制分享文案</span>
            <span class="share-hint">带排版</span>
          </button>
          <button class="share-option" id="share-wechat">
            <span class="so-icon" style="background:rgba(7,193,96,0.1);color:#07C160">💬</span>
            <span class="share-label">分享到微信</span>
            <span class="share-hint">截图后分享</span>
          </button>
          <button class="share-option" id="share-weibo">
            <span class="so-icon" style="background:rgba(230,45,45,0.1);color:#E62D2D">�</span>
            <span class="share-label">分享到微博</span>
            <span class="share-hint">截图后分享</span>
          </button>
        </div>
        <button class="modal-close" id="share-close">取消</button>
      </div>
    `;
    document.body.appendChild(overlay);

    document.getElementById('share-save').onclick = () => {
      this._saveCard(story);
    };
    document.getElementById('share-copy').onclick = () => {
      this._copyText(story);
    };
    document.getElementById('share-wechat').onclick = () => {
      this._saveCard(story);
      this._toast('💬 图片已保存，可前往微信分享');
    };
    document.getElementById('share-weibo').onclick = () => {
      this._saveCard(story);
      this._toast('📢 图片已保存，可前往微博分享');
    };
    document.getElementById('share-close').onclick = () => {
      this._close();
    };
    overlay.onclick = (e) => {
      if (e.target === overlay) this._close();
    };
  },

  _saveCard(story) {
    const canvas = document.getElementById('reflection-canvas');
    if (canvas) {
      const link = document.createElement('a');
      link.download = `平行人生-${story.id || '感悟'}.png`;
      link.href = canvas.toDataURL('image/png');
      link.click();
      this._toast('✅ 卡片已保存');
    } else {
      this._toast('✅ 请截图保存卡片');
    }
    this._close();
  },

  _copyText(story) {
    const ref = story.reflection || {};
    const insight = ref.insight || '';
    const message = ref.message || '';
    const title = story.title || '平行人生';

    const text = `✨ AI 平行人生 · 「${title}」

"${insight}"

${message}

—— 来自「AI 平行人生」
每个人心中都有一个"如果当初"
→ https://parallel-life.app`;

    navigator.clipboard.writeText(text).then(() => {
      this._toast('📋 文案已复制');
    }).catch(() => {
      this._toast('📋 复制失败，请手动复制');
    });
    this._close();
  },

  _close() {
    const el = document.getElementById('share-modal');
    if (el) {
      el.style.transition = 'opacity 0.2s ease';
      el.style.opacity = '0';
      setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 200);
    }
  },

  _toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    document.body.appendChild(t);
    setTimeout(() => t.remove(), 2500);
  }
};