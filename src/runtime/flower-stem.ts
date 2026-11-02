import * as THREE from 'three/webgpu';
import {
  color,
  float,
  normalView,
  positionLocal,
  positionViewDirection,
  smoothstep,
} from 'three/tsl';

export const FLOWER_STEM = {
  topY: 0.07,
  bottomY: -9,
  // Gentle S-curve offsets (x, z) at the stem midpoint and bottom.
  midOffset: [0.06, -0.03] as const,
  bottomOffset: [-0.2, 0.08] as const,
  radius: 0.032,
  receptacleRadius: 0.075,
  baseColor: 0xdbe3f4,
  rimColor: 0xc8d4ff,
  rimIntensity: 1.1,
  // Warm light bleeding down from the flower heart.
  heartColor: 0xffe2a8,
  heartIntensity: 0.9,
  opacity: 0.86,
} as const;

export function createFlowerStem() {
  const group = new THREE.Group();
  group.name = 'Flower Stem';

  const curve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, FLOWER_STEM.topY, 0),
    new THREE.Vector3(0.01, -0.6, 0),
    new THREE.Vector3(
      FLOWER_STEM.midOffset[0],
      (FLOWER_STEM.topY + FLOWER_STEM.bottomY) * 0.5,
      FLOWER_STEM.midOffset[1],
    ),
    new THREE.Vector3(
      FLOWER_STEM.bottomOffset[0],
      FLOWER_STEM.bottomY,
      FLOWER_STEM.bottomOffset[1],
    ),
  ]);
  const stemGeometry = new THREE.TubeGeometry(
    curve,
    64,
    FLOWER_STEM.radius,
    10,
    false,
  );
  // Teardrop receptacle the petal whorls grow out of.
  const receptacleProfile = [
    new THREE.Vector2(FLOWER_STEM.radius, -0.12),
    new THREE.Vector2(FLOWER_STEM.receptacleRadius * 0.75, -0.04),
    new THREE.Vector2(FLOWER_STEM.receptacleRadius, 0.03),
    new THREE.Vector2(FLOWER_STEM.receptacleRadius * 0.6, 0.075),
    new THREE.Vector2(0.001, 0.085),
  ];
  const receptacleGeometry = new THREE.LatheGeometry(receptacleProfile, 20);

  const fresnel = float(1)
    .sub((normalView as any).dot(positionViewDirection).abs())
    .pow(2.2);
  const heartFalloff = (smoothstep as any)(
    -0.9,
    FLOWER_STEM.topY,
    (positionLocal as any).y,
  );
  const material = new THREE.MeshStandardNodeMaterial({
    color: FLOWER_STEM.baseColor,
    roughness: 0.4,
    metalness: 0,
    transparent: true,
    opacity: FLOWER_STEM.opacity,
  });
  material.emissiveNode = color(FLOWER_STEM.rimColor)
    .mul(fresnel.mul(FLOWER_STEM.rimIntensity))
    .add(
      color(FLOWER_STEM.heartColor).mul(
        heartFalloff.pow(2).mul(FLOWER_STEM.heartIntensity),
      ),
    );

  const stem = new THREE.Mesh(stemGeometry, material);
  const receptacle = new THREE.Mesh(receptacleGeometry, material);
  group.add(stem, receptacle);

  function dispose() {
    stemGeometry.dispose();
    receptacleGeometry.dispose();
    material.dispose();
  }

  return { group, dispose };
}
