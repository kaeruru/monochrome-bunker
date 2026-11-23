/**
 * Shared Three.js GPU resource disposal helper.
 * Skips shared/persistent materials and textures marked in persistentMaterials
 * or with `userData.shared === true`.
 */
export function disposeObject3D(root, persistentMaterials = null, persistentTextures = null) {
  if (!root || typeof root.traverse !== 'function') return;

  const isPersistentMat = (mat) => {
    if (!mat) return true;
    if (mat.userData && mat.userData.shared) return true;
    if (!persistentMaterials) return false;
    if (typeof persistentMaterials.has === 'function') return persistentMaterials.has(mat);
    if (Array.isArray(persistentMaterials)) return persistentMaterials.includes(mat);
    return false;
  };

  const isPersistentTex = (tex) => {
    if (!tex || typeof tex.dispose !== 'function') return true;
    if (tex.userData && tex.userData.shared) return true;
    if (!persistentTextures) return false;
    if (typeof persistentTextures.has === 'function') return persistentTextures.has(tex);
    if (Array.isArray(persistentTextures)) return persistentTextures.includes(tex);
    return false;
  };

  const textureSlots = ['map', 'normalMap', 'roughnessMap', 'metalnessMap', 'emissiveMap', 'alphaMap', 'aoMap'];

  root.traverse((obj) => {
    if (obj.geometry && typeof obj.geometry.dispose === 'function' && !(obj.geometry.userData && obj.geometry.userData.shared)) {
      try { obj.geometry.dispose(); } catch (_) {}
    }
    if (obj.material) {
      const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
      for (const m of mats) {
        if (isPersistentMat(m)) continue;
        for (const slot of textureSlots) {
          const tex = m[slot];
          if (tex && !isPersistentTex(tex)) {
            try { tex.dispose(); } catch (_) {}
          }
        }
        if (typeof m.dispose === 'function') {
          try { m.dispose(); } catch (_) {}
        }
      }
    }
  });
}
