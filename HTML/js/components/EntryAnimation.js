/**
 * 时光机式入场动画 — 粒子时钟 → 倒转 → 散开 → 汇聚为标题 → 停留 → 淡出
 * "你想回到哪个时刻？"
 *
 * 修复点：
 * 1) 离屏 Canvas 同步 devicePixelRatio + 使用系统字体兜底，确保能采到像素
 * 2) 汇聚阶段延长到 1.8 秒，并在完成后**停留 1.2 秒**显示完整文字
 * 3) 绘制文字时也 fallback 到普通中文字体，避免字体未加载时画不出字
 */
const EntryAnimation = (() => {
  let canvas, ctx, W, H, dpr;
  let particles = [];
  let phase = 0;        // 0=时钟 1=散开 2=汇聚 3=停留 4=完成
  let startTime = 0;
  let resolveCallback = null;
  let animId = null;
  let text = '你想回到哪个时刻？';
  let reachedSettle = false;  // 文字是否已显示

  // ── 粒子池 ──
  class Particle {
    constructor(x, y, targetX, targetY, hue) {
      this.x = x;
      this.y = y;
      this.tx = targetX;
      this.ty = targetY;
      this.hue = hue;
      // 粒子大小：2.0~2.6px，匹配采样步长，肉眼可看出颗粒感
      this.size = 2.0 + Math.random() * 0.6;
      this.alpha = 0.9 + Math.random() * 0.1;
      this.vx = 0;
      this.vy = 0;
      this.phase = Math.random() * Math.PI * 2;
    }

    update(currentPhase) {
      this._phase = currentPhase;
      if (currentPhase === 0) {
        // 时钟 — 轻微呼吸
        this.phase += 0.02;
        this.size = 2 + Math.sin(this.phase) * 0.4;
        return;
      }

      if (currentPhase === 1) {
        // 散开 — 从时钟位置向外飞散
        const angle = Math.atan2(this.y - H / 2, this.x - W / 2);
        const force = 1.4 + Math.random() * 1.2;
        this.vx += Math.cos(angle) * force * 0.03;
        this.vy += Math.sin(angle) * force * 0.03;
        this.x += this.vx;
        this.y += this.vy;
        this.vx *= 0.98;
        this.vy *= 0.98;
        // 在散开阶段保持完全可见
        this.alpha = Math.min(1, this.alpha + 0.02);
        return;
      }

      if (currentPhase === 2) {
        // 汇聚 — 强力移向目标
        const dx = this.tx - this.x;
        const dy = this.ty - this.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        // 距离越远越快，逼近阈值时减速
        const speed = Math.min(0.14, 0.08 + dist * 0.002);
        this.x += dx * speed;
        this.y += dy * speed;
        // 保持粒子大小，不缩小
        this.alpha = Math.min(1, this.alpha + 0.01);
        return;
      }

      if (currentPhase === 3) {
        // 停留 — 粒子保持高透明度，组成清晰文字
        this.phase += 0.015;
        this.x += Math.sin(this.phase) * 0.2;
        this.y += Math.cos(this.phase * 0.8) * 0.2;
        this.alpha = 0.9;
        return;
      }
    }

    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = Math.max(0, Math.min(1, this.alpha));
      ctx.fillStyle = `hsl(${this.hue || 35}, 65%, 45%)`;
      // 停留阶段关闭阴影，避免大量粒子光晕叠加导致模糊
      if (this._phase === 3) {
        ctx.shadowBlur = 0;
      } else {
        ctx.shadowColor = `hsla(${this.hue || 35}, 70%, 55%, ${this.alpha * 0.4})`;
        ctx.shadowBlur = 4;
      }
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // ── 时钟刻度 ──
  function drawClock(t) {
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.22;

    ctx.save();

    const grad = ctx.createRadialGradient(cx, cy, radius * 0.5, cx, cy, radius * 1.3);
    grad.addColorStop(0, 'rgba(200, 132, 44, 0.03)');
    grad.addColorStop(0.5, 'rgba(200, 132, 44, 0.06)');
    grad.addColorStop(1, 'rgba(200, 132, 44, 0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2);
    ctx.fill();

    for (let i = 0; i < 12; i++) {
      const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
      const outer = radius;
      const inner = radius * 0.85;
      ctx.strokeStyle = 'rgba(200, 132, 44, 0.18)';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.moveTo(cx + Math.cos(angle) * inner, cy + Math.sin(angle) * inner);
      ctx.lineTo(cx + Math.cos(angle) * outer, cy + Math.sin(angle) * outer);
      ctx.stroke();
    }

    ctx.fillStyle = 'rgba(200, 132, 44, 0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, 3, 0, Math.PI * 2);
    ctx.fill();

    // 倒转的秒针
    const secAngle = (t / 1.6) * Math.PI * 2 - Math.PI / 2;
    ctx.strokeStyle = 'rgba(200, 132, 44, 0.30)';
    ctx.lineWidth = 1.4;
    ctx.beginPath();
    ctx.moveTo(cx, cy);
    ctx.lineTo(cx + Math.cos(secAngle) * radius * 0.75, cy + Math.sin(secAngle) * radius * 0.75);
    ctx.stroke();

    ctx.restore();
  }

  // ── 兜底字体 ──
  function pickFontFamily(size, weight = 400) {
    return `${weight} ${size}px "InstrumentSerif", "Georgia", "Noto Serif SC", "Songti SC", "STSong", "Times New Roman", serif`;
  }

  // ── 关键：多字体回退扫描 + 像素采样 ──
  // 思路：用 2px 步长密集采样文字像素，确保粒子数量充足，文字由颗粒拼成
  function getTextParticles(textStr) {
    const off = document.createElement('canvas');
    const octx = off.getContext('2d');
    off.width = W;
    off.height = H;

    octx.textAlign = 'center';
    octx.textBaseline = 'middle';

    let fontSize = Math.min(W * 0.08, 56);
    if (textStr.length > 8) fontSize = Math.min(W * 0.06, 40);
    if (textStr.length > 12) fontSize = Math.min(W * 0.05, 32);

    octx.fillStyle = '#fff';

    // 字体回退：优先能正确显示中文的字体
    const candidates = [
      `${fontSize}px "PingFang SC", "Microsoft YaHei", "Heiti SC", "Noto Sans CJK SC", sans-serif`,
      `${fontSize}px "Noto Serif SC", "Songti SC", "SimSun", serif`,
      `${fontSize}px "SimHei", "Microsoft YaHei", sans-serif`,
      `${fontSize}px "Arial Unicode MS", sans-serif`,
      `${fontSize}px sans-serif`,
      `${fontSize}px serif`,
      `${fontSize}px monospace`,
    ];

    const STEP = 2;  // 固定 2px 步长 — 密集采样
    const MAX_POINTS = 3000;  // 最多取 3000 个目标点

    let positions = [];
    for (const font of candidates) {
      octx.clearRect(0, 0, W, H);
      octx.font = font;
      octx.fillText(textStr, W / 2, H / 2);
      const data = octx.getImageData(0, 0, W, H).data;
      const found = [];
      for (let y = 0; y < H; y += STEP) {
        for (let x = 0; x < W; x += STEP) {
          const idx = (y * W + x) * 4;
          if (data[idx + 3] > 80) {
            found.push({ x, y });
          }
        }
      }
      if (found.length > 200) {
        positions = found.slice(0, MAX_POINTS);
        break;
      }
    }

    // 兜底：若所有字体都没扫到像素（极少见），用网格点
    if (positions.length < 200) {
      for (let i = 0; i < 600; i++) {
        positions.push({
          x: W * 0.15 + Math.random() * W * 0.7,
          y: H * 0.35 + Math.random() * H * 0.3,
        });
      }
    }
    return positions;
  }

  // ── 阶段时长（秒） ──
  const DUR = { clock: 1.6, scatter: 0.9, gather: 2.5, settle: 3 };

  // ── 主渲染循环 ──
  function render(timestamp) {
    if (!startTime) startTime = timestamp;
    const elapsed = (timestamp - startTime) / 1000;

    // 背景
    ctx.fillStyle = '#f7f5f0';
    ctx.fillRect(0, 0, W, H);

    // 阶段
    let nextPhase;
    if (elapsed < DUR.clock) nextPhase = 0;
    else if (elapsed < DUR.clock + DUR.scatter) nextPhase = 1;
    else if (elapsed < DUR.clock + DUR.scatter + DUR.gather) nextPhase = 2;
    else if (elapsed < DUR.clock + DUR.scatter + DUR.gather + DUR.settle) nextPhase = 3;
    else nextPhase = 4;

    phase = nextPhase;

    if (phase === 4) {
      // 触发完成回调
      if (resolveCallback) {
        const cb = resolveCallback;
        resolveCallback = null;
        cb();
      }
      return;
    }

    if (phase === 0) {
      drawClock(elapsed);
    }

    // 停留阶段 — 粒子保持高 alpha 组成文字
    if (phase === 3) {
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      particles.forEach(p => p.update(phase));
      particles.forEach(p => p.draw(ctx));
      ctx.restore();
    } else {
      particles.forEach(p => p.update(phase));
      particles.forEach(p => p.draw(ctx));
    }

    // 时钟阶段 — 底部小字
    if (phase === 0) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = `300 ${Math.min(W * 0.035, 22)}px "WorkSans", sans-serif`;
      ctx.fillStyle = 'rgba(200, 132, 44, 0.15)';
      ctx.fillText('WHAT IF', W / 2, H / 2 + Math.min(W, H) * 0.30);
      ctx.restore();
    }

    // 停留阶段 — 副标题（纯粒子文字，无实色）
    if (phase === 3) {
      reachedSettle = true;

      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      ctx.shadowBlur = 0;
      ctx.shadowColor = 'transparent';

      const subSize = Math.min(W * 0.025, 15);
      ctx.font = `400 ${subSize}px "WorkSans", "PingFang SC", "Microsoft YaHei", sans-serif`;
      ctx.fillStyle = 'rgba(44, 36, 24, 0.55)';
      const subY = H / 2 + Math.min(W * 0.13, 80);
      ctx.fillText('— A I   P A R A L L E L   L I F E —', W / 2, subY);
      ctx.restore();
    }

    animId = requestAnimationFrame(render);
  }

  // ── 初始化粒子 ──
  function initParticles(textStr) {
    particles = [];
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.22;
    const targets = getTextParticles(textStr);

    // 粒子数 = 实际目标点数（已二分控制到 1800-3600）
    const count = targets.length;
    for (let i = 0; i < count; i++) {
      const target = targets[i];
      // 起始位置：时钟附近随机分布
      const angle = Math.random() * Math.PI * 2;
      const dist = Math.random() * radius * 0.9;
      const x = cx + Math.cos(angle) * dist;
      const y = cy + Math.sin(angle) * dist;
      // 颜色：70% 琥珀金 + 30% 偏深褐色（增加文字层次感）
      const hue = Math.random() < 0.7 ? (28 + Math.random() * 14) : (20 + Math.random() * 8);
      particles.push(new Particle(x, y, target.x, target.y, hue));
    }
  }

  // ── 公开 API ──
  function play(textStr) {
    return new Promise((resolve) => {
      text = textStr || '你想回到哪个时刻？';
      resolveCallback = resolve;
      startTime = 0;
      phase = 0;
      particles = [];
      reachedSettle = false;
      dpr = window.devicePixelRatio || 1;

      canvas = document.createElement('canvas');
      canvas.style.cssText = 'position:fixed;inset:0;z-index:9999;width:100vw;height:100vh;';
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      W = canvas.width;
      H = canvas.height;
      ctx = canvas.getContext('2d');

      document.body.appendChild(canvas);

      initParticles(text);
      animId = requestAnimationFrame(render);
    }).then(() => {
      return new Promise((resolve) => {
        // 停留 0.5 秒后淡出，给视觉锚点
        setTimeout(() => {
          if (!canvas) return resolve();
          canvas.style.transition = 'opacity 0.6s ease';
          canvas.style.opacity = '0';
          setTimeout(() => {
            if (canvas && canvas.parentNode) {
              canvas.parentNode.removeChild(canvas);
            }
            if (animId) cancelAnimationFrame(animId);
            resolve();
          }, 700);
        }, 500);
      });
    });
  }

  return { play };
})();