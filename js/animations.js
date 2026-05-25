/* ═══════════════════════════════════════════════════════
   DentCare Pro — Animations Engine
   Load order: after ui.js, before app.js
   ═══════════════════════════════════════════════════════ */

/* ──────────────────────────────────────────────────────
   1. TOOTH LOADER  (show/hide)
   ────────────────────────────────────────────────────── */
const Loader = {
  _count: 0,

  show(msg) {
    this._count++;
    const el = document.getElementById('toothLoader');
    if (!el) return;
    const textEl = el.querySelector('.tooth-loader-text');
    if (textEl) textEl.textContent = msg || 'Loading…';
    el.classList.add('visible');
  },

  hide() {
    this._count = Math.max(0, this._count - 1);
    if (this._count > 0) return;
    const el = document.getElementById('toothLoader');
    if (el) el.classList.remove('visible');
  },

  /** Wrap any async call with loader */
  async wrap(fn, msg) {
    this.show(msg);
    try     { return await fn(); }
    finally { this.hide(); }
  }
};

/* ──────────────────────────────────────────────────────
   2. RIPPLE EFFECT
   Attaches to all ripple-eligible buttons on click.
   ────────────────────────────────────────────────────── */
(function initRipple() {
  function addRipple(e) {
    const btn = e.currentTarget;
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    const x = e.clientX - rect.left - size / 2;
    const y = e.clientY - rect.top  - size / 2;

    const wave = document.createElement('span');
    wave.className = 'ripple-wave';
    wave.style.cssText = `width:${size}px;height:${size}px;left:${x}px;top:${y}px`;
    btn.appendChild(wave);
    wave.addEventListener('animationend', () => wave.remove(), { once: true });
  }

  const SELECTORS = [
    '.btn-primary', '.btn-icon', '.btn-login',
    '.action-btn',  '.dash-qa-btn', '.btn-all',
    '.btn-ghost',   '.ftab'
  ].join(',');

  /* Attach to existing buttons now, and to future ones via delegation */
  function attachToEl(el) {
    if (el._rippleAttached) return;
    el._rippleAttached = true;
    el.addEventListener('click', addRipple);
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll(SELECTORS).forEach(attachToEl);
  });

  /* MutationObserver picks up dynamically injected buttons */
  const obs = new MutationObserver(mutations => {
    mutations.forEach(m => {
      m.addedNodes.forEach(node => {
        if (node.nodeType !== 1) return;
        if (node.matches && node.matches(SELECTORS)) attachToEl(node);
        node.querySelectorAll && node.querySelectorAll(SELECTORS).forEach(attachToEl);
      });
    });
  });

  document.addEventListener('DOMContentLoaded', () => {
    obs.observe(document.body, { childList: true, subtree: true });
  });
})();

/* ──────────────────────────────────────────────────────
   4. SKELETON LOADER HELPERS
   ────────────────────────────────────────────────────── */
const Skeleton = {
  /**
   * Render N skeleton rows inside a <tbody> while data loads.
   * @param {string} tbodyId   id of the <tbody>
   * @param {number} cols      number of <td> per row
   * @param {number} [rows=5]  number of placeholder rows
   */
  tableRows(tbodyId, cols, rows) {
    rows = rows || 5;
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    const widths = ['w80','w60','w40','w80','w60'];
    let html = '';
    for (let r = 0; r < rows; r++) {
      html += '<tr>';
      for (let c = 0; c < cols; c++) {
        const w = widths[(r + c) % widths.length];
        html += `<td style="padding:.8rem 1rem">
          <div class="skeleton skeleton-line ${w}"></div>
        </td>`;
      }
      html += '</tr>';
    }
    tbody.innerHTML = html;
  },

  /**
   * Render skeleton rows with an avatar circle in first cell.
   */
  tableRowsWithAvatar(tbodyId, cols, rows) {
    rows = rows || 5;
    const tbody = document.getElementById(tbodyId);
    if (!tbody) return;

    let html = '';
    for (let r = 0; r < rows; r++) {
      html += `<tr><td style="padding:.6rem 1rem">
        <div class="skeleton-row" style="padding:0;border:none">
          <div class="skeleton skeleton-circle"></div>
          <div class="skeleton-block">
            <div class="skeleton skeleton-line w80"></div>
            <div class="skeleton skeleton-line w50"></div>
          </div>
        </div>
      </td>`;
      for (let c = 1; c < cols; c++) {
        html += `<td style="padding:.8rem 1rem">
          <div class="skeleton skeleton-line w60"></div>
        </td>`;
      }
      html += '</tr>';
    }
    tbody.innerHTML = html;
  }
};

