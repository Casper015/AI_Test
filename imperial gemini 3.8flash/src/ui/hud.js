import { VIEWS } from '../shared/layout.js';

export class PalaceHUD {
  constructor(options) {
    const {
      container,
      cameraController,
      fpsController,
      tourController,
      onTimeChange,
      onQualityChange,
      onAudioToggle
    } = options;

    this.container = container;
    this.cameraController = cameraController;
    this.fpsController = fpsController;
    this.tourController = tourController;
    this.onTimeChange = onTimeChange;
    this.onQualityChange = onQualityChange;
    this.onAudioToggle = onAudioToggle;

    this.statsVisible = false;

    this.initElements();
    this.bindEvents();
  }

  initElements() {
    // View pills container
    this.viewNavEl = this.container.querySelector('.view-nav');
    if (this.viewNavEl) {
      this.viewNavEl.innerHTML = '';
      for (const [key, view] of Object.entries(VIEWS)) {
        const btn = document.createElement('button');
        btn.className = `btn-view ${key === 'overview' ? 'active' : ''}`;
        btn.dataset.view = key;
        btn.innerHTML = `<span class="view-tag">${view.tag}</span>${view.label}`;
        btn.addEventListener('click', () => {
          this.container.querySelectorAll('.btn-view').forEach((b) => b.classList.remove('active'));
          btn.classList.add('active');
          if (this.fpsController.active) this.fpsController.stop();
          if (this.tourController.isPlaying) this.tourController.stop();
          this.cameraController.flyTo(key, 1.2);
        });
        this.viewNavEl.appendChild(btn);
      }
    }

    // Time of day buttons
    this.timeBtns = this.container.querySelectorAll('.btn-time');
    this.timeBtns.forEach((btn) => {
      btn.addEventListener('click', () => {
        this.timeBtns.forEach((b) => b.classList.remove('active'));
        btn.classList.add('active');
        if (this.onTimeChange) this.onTimeChange(btn.dataset.preset);
      });
    });

    // Tour elements
    this.btnTour = this.container.querySelector('.btn-tour');
    this.tourSubtitle = this.container.querySelector('.tour-subtitle');
    this.tourControls = this.container.querySelector('.tour-controls');
    this.btnTourPrev = this.container.querySelector('.btn-tour-prev');
    this.btnTourPause = this.container.querySelector('.btn-tour-pause');
    this.btnTourNext = this.container.querySelector('.btn-tour-next');
    this.btnTourExit = this.container.querySelector('.btn-tour-exit');

    // FPS button
    this.btnFps = this.container.querySelector('.btn-fps');
    this.fpsTip = this.container.querySelector('.fps-tip');

    // Stats toggle & stats board
    this.btnStats = this.container.querySelector('.btn-stats');
    this.statsBoard = this.container.querySelector('.stats-board');

    // Quality toggle
    this.btnQuality = this.container.querySelector('.btn-quality');

    // Audio toggle
    this.btnAudio = this.container.querySelector('.btn-audio');
  }

