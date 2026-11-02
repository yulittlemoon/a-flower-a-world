import * as THREE from 'three/webgpu';
import { color, float } from 'three/tsl';
import type { FrameContext, FrameParticipant } from '../app/animation-contract';

export const AMBIENT_MOTES = {
  count: 220,
  // Spawn volume around the flower (world units).
  radius: 3.2,
  minimumHeight: -1.2,
  maximumHeight: 2.6,
  minimumSize: 0.004,
  maximumSize: 0.014,
  driftAmplitude: 0.12,
  riseSpeed: 0.035,
  // HDR colors so the post glow turns each mote into a soft halo.
  warmColor: 0xffe2a6,
  coolColor: 0xdfe9ff,
  intensity: 2.4,
} as const;

function seededRandom(seed: number) {
  const value = Math.sin(seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function createAmbientMotes(scene: THREE.Scene): FrameParticipant {
  const geometry = new THREE.IcosahedronGeometry(1, 1);
  const material = new THREE.MeshBasicNodeMaterial();
  material.colorNode = color(0xffffff).mul(float(AMBIENT_MOTES.intensity));
  const motes = new THREE.InstancedMesh(geometry, material, AMBIENT_MOTES.count);
  motes.name = 'Ambient Motes';
  motes.frustumCulled = false;

  const seeds = Array.from({ length: AMBIENT_MOTES.count }, (_, index) => {
    const angle = seededRandom(index + 1) * Math.PI * 2;
    const distance = Math.sqrt(seededRandom(index + 31)) * AMBIENT_MOTES.radius;
    const tint = new THREE.Color(AMBIENT_MOTES.warmColor).lerp(
      new THREE.Color(AMBIENT_MOTES.coolColor),
      seededRandom(index + 61),
    );
    motes.setColorAt(index, tint);
    return {
      x: Math.cos(angle) * distance,
      z: Math.sin(angle) * distance,
      height: seededRandom(index + 91),
      size: THREE.MathUtils.lerp(
        AMBIENT_MOTES.minimumSize,
        AMBIENT_MOTES.maximumSize,
        Math.pow(seededRandom(index + 121), 2),
      ),
      phase: seededRandom(index + 151) * Math.PI * 2,
      twinkle: 0.6 + seededRandom(index + 181) * 1.8,
    };
  });
  scene.add(motes);

  const matrix = new THREE.Matrix4();
  const position = new THREE.Vector3();
  const rotation = new THREE.Quaternion();
  const scale = new THREE.Vector3();
  const span = AMBIENT_MOTES.maximumHeight - AMBIENT_MOTES.minimumHeight;

  function update({ timestamp }: FrameContext) {
    const seconds = timestamp / 1000;
    seeds.forEach((seed, index) => {
      const height =
        (seed.height + seconds * AMBIENT_MOTES.riseSpeed / span) % 1;
      position.set(
        seed.x + Math.sin(seconds * 0.3 + seed.phase) * AMBIENT_MOTES.driftAmplitude,
        AMBIENT_MOTES.minimumHeight + height * span,
        seed.z + Math.cos(seconds * 0.25 + seed.phase) * AMBIENT_MOTES.driftAmplitude,
      );
      // Fade in and out at the ends of the rise, and twinkle softly.
      const edgeFade = Math.sin(height * Math.PI);
      const twinkle = 0.55 + 0.45 * Math.sin(seconds * seed.twinkle + seed.phase);
      scale.setScalar(seed.size * edgeFade * twinkle);
      matrix.compose(position, rotation, scale);
      motes.setMatrixAt(index, matrix);
    });
    motes.instanceMatrix.needsUpdate = true;
  }

  function dispose() {
    motes.removeFromParent();
    motes.dispose();
    geometry.dispose();
    material.dispose();
  }

  return { update, dispose };
}
