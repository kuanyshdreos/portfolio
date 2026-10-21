// Builds a 4:3 cover for a work: frame from the video + brand name + logo + accent color.
// Used by the site (spiral cards) and by the admin (live preview), so both always match.
(function () {
  const W = 1200, H = 900;

  function loadImg(src){
    return new Promise(res => {
      if (!src) return res(null);
      const im = new Image();
      im.crossOrigin = 'anonymous';
      im.onload = () => res(im);
      im.onerror = () => res(null);
      im.src = src;
    });
  }
  function drawCover(x, im, dx, dy, dw, dh){
    const s = Math.max(dw / im.width, dh / im.height), w = im.width * s, h = im.height * s;
    x.save(); x.beginPath(); x.rect(dx, dy, dw, dh); x.clip();
    x.drawImage(im, dx + (dw - w) / 2, dy + (dh - h) / 2, w, h);
    x.restore();
  }
  function rounded(x, X, Y, w, h, r){
    x.beginPath(); x.moveTo(X + r, Y); x.arcTo(X + w, Y, X + w, Y + h, r); x.arcTo(X + w, Y + h, X, Y + h, r);
    x.arcTo(X, Y + h, X, Y, r); x.arcTo(X, Y, X + w, Y, r); x.closePath();
  }
  // largest font size (<= max) at which text fits the width
  function fit(x, text, maxW, max, weight){
    let s = max;
    do { x.font = `${weight} ${s}px "Helvetica Neue", Helvetica, Arial, sans-serif`; s -= 2; } while (x.measureText(text).width > maxW && s > 18);
    return s + 2;
  }
  function pill(x, text, X, Y, color){
    x.font = '500 26px "Helvetica Neue", Helvetica, Arial, sans-serif';
    const w = x.measureText(text).width + 36;
    rounded(x, X, Y, w, 48, 24); x.fillStyle = color; x.fill();
    x.fillStyle = '#0a0a0a'; x.textBaseline = 'middle'; x.fillText(text, X + 18, Y + 25);
    x.textBaseline = 'alphabetic';
  }
  function logoBox(x, logo, X, Y, maxW, maxH){
    const s = Math.min(maxW / logo.width, maxH / logo.height);
    x.drawImage(logo, X, Y + (maxH - logo.height * s) / 2, logo.width * s, logo.height * s);
    return logo.width * s;
  }

  window.makeCover = async function (p, resolve = s => s) {
    const c = document.createElement('canvas'); c.width = W; c.height = H;
    const x = c.getContext('2d');
    // no accent chosen: pick a stable one from the work's id so covers differ
    const PALETTE = ['#3cff8f', '#1fd1ff', '#ff4d6d', '#ffd23f', '#a78bfa', '#ff8a3d'];
    const hash = [...String(p.id || p.title || '')].reduce((h, ch) => (h * 31 + ch.charCodeAt(0)) >>> 0, 7);
    const accent = p.accent || PALETTE[hash % PALETTE.length];
    const [frame, logo] = await Promise.all([loadImg(resolve(p.thumb)), loadImg(resolve(p.logo))]);
    const brand = (p.brand || p.title || '').trim();
    const sub = p.brand ? (p.title || '') : (p.category || '');
    const vertical = p.format === '9:16';

    // background: blurred frame, or an accent gradient
    x.fillStyle = '#0b0b0b'; x.fillRect(0, 0, W, H);
    if (frame) {
      x.filter = 'blur(46px) brightness(.5) saturate(1.25)';
      drawCover(x, frame, -120, -120, W + 240, H + 240);
      x.filter = 'none';
    } else {
      const g = x.createRadialGradient(W * .25, H * .2, 20, W * .5, H * .5, W * .9);
      g.addColorStop(0, accent); g.addColorStop(.55, '#151515'); g.addColorStop(1, '#070707');
      x.fillStyle = g; x.fillRect(0, 0, W, H);
    }
    const vg = x.createLinearGradient(0, 0, 0, H);
    vg.addColorStop(0, 'rgba(0,0,0,.15)'); vg.addColorStop(1, 'rgba(0,0,0,.55)');
    x.fillStyle = vg; x.fillRect(0, 0, W, H);

    if (vertical) {
      // reel: phone-shaped frame on the right, brand block on the left
      const fh = 740, fw = fh * 9 / 16, fx = W - fw - 96, fy = (H - fh) / 2;
      if (frame) {
        x.save(); x.shadowColor = 'rgba(0,0,0,.55)'; x.shadowBlur = 60; x.shadowOffsetY = 20;
        rounded(x, fx, fy, fw, fh, 34); x.fillStyle = '#000'; x.fill(); x.restore();
        x.save(); rounded(x, fx, fy, fw, fh, 34); x.clip(); drawCover(x, frame, fx, fy, fw, fh); x.restore();
      }
      const L = 96, colW = (frame ? fx : W) - L - 70;
      if (p.category) pill(x, p.category, L, 110, accent);
      let y = 330;
      if (logo) { logoBox(x, logo, L, y - 40, Math.min(colW, 330), 130); y += 170; }
      x.fillStyle = '#fff';
      const s = fit(x, brand, colW, 112, 600);
      x.fillText(brand, L, y + s * .35);
      if (sub) { x.fillStyle = 'rgba(255,255,255,.62)'; fit(x, sub, colW, 40, 400); x.fillText(sub, L, y + s * .35 + 62); }
      x.fillStyle = accent; x.fillRect(L, H - 128, 64, 6);
    } else {
      // horizontal: frame on top, brand row below
      const m = 64, fw = W - m * 2, fh = fw * 9 / 16, fy = m;
      if (frame) {
        x.save(); x.shadowColor = 'rgba(0,0,0,.5)'; x.shadowBlur = 50; x.shadowOffsetY = 16;
        rounded(x, m, fy, fw, fh, 26); x.fillStyle = '#000'; x.fill(); x.restore();
        x.save(); rounded(x, m, fy, fw, fh, 26); x.clip(); drawCover(x, frame, m, fy, fw, fh); x.restore();
      }
      const rowY = frame ? fy + fh + 44 : H / 2 - 50, rowH = 96;
      let X = m;
      if (logo) X += logoBox(x, logo, m, rowY, 220, rowH) + 30;
      let pw = 0;
      if (p.category) { x.font = '500 26px "Helvetica Neue", Helvetica, Arial, sans-serif'; pw = x.measureText(p.category).width + 36; pill(x, p.category, W - m - pw, rowY + (sub ? 6 : 24), accent); }
      const textW = W - m - X - (pw ? pw + 30 : 0);
      x.fillStyle = '#fff';
      const s = fit(x, brand, textW, 64, 600);
      x.fillText(brand, X, rowY + (sub ? s * .85 : rowH / 2 + s * .35));
      if (sub) { x.fillStyle = 'rgba(255,255,255,.62)'; fit(x, sub, textW, 30, 400); x.fillText(sub, X, rowY + s * .85 + 42); }
    }
    return c;
  };
})();
