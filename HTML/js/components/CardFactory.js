/**
 * 卡片渲染工厂 — 根据卡片类型渲染不同的视觉样式
 *
 * 关键约束（按产品要求）：
 * 1. 照片/语音**只放在真实线**（用户走过的路）— 平行线是用户没走过的路，
 *    不应该出现用户的真实照片
 * 2. 用户上传多张照片时，会按 photo 卡片在真实线里的顺序轮询绑定，
 *    不同 photo 卡片挂不同的图
 * 3. 用户上传 1 张图时，第一张 photo 卡片使用该图
 * 4. 没有图时 photo 卡片降级为 diary
 */
const CardFactory = {
  /** 真实线已使用的图片计数器 — 模块级状态，避免同一张图在多个 photo 卡里重复 */
  _realPhotoIndex: 0,
  _realLineReset: false,

  /**
   * 重置图片绑定状态（每次重新渲染时间线时调用）
   * 真实线从第 0 张图开始按顺序轮换
   */
  resetRealMediaBinding() {
    this._realPhotoIndex = 0;
  },

  /** 渲染单张卡片 */
  render(card, index, lineType, mediaList) {
    const animDelay = `animation-delay: ${index * 0.1}s`;
    const lineClass = lineType === 'real' ? 'real-line' : lineType === 'parallel' ? 'parallel-line' : '';

    // mediaList 兜底：可能是 undefined、[]、或 [{url,type,filename}]
    const safeMedia = Array.isArray(mediaList) ? mediaList : [];

    // 平行线 / 无关键信息 → 不挂用户图片（产品需求：照片只在真实线）
    const shouldAttachMedia = lineType === 'real' && safeMedia.length > 0;

    let effectiveType = card.type;
    if (card.type === 'photo' && !shouldAttachMedia) {
      effectiveType = 'diary';
    }
    if (card.type === 'voicenote' && (!shouldAttachMedia || !this._findMedia(safeMedia, 'audio'))) {
      effectiveType = 'diary';
    }

    switch (effectiveType) {
      case 'chat': return this._chat(card, animDelay, lineClass);
      case 'moment': return this._moment(card, animDelay, lineClass);
      case 'photo': return this._photo(card, animDelay, lineClass, safeMedia);
      case 'voicenote': return this._voicenote(card, animDelay, lineClass, safeMedia);
      case 'diary': return this._diary(card, animDelay, lineClass, lineType);
      default: return this._default(card, animDelay, lineClass);
    }
  },

  /**
   * 真实线：按 photo 卡片顺序轮询取图；返回 {image, audio} 上下文
   */
  _bindRealMedia(mediaList) {
    const safeMedia = Array.isArray(mediaList) ? mediaList : [];
    const images = safeMedia.filter(m => m && m.type === 'image');
    const audios = safeMedia.filter(m => m && m.type === 'audio');
    if (images.length === 0) {
      return { image: null, audio: audios[0] || null };
    }
    // 轮询：第 N 张 photo 卡用 images[N % images.length]
    const idx = this._realPhotoIndex % images.length;
    const image = images[idx];
    this._realPhotoIndex += 1;
    return { image, audio: audios[0] || null };
  },

  _mediaUrl(url) {
    if (!url) return '';
    if (url.startsWith('http')) return url;
    const apiBase = (window.API && window.API.BASE_URL) || 'http://localhost:8000/api';
    const fileBase = apiBase.replace(/\/api\/?$/, '');
    return `${fileBase}${url}`;
  },

  _chat(card, delay, lineClass) {
    return `
    <div class="story-card card-chat ${lineClass}" style="${delay}">
      <div class="card-scene">${this._escape(card.scene)}</div>
      <div class="card-emotion">${this._escape(card.emotion)}</div>
      <div class="card-content">${this._escape(card.content)}</div>
      <div class="card-time">${card.time || ''}</div>
    </div>`;
  },

  _moment(card, delay, lineClass) {
    return `
    <div class="story-card card-moment ${lineClass}" style="${delay}">
      <div class="card-scene">${this._escape(card.scene)}</div>
      <div class="moment-header">
        <div class="moment-avatar">👤</div>
        <span class="moment-name">平行时空的我</span>
      </div>
      <div class="card-content">${this._escape(card.content)}</div>
      <div class="card-time">${card.time || ''}</div>
    </div>`;
  },

  _photo(card, delay, lineClass, mediaList) {
    // 真实线：按 photo 卡片顺序轮询取用户上传的图片
    // 平行线 / 无媒体 → 已在外层降级为 diary，这里兜底
    const bound = this._bindRealMedia(mediaList);
    const userImage = bound.image;

    if (!userImage) {
      return this._diary(card, delay, lineClass, 'real');
    }

    const apiBase = (window.API && window.API.BASE_URL) || 'http://localhost:8000/api';
    const fileBase = apiBase.replace(/\/api\/?$/, '');
    const imgSrc = userImage.url.startsWith('http')
      ? userImage.url
      : `${fileBase}${userImage.url}`;

    const photoHtml = `
      <div class="photo-frame user-photo">
        <img src="${this._escape(imgSrc)}" alt="${this._escape(card.scene)}" class="user-uploaded-img" loading="lazy" crossorigin="anonymous" onerror="this.closest('.photo-frame').classList.add('img-failed');this.style.display='none'">
        <div class="photo-date">${card.time || ''}</div>
      </div>`;

    return `
    <div class="story-card card-photo ${lineClass}" style="${delay}">
      <div class="card-scene">${this._escape(card.scene)}</div>
      ${photoHtml}
      <div class="card-emotion">${this._escape(card.emotion)}</div>
      <div class="card-content">${this._escape(card.content)}</div>
      <div class="card-time">${card.time || ''}</div>
    </div>`;
  },

  _voicenote(card, delay, lineClass, mediaList) {
    // 真实线：取用户上传的音频（只取第一个）
    const bound = this._bindRealMedia(mediaList);
    const userAudio = bound.audio;

    if (!userAudio) {
      return this._diary(card, delay, lineClass, 'real');
    }

    const apiBase = (window.API && window.API.BASE_URL) || 'http://localhost:8000/api';
    const fileBase = apiBase.replace(/\/api\/?$/, '');
    const audioSrc = userAudio.url.startsWith('http')
      ? userAudio.url
      : `${fileBase}${userAudio.url}`;

    const voiceHtml = `
      <div class="voice-tape user-audio">
        <div class="tape-reel"></div>
        <span class="tape-label">语音日记 · ${card.time || ''}</span>
        <audio class="user-uploaded-audio" src="${this._escape(audioSrc)}" controls preload="none" crossorigin="anonymous"></audio>
      </div>`;

    return `
    <div class="story-card card-voicenote ${lineClass}" style="${delay}">
      <div class="card-scene">${this._escape(card.scene)}</div>
      ${voiceHtml}
      <div class="card-emotion">${this._escape(card.emotion)}</div>
      <div class="card-content voice-text">${this._escape(card.content)}</div>
    </div>`;
  },

  _diary(card, delay, lineClass, lineType) {
    // 区分真实线 / 平行线 的日记样式，让卡片更有层次
    const lineEmoji = lineType === 'parallel' ? '✨' : lineType === 'real' ? '📖' : '📖';
    return `
    <div class="story-card card-diary ${lineClass}" style="${delay}">
      <div class="card-scene">${lineEmoji} ${this._escape(card.scene)}</div>
      <div class="card-emotion">${this._escape(card.emotion)}</div>
      <div class="card-content">${this._escape(card.content)}</div>
      <div class="card-time">${card.time || ''}</div>
    </div>`;
  },

  _default(card, delay, lineClass) {
    return `
    <div class="story-card ${lineClass}" style="${delay}">
      <div class="card-scene">${this._escape(card.scene || '')}</div>
      <div class="card-emotion">${this._escape(card.emotion || '')}</div>
      <div class="card-content">${this._escape(card.content || '')}</div>
      <div class="card-time">${card.time || ''}</div>
    </div>`;
  },

  /** 从 mediaList 中查找指定类型的媒体 */
  _findMedia(mediaList, type) {
    if (!mediaList || !Array.isArray(mediaList) || mediaList.length === 0) return null;
    return mediaList.find(m => m.type === type) || null;
  },

  _escape(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }
};