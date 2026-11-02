import * as THREE from 'three/webgpu';
import {
  ACTIVE_LIGHTING,
  LIGHTING_PRESETS,
  saveLightingSettings,
  settingsFromPreset,
  syncLightingUniforms,
  type LightingSettings,
} from '../rendering/lighting-presets';

type LightingPanelTargets = {
  keyLight: THREE.DirectionalLight;
  hemisphereLight: THREE.HemisphereLight;
  updateDirectionalLight(): void;
};

type SliderSpec = {
  label: string;
  min: number;
  max: number;
  step: number;
  read(): number;
  write(value: number): void;
};

type ColorSpec = {
  label: string;
  key: 'keyColor' | 'hemisphereSky' | 'hemisphereGround';
};

// The camera looks along +z: azimuth 0 = in front of the flower (camera side),
// 90 = screen right, ±180 = straight behind. Elevation is above the horizon.
function directionFromAngles(azimuthDegrees: number, elevationDegrees: number) {
  const azimuth = THREE.MathUtils.degToRad(azimuthDegrees);
  const elevation = THREE.MathUtils.degToRad(elevationDegrees);
  return new THREE.Vector3(
    -Math.sin(azimuth) * Math.cos(elevation),
    Math.sin(elevation),
    -Math.cos(azimuth) * Math.cos(elevation),
  );
}

function anglesFromDirection(direction: THREE.Vector3) {
  const flat = Math.hypot(direction.x, direction.z);
  return {
    azimuth: THREE.MathUtils.radToDeg(Math.atan2(-direction.x, -direction.z)),
    elevation: THREE.MathUtils.radToDeg(Math.atan2(direction.y, flat)),
  };
}

function toHex(value: number) {
  return `#${value.toString(16).padStart(6, '0')}`;
}