/* ──────────────────────────────────────────────────────
   5. FLOATING PARTICLES
   ────────────────────────────────────────────────────── */
(function initParticles() {
  const COLORS = [
    'rgba(0,212,255,',    /* accent */
    'rgba(0,255,179,',    /* accent2 */
    'rgba(123,132,163,'   /* text2 */
  ];

  function spawnParticles(containerId, count) {
    const el = document.getElementById(containerId);
    if (!el) return;
    el.innerHTML = '';

    for (let i = 0; i < count; i++) {
      const p = document.createElement('div');
      p.className = 'particle';
      const size    = 2 + Math.random() * 5;
      const left    = Math.random() * 100;
      const bottom  = Math.random() * 30;
      const dur     = 4 + Math.random() * 6;
      const delay   = Math.random() * dur;
      const opacity = 0.3 + Math.random() * 0.5;
      const color   = COLORS[Math.floor(Math.random() * COLORS.length)];

      p.style.cssText = [
        `width:${size}px`,
        `height:${size}px`,
        `left:${left}%`,
        `bottom:${bottom}px`,
        `background:${color}${opacity})`,
        `--p-opacity:${opacity}`,
        `animation-duration:${dur}s`,
        `animation-delay:${delay}s`
      ].join(';');

      el.appendChild(p);
    }
  }

  document.addEventListener('DOMContentLoaded', () => {
    spawnParticles('loginParticles', 28);
    spawnParticles('dashParticles',  18);
  });
})();

/* ──────────────────────────────────────────────────────
   6. STAGGER TABLE ROWS  (assign --ri CSS variable)
   ────────────────────────────────────────────────────── */
function staggerTableRows(tbodyId) {
  const tbody = document.getElementById(tbodyId);
  if (!tbody) return;
  Array.from(tbody.querySelectorAll('tr')).forEach((tr, i) => {
    tr.style.setProperty('--ri', i);
  });
}

/* ──────────────────────────────────────────────────────
   7. ANIMATED STAT BAR BUILDER
   ────────────────────────────────────────────────────── */
function buildStatBars(containerId, items) {
  /* items = [{ label, value, max, color }] */
  const el = document.getElementById(containerId);
  if (!el) return;
  const max = Math.max(...items.map(i => i.value), 1);
  el.innerHTML = items.map((item, idx) => {
    const pct = Math.round((item.value / max) * 100);
    const color = item.color || 'var(--accent)';
    return `
      <div style="margin-bottom:.75rem">
        <div style="display:flex;justify-content:space-between;font-size:.75rem;color:var(--text2);margin-bottom:.3rem">
          <span>${item.label}</span>
          <span style="color:var(--text)">${item.value.toLocaleString()}</span>
        </div>
        <div style="background:var(--bg3);border-radius:3px;height:6px;overflow:hidden">
          <div class="anim-bar"
               style="--bar-w:${pct}%;--bar-delay:${idx * 0.1}s;background:${color};width:${pct}%">
          </div>
        </div>
      </div>`;
  }).join('');
}

/* ──────────────────────────────────────────────────────
   8. 3D TOOTH WIDGET  (Three.js — loads lazily)
   ────────────────────────────────────────────────────── */
