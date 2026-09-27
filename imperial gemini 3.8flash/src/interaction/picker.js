import * as THREE from 'three';

export class PalacePicker {
  constructor(camera, domElement, scene, buildingMap, onSelect) {
    this.camera = camera;
    this.domElement = domElement;
    this.scene = scene;
    this.buildingMap = buildingMap;
    this.onSelect = onSelect;

    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    this.hoveredBuildingId = null;

    // 3D Visual Selection Highlight Box
    this.selectionBox = new THREE.Box3();
    this.boxHelper = new THREE.Box3Helper(this.selectionBox, new THREE.Color(0xd4af37));
    this.boxHelper.visible = false;
    this.boxHelper.name = 'palace-selection-highlight';
    this.scene.add(this.boxHelper);

    this.bindEvents();
  }

  highlightBuilding(building) {
    if (!building) {
      this.clearHighlight();
      return;
    }
    const b = typeof building === 'string' ? this.buildingMap.get(building) : building;
    if (!b) {
      this.clearHighlight();
      return;
    }

    let foundGroup = null;
    this.scene.traverse((node) => {
      if (node.isGroup && (node.name === b.name || node.name === b.id)) {
        foundGroup = node;
      }
    });

    if (foundGroup) {
      this.selectionBox.setFromObject(foundGroup);
      this.boxHelper.visible = true;
    } else if (b.bounds) {
      const y0 = b.y || 0;
      const y1 = y0 + (b.height || 14);
      this.selectionBox.min.set(b.bounds.minX - 0.5, y0, b.bounds.minZ - 0.5);
      this.selectionBox.max.set(b.bounds.maxX + 0.5, y1, b.bounds.maxZ + 0.5);
      this.boxHelper.visible = true;
    }
  }

  clearHighlight() {
    this.boxHelper.visible = false;
  }

  bindEvents() {
    this.domElement.addEventListener('pointermove', (e) => {
      const rect = this.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);

      let foundId = null;
      for (const hit of intersects) {
        if (hit.object.userData?.buildingId) {
          foundId = hit.object.userData.buildingId;
          break;
        }
      }

      if (foundId !== this.hoveredBuildingId) {
        this.hoveredBuildingId = foundId;
        this.domElement.style.cursor = foundId ? 'pointer' : 'default';
      }
    });

    this.domElement.addEventListener('click', (e) => {
      // Ignore if clicking on UI
      if (e.target !== this.domElement && !this.domElement.contains(e.target)) return;

      const rect = this.domElement.getBoundingClientRect();
      this.mouse.x = ((e.clientX - rect.left) / rect.width) * 2 - 1;
      this.mouse.y = -((e.clientY - rect.top) / rect.height) * 2 + 1;

      this.raycaster.setFromCamera(this.mouse, this.camera);
      const intersects = this.raycaster.intersectObjects(this.scene.children, true);

      let hitBuilding = false;
      for (const hit of intersects) {
        const bid = hit.object.userData?.buildingId;
        if (bid && this.buildingMap.has(bid)) {
          const building = this.buildingMap.get(bid);
          this.highlightBuilding(building);
          if (this.onSelect) this.onSelect(building);
          hitBuilding = true;
          break;
        }
      }

      if (!hitBuilding && intersects.length > 0) {
        // Clicked ground or empty space, clear highlight
        this.clearHighlight();
      }
    });
  }
}
