import * as THREE from 'three/webgpu';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { color, mix, screenUV, smoothstep, vec2 } from 'three/tsl';

export function createDeepBlueBackgroundNode() {
  const offset = (screenUV as any).sub(vec2(0.55, 0.42)).mul(vec2(1.2, 1));
  const radial = (smoothstep as any)(0, 0.85, offset.length());
  return (mix as any)(color(0x2448b0), color(0x050f3a), radial);
}

type RendererHost = {
  app: HTMLElement;
  renderer: THREE.WebGPURenderer;
  scene: THREE.Scene;
  dispose(): void;
};

export class WebGpuUnavailableError extends Error {
  constructor() {
    super('WebGPU is unavailable.');
    this.name = 'WebGpuUnavailableError';
  }
}

export async function createRendererHost(): Promise<RendererHost> {
  const app = document.querySelector<HTMLElement>('#app')!;
  const renderer = new THREE.WebGPURenderer({
    alpha: false,
    depth: true,
    stencil: false,
    trackTimestamp: false,
    powerPreference: 'high-performance',
  });
  try {
    await renderer.init();
  } catch {
    renderer.dispose();
    throw new WebGpuUnavailableError();
  }
  const webGpuBackend = renderer.backend as THREE.WebGPUBackend & {
    isWebGPUBackend?: boolean;
  };
  if (webGpuBackend.isWebGPUBackend !== true) {
    renderer.dispose();
    throw new WebGpuUnavailableError();
  }
  renderer.setClearColor(0x06123f);
  renderer.setPixelRatio(2.0);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  // Same exposure as the petal material lab so the satin reads the same.
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  app.replaceChildren(renderer.domElement);
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x06123f);
  scene.backgroundNode = createDeepBlueBackgroundNode();
  // Soft studio reflections give the satin its sliding sheen.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  pmrem.dispose();
  scene.environment = environment;
  scene.environmentIntensity = 0.16;
  let disposed = false;
  function dispose() {
    if (disposed) return;
    disposed = true;
    disposeSceneResources(scene);
    environment.dispose();
    scene.clear();
    renderer.dispose();
    renderer.domElement.remove();
  }
  return { app, renderer, scene, dispose };
}

function disposeSceneResources(
  scene: THREE.Scene,
) {
  const geometries = new Set<THREE.BufferGeometry>();
  const materials = new Set<THREE.Material>();
  const textures = new Set<THREE.Texture>();
  scene.traverse((object) => {
    const renderable = object as THREE.Object3D & {
      geometry?: THREE.BufferGeometry;
      material?: THREE.Material | THREE.Material[];
    };
    if (renderable.geometry) geometries.add(renderable.geometry);
    if (renderable.material) {
      (Array.isArray(renderable.material)
        ? renderable.material
        : [renderable.material]
      ).forEach((material) => materials.add(material));
    }
    if (object instanceof THREE.InstancedMesh) object.dispose();
  });
  materials.forEach((material) => {
    Object.values(material).forEach((value) => {
      if (value instanceof THREE.Texture) textures.add(value);
    });
  });
  textures.forEach((texture) => texture.dispose());
  materials.forEach((material) => material.dispose());
  geometries.forEach((geometry) => geometry.dispose());
}