export function createLightingPanel(
  parent: HTMLElement,
  { keyLight, hemisphereLight, updateDirectionalLight }: LightingPanelTargets,
) {
  const lightTarget = keyLight.target.position;
  const offset = new THREE.Vector3()
    .fromArray(ACTIVE_LIGHTING.keyPosition)
    .sub(lightTarget);
  const distance = offset.length() || 6;
  let { azimuth, elevation } = anglesFromDirection(offset.normalize());

  function apply() {
    const position = directionFromAngles(azimuth, elevation)
      .multiplyScalar(distance)
      .add(lightTarget);
    ACTIVE_LIGHTING.keyPosition = [
      Number(position.x.toFixed(3)),
      Number(position.y.toFixed(3)),
      Number(position.z.toFixed(3)),
    ];
    keyLight.position.copy(position);
    keyLight.color.setHex(ACTIVE_LIGHTING.keyColor);
    keyLight.intensity = ACTIVE_LIGHTING.keyIntensity;
    hemisphereLight.color.setHex(ACTIVE_LIGHTING.hemisphereSky);
    hemisphereLight.groundColor.setHex(ACTIVE_LIGHTING.hemisphereGround);
    hemisphereLight.intensity = ACTIVE_LIGHTING.hemisphereIntensity;
    syncLightingUniforms();
    updateDirectionalLight();
    saveLightingSettings();
  }

  const sliders: SliderSpec[] = [
    {
      label: '主光水平角',
      min: -180, max: 180, step: 1,
      read: () => azimuth,
      write: (value) => { azimuth = value; },
    },
    {
      label: '主光高度角',
      min: -30, max: 90, step: 1,
      read: () => elevation,
      write: (value) => { elevation = value; },
    },
    {
      label: '主光强度',
      min: 0, max: 6, step: 0.1,
      read: () => ACTIVE_LIGHTING.keyIntensity,
      write: (value) => { ACTIVE_LIGHTING.keyIntensity = value; },
    },
    {
      label: '环境光强度',
      min: 0, max: 4, step: 0.1,
      read: () => ACTIVE_LIGHTING.hemisphereIntensity,
      write: (value) => { ACTIVE_LIGHTING.hemisphereIntensity = value; },
    },
    {
      label: '花心暖光',
      min: 0, max: 1.5, step: 0.05,
      read: () => ACTIVE_LIGHTING.heartGlow,
      write: (value) => { ACTIVE_LIGHTING.heartGlow = value; },
    },
    {
      label: '珍珠虹彩边',
      min: 0, max: 1.5, step: 0.05,
      read: () => ACTIVE_LIGHTING.pearlEdgeSheen,
      write: (value) => { ACTIVE_LIGHTING.pearlEdgeSheen = value; },
    },
    {
      label: '边缘常亮',
      min: 0, max: 1, step: 0.05,
      read: () => ACTIVE_LIGHTING.rimFloor,
      write: (value) => { ACTIVE_LIGHTING.rimFloor = value; },
    },
    {
      label: '天空缎光',
      min: 0, max: 1, step: 0.05,
      read: () => ACTIVE_LIGHTING.skySatin,
      write: (value) => { ACTIVE_LIGHTING.skySatin = value; },
    },
  ];
  const colors: ColorSpec[] = [
    { label: '主光颜色', key: 'keyColor' },
    { label: '天空色', key: 'hemisphereSky' },
    { label: '地面色', key: 'hemisphereGround' },
  ];

  const panel = document.createElement('section');
  panel.className = 'lighting-panel';
  panel.hidden = true;
  panel.innerHTML = `
    <header><strong>灯光</strong><span>按 L 或 Esc</span><button type="button" class="lighting-panel-close" data-close aria-label="关闭灯光面板">×</button></header>
    <div class="lighting-panel-presets" data-presets></div>
    <div data-rows></div>
    <footer>
      <button type="button" data-copy>复制参数</button>
      <span data-status></span>
    </footer>
  `;
  const toggle = document.createElement('button');
  toggle.type = 'button';
  toggle.className = 'lighting-panel-toggle';
  toggle.textContent = '灯光';

  const presetRow = panel.querySelector<HTMLElement>('[data-presets]')!;
  const rows = panel.querySelector<HTMLElement>('[data-rows]')!;
  const status = panel.querySelector<HTMLElement>('[data-status]')!;
  const refreshers: Array<() => void> = [];

  sliders.forEach((spec) => {
    const row = document.createElement('label');
    row.className = 'lighting-panel-row';
    row.innerHTML = `<span>${spec.label}</span><input type="range"><output></output>`;
    const input = row.querySelector('input')!;
    const output = row.querySelector('output')!;
    input.min = String(spec.min);
    input.max = String(spec.max);
    input.step = String(spec.step);
    const refresh = () => {
      input.value = String(spec.read());
      output.textContent = spec.step >= 1
        ? `${Math.round(spec.read())}°`
        : spec.read().toFixed(2);
    };
    input.addEventListener('input', () => {
      spec.write(Number(input.value));
      refresh();
      apply();
    });
    refreshers.push(refresh);
    rows.append(row);
  });

  colors.forEach((spec) => {
    const row = document.createElement('label');
    row.className = 'lighting-panel-row';
    row.innerHTML = `<span>${spec.label}</span><input type="color"><output></output>`;
    const input = row.querySelector('input')!;
    const output = row.querySelector('output')!;
    const refresh = () => {
      input.value = toHex(ACTIVE_LIGHTING[spec.key]);
      output.textContent = input.value;
    };
    input.addEventListener('input', () => {
      ACTIVE_LIGHTING[spec.key] = parseInt(input.value.slice(1), 16);
      refresh();
      apply();
    });
    refreshers.push(refresh);
    rows.append(row);
  });

  function loadSettings(settings: LightingSettings) {
    Object.assign(ACTIVE_LIGHTING, settings);
    const direction = new THREE.Vector3()
      .fromArray(settings.keyPosition)
      .sub(lightTarget)
      .normalize();
    ({ azimuth, elevation } = anglesFromDirection(direction));
    refreshers.forEach((refresh) => refresh());
    apply();
  }

  LIGHTING_PRESETS.forEach((preset) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = preset.id.toUpperCase();
    button.title = `${preset.title}：${preset.note}`;
    button.addEventListener('click', () => {
      loadSettings(settingsFromPreset(preset));
      status.textContent = preset.title;
    });
    presetRow.append(button);
  });

  panel
    .querySelector<HTMLButtonElement>('[data-copy]')!
    .addEventListener('click', async () => {
      const text = JSON.stringify(ACTIVE_LIGHTING, null, 2);
      try {
        await navigator.clipboard.writeText(text);
        status.textContent = '已复制';
      } catch {
        console.info(text);
        status.textContent = '复制失败，参数已打印到控制台';
      }
    });

  function setOpen(open: boolean) {
    panel.hidden = !open;
    toggle.setAttribute('aria-expanded', String(open));
    toggle.textContent = open ? '收起灯光' : '灯光';
  }
  toggle.addEventListener('click', () => setOpen(panel.hidden));
  panel
    .querySelector<HTMLButtonElement>('[data-close]')!
    .addEventListener('click', () => setOpen(false));
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') {
      setOpen(false);
      return;
    }
    if (event.key.toLowerCase() !== 'l') return;
    if ((event.target as HTMLElement | null)?.closest('input')) return;
    setOpen(panel.hidden);
  }
  window.addEventListener('keydown', onKeyDown);

  // Stop wheel and pointer events on the panel from reaching the flower.
  panel.addEventListener('wheel', (event) => event.stopPropagation());
  refreshers.forEach((refresh) => refresh());
  parent.append(panel, toggle);

  return {
    dispose() {
      window.removeEventListener('keydown', onKeyDown);
      panel.remove();
      toggle.remove();
    },
  };
}
