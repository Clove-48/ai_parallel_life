/**
 * Canvas 感悟卡片生成器
 * 在 Canvas 上绘制精美的感悟卡片，支持导出图片
 */
const CanvasCard = {
  /** 在指定 canvas 元素上绘制卡片 */
  draw(canvas, story) {
    const ref = story.reflection || {};
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    // 背景
    const gradient = ctx.createLinearGradient(0, 0, 0, h);
    gradient.addColorStop(0, '#fdf8f0');
    gradient.addColorStop(1, '#f5efe3');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, w, h);

    // 顶部装饰线
    ctx.fillStyle = '#c8842c';
    ctx.fillRect(40, 0, w - 80, 3);
    ctx.fillStyle = '#8b6faa';
    ctx.fillRect(w / 2, 0, w / 2 - 40, 3);

    // 标题
    ctx.fillStyle = '#3a3226';
    ctx.font = 'bold 22px "Noto Sans CJK SC", "PingFang SC", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AI 平行人生', w / 2, 55);

    // 装饰图标
    ctx.font = '32px serif';
    ctx.fillText('✨', w / 2, 100);

    // 感悟文字
    ctx.fillStyle = '#c8842c';
    ctx.font = 'bold 18px "Noto Sans CJK SC", "PingFang SC", sans-serif';
    ctx.textAlign = 'left';

    const insight = ref.insight || '每一条路都有风景';
    this._wrapText(ctx, insight, 50, 150, w - 100, 28);

    // 分隔线
    ctx.strokeStyle = '#e8ddd0';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(50, 230);
    ctx.lineTo(w - 50, 230);
    ctx.stroke();

    // 正文
    ctx.fillStyle = '#8c8478';
    ctx.font = '14px "Noto Sans CJK SC", "PingFang SC", sans-serif';
    const message = ref.message || '';
    this._wrapText(ctx, message, 50, 260, w - 100, 24);

    // 底部
    ctx.fillStyle = '#c8842c';
    ctx.font = '12px "WorkSans", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('AI 平行人生 — What If You Had Chosen Differently?', w / 2, h - 30);
  },

  /** 文字换行绘制 */
  _wrapText(ctx, text, x, y, maxWidth, lineHeight) {
    const chars = text.split('');
    let line = '';
    let lineY = y;

    for (const char of chars) {
      const testLine = line + char;
      const metrics = ctx.measureText(testLine);
      if (metrics.width > maxWidth && line) {
        ctx.fillText(line, x, lineY);
        line = char;
        lineY += lineHeight;
      } else {
        line = testLine;
      }
    }
    if (line) {
      ctx.fillText(line, x, lineY);
    }
    return lineY;
  }
};