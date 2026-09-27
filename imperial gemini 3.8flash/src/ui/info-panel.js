import * as THREE from 'three';

export class InfoPanel {
  constructor(panelEl, cameraController, fpsController) {
    this.panelEl = panelEl;
    this.cameraController = cameraController;
    this.fpsController = fpsController;
    this.currentBuilding = null;
    this.onClose = null;

    this.titleEl = panelEl.querySelector('.info-title');
    this.categoryEl = panelEl.querySelector('.info-category');
    this.descEl = panelEl.querySelector('.info-desc');
    this.accessEl = panelEl.querySelector('.info-access');
    this.actionsEl = panelEl.querySelector('.info-actions');
    this.closeBtn = panelEl.querySelector('.info-close');

    this.bindEvents();
  }

  bindEvents() {
    this.closeBtn?.addEventListener('click', () => {
      this.hide();
    });
  }

  show(building) {
    if (!building) return;
    this.currentBuilding = building;

    if (this.titleEl) this.titleEl.textContent = building.name || building.id;
    if (this.categoryEl) this.categoryEl.textContent = building.category || '殿堂规制';
    if (this.descEl) this.descEl.textContent = building.description || '紫禁城古建筑群的重要组成部分。';

    if (this.accessEl) {
      const isVisitable = building.visitable;
      this.accessEl.textContent = isVisitable ? '🏛️ 可进入殿内游览' : '🔒 仅外观可览';
      this.accessEl.className = `info-access ${isVisitable ? 'access-open' : 'access-closed'}`;
    }

    // Build action buttons
    if (this.actionsEl) {
      this.actionsEl.innerHTML = '';

      // Button 1: Focus Camera
      const focusBtn = document.createElement('button');
      focusBtn.className = 'btn-action';
      focusBtn.textContent = '🔍 环视聚焦';
      focusBtn.addEventListener('click', () => {
        this.cameraController.focusBuilding(building);
      });
      this.actionsEl.appendChild(focusBtn);

      // Button 2: First-person Walk To
      const walkBtn = document.createElement('button');
      walkBtn.className = 'btn-action';
      walkBtn.textContent = '🚶 御前漫步';
      walkBtn.addEventListener('click', () => {
        const spawnY = (building.y || 0) + 1.72;
        const frontZ = building.z - (building.size?.[1] || 20) / 2 - 8;
        this.fpsController.start(new THREE.Vector3(building.x, spawnY, frontZ));
        this.hide();
      });
      this.actionsEl.appendChild(walkBtn);

      // Button 3: Enter Interior (if visitable)
      if (building.visitable) {
        const enterBtn = document.createElement('button');
        enterBtn.className = 'btn-action btn-gold';
        enterBtn.textContent = '✨ 步入内景';
        enterBtn.addEventListener('click', () => {
          if (building.id === 'fc-taihe-dian') {
            this.cameraController.flyTo('interior', 1.4);
          } else if (building.id === 'in-kunning-gong') {
            this.cameraController.flyTo('bedroom', 1.4);
          } else {
            // General enter
            this.cameraController.flyTo({
              position: [building.x, (building.y || 0) + (building.height || 14) * 0.4, building.z - 8],
              target: [building.x, (building.y || 0) + (building.height || 14) * 0.45, building.z + 4]
            }, 1.4);
          }
        });
        this.actionsEl.appendChild(enterBtn);
      }
    }

    this.panelEl.classList.add('visible');
  }

  hide() {
    this.panelEl.classList.remove('visible');
    this.currentBuilding = null;
    if (this.onClose) this.onClose();
  }
}
