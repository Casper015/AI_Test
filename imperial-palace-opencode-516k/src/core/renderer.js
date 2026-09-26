export function createRenderer({ THREE, config, quality = 'high' }) {
  const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  const q = config.QUALITY[quality] || config.QUALITY.high;
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, q.dpr));
  renderer.setSize(window.innerWidth, window.innerHeight);

  function setQuality(name) {
    const next = config.QUALITY[name] || config.QUALITY.high;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, next.dpr));
    renderer.shadowMap.enabled = next.shadows;
    return next;
  }

  function resize(cameras) {
    const w = window.innerWidth;
    const h = window.innerHeight;
    renderer.setSize(w, h);
    for (const cam of cameras) {
      if (cam.isPerspectiveCamera) {
        cam.aspect = w / h;
      } else {
        const aspect = w / h;
        const v = cam.userData.frustumV || 1200;
        cam.left = (-v * aspect) / 2;
        cam.right = (v * aspect) / 2;
        cam.top = v / 2;
        cam.bottom = -v / 2;
      }
      cam.updateProjectionMatrix();
    }
  }

  return { renderer, setQuality, resize };
}