  bindEvents() {
    // Tour start/exit
    this.btnTour?.addEventListener('click', () => {
      if (this.tourController.isPlaying) {
        this.tourController.stop();
      } else {
        if (this.fpsController.active) this.fpsController.stop();
        this.tourController.start();
      }
    });

    this.btnTourPrev?.addEventListener('click', () => this.tourController.prev());
    this.btnTourPause?.addEventListener('click', () => {
      this.tourController.togglePause();
      if (this.btnTourPause) {
        this.btnTourPause.textContent = this.tourController.isPlaying ? '⏸️' : '▶️';
      }
    });
    this.btnTourNext?.addEventListener('click', () => this.tourController.next());
    this.btnTourExit?.addEventListener('click', () => this.tourController.stop());

    // FPS Toggle
    this.btnFps?.addEventListener('click', () => {
      if (this.tourController.isPlaying) this.tourController.stop();
      this.fpsController.toggle();
    });

    this.fpsController.addListener(({ active, locked }) => {
      if (this.btnFps) {
        this.btnFps.classList.toggle('active', active);
        this.btnFps.textContent = active ? '退出漫游 (F)' : '🚶 御前漫游 (F)';
      }
      if (this.fpsTip) {
        this.fpsTip.classList.toggle('visible', active);
        if (active && !locked) {
          this.fpsTip.innerHTML = '点击画面锁定视线 | <b>WASD</b> 行走 | <b>Shift</b> 疾跑 | <b>Esc</b> 释放鼠标 <button class="btn-return-overview">🏛️ 回到全城</button>';
          this.fpsTip.querySelector('.btn-return-overview')?.addEventListener('click', (e) => {
            e.stopPropagation();
            this.fpsController.stop();
            this.cameraController.flyTo('overview', 1.2);
          });
        } else if (active && locked) {
          this.fpsTip.innerHTML = '已锁定鼠标视线 | <b>WASD</b> 行走 | <b>Shift</b> 疾跑 | <b>Esc</b> 释放鼠标 | <b>F</b> 退出漫游';
        }
      }
    });

    // Quality toggle
    let isHighQuality = true;
    this.btnQuality?.addEventListener('click', () => {
      isHighQuality = !isHighQuality;
      this.btnQuality.textContent = isHighQuality ? '高清画质' : '流畅省电';
      if (this.onQualityChange) this.onQualityChange(isHighQuality ? 'high' : 'low');
    });

    // Audio toggle
    let audioOn = false;
    this.btnAudio?.addEventListener('click', () => {
      audioOn = !audioOn;
      this.btnAudio.textContent = audioOn ? '🔊 宫商韶乐' : '🔇 静音';
      if (this.onAudioToggle) this.onAudioToggle(audioOn);
    });

    // Stats toggle
    this.btnStats?.addEventListener('click', () => {
      this.statsVisible = !this.statsVisible;
      this.statsBoard?.classList.toggle('visible', this.statsVisible);
    });

    // Keyboard shortcuts (1-8 for views, J/K/L for lighting presets)
    window.addEventListener('keydown', (e) => {
      if (e.target instanceof HTMLInputElement) return;
      const num = parseInt(e.key, 10);
      const viewKeys = Object.keys(VIEWS);
      if (num >= 1 && num <= viewKeys.length) {
        const vk = viewKeys[num - 1];
        this.cameraController.flyTo(vk, 1.2);
      }
      if (e.code === 'KeyJ') {
        this.setTimePreset('golden');
      } else if (e.code === 'KeyK') {
        this.setTimePreset('dusk');
      } else if (e.code === 'KeyL') {
        this.setTimePreset('night');
      }
    });
  }

  setTimePreset(preset) {
    this.timeBtns.forEach((b) => b.classList.toggle('active', b.dataset.preset === preset));
    if (this.onTimeChange) this.onTimeChange(preset);
  }

  showTourSubtitle(stop, current, total) {
    if (!this.tourSubtitle || !this.tourControls) return;
    if (!stop) {
      this.tourSubtitle.classList.remove('visible');
      this.tourControls.classList.remove('visible');
      if (this.btnTour) this.btnTour.textContent = '🧭 中轴导览';
      return;
    }

    if (this.btnTour) this.btnTour.textContent = '🛑 结束导览';
    this.tourSubtitle.classList.add('visible');
    this.tourControls.classList.add('visible');

    const titleEl = this.tourSubtitle.querySelector('.tour-title');
    const descEl = this.tourSubtitle.querySelector('.tour-desc');
    const badgeEl = this.tourSubtitle.querySelector('.tour-badge');

    if (titleEl) titleEl.textContent = stop.title;
    if (descEl) descEl.textContent = stop.narration;
    if (badgeEl) badgeEl.textContent = `第 ${current + 1} / ${total} 景`;
  }

  updateStats(fps, drawCalls, triangles) {
    if (!this.statsVisible || !this.statsBoard) return;
    this.statsBoard.innerHTML = `
      <div>⚡ <b>${fps}</b> FPS</div>
      <div>📐 <b>${(triangles / 1000).toFixed(1)}k</b> 三角面</div>
      <div>🎨 <b>${drawCalls}</b> Draw Calls</div>
    `;
  }
}
