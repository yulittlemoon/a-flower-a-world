import * as THREE from 'three/webgpu';
import { color, float, mix, uv } from 'three/tsl';

export const FLOWER_STAMENS = {
  // Short and upright so the innermost petal whorl closes around them.
  count: 80,
  minimumLength: 0.16,
  maximumLength: 0.3,
  maximumTiltRadians: THREE.MathUtils.degToRad(28),
  baseRadius: 0.022,
  baseHeight: 0.07,
  filamentRadius: 0.0018,
  antherRadius: 0.0075,
  // Values above the glow threshold so the post glow picks the stamens up.
  filamentRootColor: 0xb88a3c,
  filamentTipColor: 0xffe7a8,
  filamentIntensity: 1.4,
  antherColor: 0xffd27a,
  antherIntensity: 2.6,
} as const;

function seededRandom(seed: number) {
  const value = Math.sin(seed * 12.9898) * 43758.5453;
  return value - Math.floor(value);
}

export function createFlowerStamens() {
  const group = new THREE.Group();
  group.name = 'Flower Stamens';

  const filamentGeometry = new THREE.CylinderGeometry(
    FLOWER_STAMENS.filamentRadius * 0.6,
    FLOWER_STAMENS.filamentRadius,
    1,
    5,
    1,
    true,
  );
  filamentGeometry.translate(0, 0.5, 0);
  const filamentMaterial = new THREE.MeshBasicNodeMaterial();
  filamentMaterial.colorNode = (mix as any)(
    color(FLOWER_STAMENS.filamentRootColor),
    color(FLOWER_STAMENS.filamentTipColor),
    (uv() as any).y,
  ).mul(float(FLOWER_STAMENS.filamentIntensity));

  const antherGeometry = new THREE.SphereGeometry(
    FLOWER_STAMENS.antherRadius,
    8,
    6,
  );
  const antherMaterial = new THREE.MeshBasicNodeMaterial();
  antherMaterial.colorNode = color(FLOWER_STAMENS.antherColor).mul(
    float(FLOWER_STAMENS.antherIntensity),
  );

  const filaments = new THREE.InstancedMesh(
    filamentGeometry,
    filamentMaterial,
    FLOWER_STAMENS.count,
  );
  const anthers = new THREE.InstancedMesh(
    antherGeometry,
    antherMaterial,
    FLOWER_STAMENS.count,
  );

  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  const up = new THREE.Vector3(0, 1, 0);
  const matrix = new THREE.Matrix4();
  const rotation = new THREE.Quaternion();
  const direction = new THREE.Vector3();
  const base = new THREE.Vector3();
  const tip = new THREE.Vector3();
  for (let index = 0; index < FLOWER_STAMENS.count; index += 1) {
    const t = (index + 0.5) / FLOWER_STAMENS.count;
    const angle = index * goldenAngle;
    const tilt =
      FLOWER_STAMENS.maximumTiltRadians *
      (0.35 + 0.65 * Math.sqrt(t)) *
      (0.85 + 0.3 * seededRandom(index + 1));
    const length = THREE.MathUtils.lerp(
      FLOWER_STAMENS.minimumLength,
      FLOWER_STAMENS.maximumLength,
      seededRandom(index + 101),
    );
    direction
      .set(
        Math.cos(angle) * Math.sin(tilt),
        Math.cos(tilt),
        Math.sin(angle) * Math.sin(tilt),
      )
      .normalize();
    base.set(
      Math.cos(angle) * Math.sqrt(t) * FLOWER_STAMENS.baseRadius,
      FLOWER_STAMENS.baseHeight,
      Math.sin(angle) * Math.sqrt(t) * FLOWER_STAMENS.baseRadius,
    );
    rotation.setFromUnitVectors(up, direction);
    matrix.compose(base, rotation, new THREE.Vector3(1, length, 1));
    filaments.setMatrixAt(index, matrix);
    tip.copy(base).addScaledVector(direction, length);
    const antherScale = 0.7 + 0.6 * seededRandom(index + 211);
    matrix.compose(
      tip,
      rotation,
      new THREE.Vector3(antherScale, antherScale * 1.6, antherScale),
    );
    anthers.setMatrixAt(index, matrix);
  }
  filaments.instanceMatrix.needsUpdate = true;
  anthers.instanceMatrix.needsUpdate = true;
  group.add(filaments, anthers);

  function dispose() {
    filamentGeometry.dispose();
    filamentMaterial.dispose();
    antherGeometry.dispose();
    antherMaterial.dispose();
    filaments.dispose();
    anthers.dispose();
  }

  return { group, dispose };
}
