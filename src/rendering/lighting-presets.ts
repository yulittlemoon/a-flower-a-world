import { uniform } from 'three/tsl';

// Lighting looks to compare side by side. Pick one with `?light=<id>` in the
// page URL, e.g. http://localhost:5173/?light=c, or tune them live in the
// lighting panel (press L).
export type LightingPreset = {
  id: string;
  title: string;
  note: string;
  // Key light, world space. The camera looks along +z, so screen left is +x
  // and the camera side of the flower is -z.
  keyPosition: [number, number, number];
  keyColor: number;
  keyIntensity: number;
  hemisphereSky: number;
  hemisphereGround: number;
  hemisphereIntensity: number;
  // Self-lit petal terms, 0 = off.
  heartGlow: number;
  pearlEdgeSheen: number;
  // Glow floor for petal edges that are not backlit.
  rimFloor: number;
  // Satin streak from a fixed sky direction on top of the key light streak.
  skySatin: number;
};

export const LIGHTING_PRESETS: readonly LightingPreset[] = [
  {
    id: 'f',
    title: 'F 预览页同款',
    note: '对齐材质预览页：左前上方暖白主光，柔和环境反射',
    keyPosition: [2.85, 3.65, -4],
    keyColor: 0xfff4e6,
    keyIntensity: 1.5,
    hemisphereSky: 0xe2ebff,
    hemisphereGround: 0x2a4aa8,
    hemisphereIntensity: 1.2,
    heartGlow: 0.15,
    pearlEdgeSheen: 0,
    rimFloor: 0,
    skySatin: 0,
  },
  {
    id: 'a',
    title: 'A 正面柔光',
    note: '主光在花前方左上，没有材质补光',
    keyPosition: [1.5, 2.5, -5],
    keyColor: 0xffffff,
    keyIntensity: 3,
    hemisphereSky: 0xe2ebff,
    hemisphereGround: 0x2a4aa8,
    hemisphereIntensity: 2.2,
    heartGlow: 0,
    pearlEdgeSheen: 0,
    rimFloor: 0,
    skySatin: 0,
  },
  {
    id: 'b',
    title: 'B 正面暖光 · 花心透光',
    note: '暖白主光在花前方，花心暖光和珍珠边加回来',
    keyPosition: [1.5, 2.5, -5],
    keyColor: 0xfff1dc,
    keyIntensity: 2.6,
    hemisphereSky: 0xe2ebff,
    hemisphereGround: 0x2a4aa8,
    hemisphereIntensity: 1.6,
    heartGlow: 0.95,
    pearlEdgeSheen: 1,
    rimFloor: 0.45,
    skySatin: 0.45,
  },
  {
    id: 'c',
    title: 'C 左上侧逆光',
    note: '之前那版：主光在左上后方，材质补光全开',
    keyPosition: [3, 4, 5],
    keyColor: 0xffffff,
    keyIntensity: 3,
    hemisphereSky: 0xe2ebff,
    hemisphereGround: 0x2a4aa8,
    hemisphereIntensity: 2.2,
    heartGlow: 0.95,
    pearlEdgeSheen: 1,
    rimFloor: 0.45,
    skySatin: 0.45,
  },
  {
    id: 'd',
    title: 'D 顶部月光',
    note: '冷白主光从正上方落下，环境光压暗',
    keyPosition: [0.3, 6, -0.8],
    keyColor: 0xdfe8ff,
    keyIntensity: 3.2,
    hemisphereSky: 0xc9d8ff,
    hemisphereGround: 0x10245e,
    hemisphereIntensity: 1.1,
    heartGlow: 0.5,
    pearlEdgeSheen: 1,
    rimFloor: 0.2,
    skySatin: 0.3,
  },
  {
    id: 'e',
    title: 'E 右前低侧光',
    note: '主光从右前方低角度斜打，明暗对比强',
    keyPosition: [-3.5, 1, -3.5],
    keyColor: 0xfff6ea,
    keyIntensity: 3.6,
    hemisphereSky: 0xd6e2ff,
    hemisphereGround: 0x14296b,
    hemisphereIntensity: 0.9,
    heartGlow: 0.6,
    pearlEdgeSheen: 0.6,
    rimFloor: 0.15,
    skySatin: 0,
  },
];

const DEFAULT_PRESET_ID = 'b';
const STORAGE_KEY = 'ethereal-flower-lighting-v3';

export type LightingSettings = Omit<LightingPreset, 'id' | 'title' | 'note'>;

function presetById(id: string) {
  return (
    LIGHTING_PRESETS.find((preset) => preset.id === id) ??
    LIGHTING_PRESETS.find((preset) => preset.id === DEFAULT_PRESET_ID)!
  );
}

export function settingsFromPreset(preset: LightingPreset): LightingSettings {
  const { id: _id, title: _title, note: _note, ...settings } = preset;
  return {
    ...settings,
    keyPosition: [...settings.keyPosition] as [number, number, number],
  };
}

// Start-up order: `?light=<id>` in the URL, then the settings last saved from
// the lighting panel, then preset B.
function readInitialSettings(): LightingSettings {
  const fallback = settingsFromPreset(presetById(DEFAULT_PRESET_ID));
  if (typeof window === 'undefined') return fallback;
  const presetId = new URLSearchParams(window.location.search).get('light');
  if (presetId) return settingsFromPreset(presetById(presetId.toLowerCase()));
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved) return { ...fallback, ...JSON.parse(saved) };
  } catch {
    // Ignore unreadable saved settings and use the default preset.
  }
  return fallback;
}

// Live lighting settings; the lighting panel edits this object in place.
export const ACTIVE_LIGHTING: LightingSettings = readInitialSettings();

export function saveLightingSettings() {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(ACTIVE_LIGHTING));
  } catch {
    // Storage can be unavailable (private mode); the settings still apply.
  }
}

const makeUniform = uniform as (value: number) => any;

// Shader-side copies of the material terms so the panel can change them
// without rebuilding materials.
export const LIGHTING_UNIFORMS = {
  heartGlow: makeUniform(ACTIVE_LIGHTING.heartGlow),
  pearlEdgeSheen: makeUniform(ACTIVE_LIGHTING.pearlEdgeSheen),
  rimFloor: makeUniform(ACTIVE_LIGHTING.rimFloor),
  skySatin: makeUniform(ACTIVE_LIGHTING.skySatin),
};

export function syncLightingUniforms() {
  LIGHTING_UNIFORMS.heartGlow.value = ACTIVE_LIGHTING.heartGlow;
  LIGHTING_UNIFORMS.pearlEdgeSheen.value = ACTIVE_LIGHTING.pearlEdgeSheen;
  LIGHTING_UNIFORMS.rimFloor.value = ACTIVE_LIGHTING.rimFloor;
  LIGHTING_UNIFORMS.skySatin.value = ACTIVE_LIGHTING.skySatin;
}