const Tooth3D = {
  _renderer: null,
  _animId:   null,

  /**
   * Mount the 3D rotating tooth into #tooth3dCanvas.
   * Safe to call multiple times — tears down old instance first.
   */
  mount() {
    this.destroy();

    const canvas = document.getElementById('tooth3dCanvas');
    if (!canvas) return;

    if (typeof THREE === 'undefined') {
      console.warn('[Tooth3D] THREE not loaded yet, retrying in 300ms');
      setTimeout(() => this.mount(), 300);
      return;
    }

    const W = canvas.parentElement.offsetWidth || 220;
    const H = 180;
    canvas.width  = W;
    canvas.height = H;
    canvas.style.width  = W + 'px';
    canvas.style.height = H + 'px';

    const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    renderer.setSize(W, H);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    this._renderer = renderer;

    const scene  = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(42, W / H, 0.1, 100);
    camera.position.set(0, 0.2, 4.2);

    /* ── Tooth geometry from primitives ── */
    const group = new THREE.Group();

    /* Crown */
    const crownMat = new THREE.MeshPhongMaterial({
      color: 0xe8f4ff, shininess: 140, specular: 0x88ccee
    });
    const crown = new THREE.Mesh(
      new THREE.BoxGeometry(1.3, 1.1, 1.0, 3, 3, 3),
      crownMat
    );
    crown.position.y = 0.25;
    group.add(crown);

    /* Round off top corners with spheres */
    const cornerPositions = [
      [-0.52, 0.82, -0.38], [ 0.52, 0.82, -0.38],
      [-0.52, 0.82,  0.38], [ 0.52, 0.82,  0.38]
    ];
    cornerPositions.forEach(([x, y, z]) => {
      const c = new THREE.Mesh(
        new THREE.SphereGeometry(0.32, 12, 12),
        new THREE.MeshPhongMaterial({ color: 0xf0f8ff, shininess: 180, specular: 0xaaddff })
      );
      c.position.set(x, y, z);
      group.add(c);
    });

    /* Roots */
    const rootMat = new THREE.MeshPhongMaterial({ color: 0xc8e4f8, shininess: 60 });
    [[-0.32, -0.72, 0], [0.32, -0.72, 0]].forEach(([x, y, z]) => {
      const root = new THREE.Mesh(
        new THREE.CylinderGeometry(0.2, 0.07, 0.9, 10),
        rootMat
      );
      root.position.set(x, y, z);
      group.add(root);
    });

    /* Subtle enamel ridge lines (thin boxes on crown) */
    const ridgeMat = new THREE.MeshPhongMaterial({ color: 0xd4ecfc, shininess: 200 });
    [-0.22, 0, 0.22].forEach(z => {
      const ridge = new THREE.Mesh(
        new THREE.BoxGeometry(1.25, 0.06, 0.06),
        ridgeMat
      );
      ridge.position.set(0, 0.55, z);
      group.add(ridge);
    });

    scene.add(group);

    /* ── Lights ── */
    const keyLight  = new THREE.DirectionalLight(0xffffff, 1.3);
    keyLight.position.set(3, 5, 3);
    scene.add(keyLight);

    const fillLight = new THREE.DirectionalLight(0xaaddff, 0.5);
    fillLight.position.set(-3, 2, -2);
    scene.add(fillLight);

    const rimLight  = new THREE.DirectionalLight(0x00d4ff, 0.35);
    rimLight.position.set(-1, -2, -4);
    scene.add(rimLight);

    scene.add(new THREE.AmbientLight(0x446688, 0.65));

    /* ── Mouse drag rotation ── */
    let isDragging = false, prevX = 0, prevY = 0;
    let autoRotate  = true;
    let velX = 0, velY = 0;

    canvas.addEventListener('mousedown', e => {
      isDragging = true; autoRotate = false;
      prevX = e.clientX; prevY = e.clientY;
    });
    canvas.addEventListener('mousemove', e => {
      if (!isDragging) return;
      const dx = e.clientX - prevX;
      const dy = e.clientY - prevY;
      velX = dy * 0.008;
      velY = dx * 0.008;
      group.rotation.x += velX;
      group.rotation.y += velY;
      prevX = e.clientX; prevY = e.clientY;
    });
    canvas.addEventListener('mouseup',    () => { isDragging = false; autoRotate = true; });
    canvas.addEventListener('mouseleave', () => { isDragging = false; autoRotate = true; });

    /* Touch support */
    canvas.addEventListener('touchstart', e => {
      isDragging = true; autoRotate = false;
      prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
    }, { passive: true });
    canvas.addEventListener('touchmove', e => {
      if (!isDragging) return;
      const dx = e.touches[0].clientX - prevX;
      const dy = e.touches[0].clientY - prevY;
      group.rotation.x += dy * 0.008;
      group.rotation.y += dx * 0.008;
      prevX = e.touches[0].clientX; prevY = e.touches[0].clientY;
    }, { passive: true });
    canvas.addEventListener('touchend', () => { isDragging = false; autoRotate = true; });

    /* ── Render loop ── */
    const self = this;
    function animate() {
      self._animId = requestAnimationFrame(animate);
      if (autoRotate) {
        group.rotation.y += 0.010;
        group.rotation.x  = Math.sin(Date.now() * 0.0004) * 0.18;
      }
      renderer.render(scene, camera);
    }
    animate();
  },

  destroy() {
    if (this._animId) { cancelAnimationFrame(this._animId); this._animId = null; }
    if (this._renderer) { this._renderer.dispose(); this._renderer = null; }
  }
};
