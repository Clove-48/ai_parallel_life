/**
 * AI 平行人生 — 工具函数
 */

const Helpers = {
  /** 生成 UUID */
  uuid() {
    return 'xxxx-xxxx-xxxx'.replace(/x/g, () =>
      ((Math.random() * 16) | 0).toString(16)
    );
  },

  /** 格式化日期 */
  formatDate(isoStr) {
    if (!isoStr) return '未知时间';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '未知时间';
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const min = String(d.getMinutes()).padStart(2, '0');
    return `${y}年${m}月${day}日 ${h}:${min}`;
  },

  /** 简短日期 */
  shortDate(isoStr) {
    if (!isoStr) return '';
    const d = new Date(isoStr);
    if (isNaN(d.getTime())) return '';
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${m}月${day}日`;
  },

  /** 获取当前时间 */
  nowISO() {
    return new Date().toISOString();
  },

  /** 防抖 */
  debounce(fn, delay = 300) {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  },

  /** 节流 */
  throttle(fn, delay = 300) {
    let last = 0;
    return (...args) => {
      const now = Date.now();
      if (now - last >= delay) {
        last = now;
        fn(...args);
      }
    };
  },

  /** 滚动到元素 */
  scrollTo(el, behavior = 'smooth') {
    if (el) el.scrollIntoView({ behavior, block: 'nearest' });
  },

  /** 延时 */
  sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
  },

  /** 输入校验：去除首尾空白，限制长度 */
  sanitizeInput(text, maxLen = 500) {
    if (!text || typeof text !== 'string') return '';
    return text.trim().slice(0, maxLen);
  },

  /** 是否为空输入 */
  isEmptyInput(text) {
    return !text || !text.trim();
  },

  /** 从 localStorage 读写 */
  storage: {
    get(key, def = null) {
      try {
        const v = localStorage.getItem(key);
        return v ? JSON.parse(v) : def;
      } catch {
        return def;
      }
    },
    set(key, val) {
      try {
        localStorage.setItem(key, JSON.stringify(val));
      } catch (e) {
        // localStorage 满时静默处理
        console.warn('localStorage.set 失败:', e.message);
      }
    },
    remove(key) {
      localStorage.removeItem(key);
    }
  }
};