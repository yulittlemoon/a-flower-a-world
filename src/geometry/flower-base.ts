import * as THREE from 'three/webgpu';

export type FlowerBaseSettings = {
  anchorCount: number;
  radius: number;
  domeHeight: number;
};

// Petal whorls on the stem tip, innermost first. Each petal gets its own
// jittered azimuth, tilt, roll, size and bend so the bloom never reads as a
// regular radial fan. Every whorl has a closed (bud) and an open pose; the
// bloom amount blends between them.
//   tilt: angle from the stem axis (0 = upright, 90deg = horizontal)
//   curviness: signed bend; positive cups the tip toward the centre,
//              negative rolls the tip and margins outward
//   bloomDelay: outer whorls open first, inner ones follow
export const FLOWER_LAYERS = Object.freeze([
  Object.freeze({
    count: 5, height: 0.075, radius: 0.025, outness: 0.22,
    closedTiltDegrees: 3, openTiltDegrees: 22, tiltJitterDegrees: 5,
    closedCurviness: 0.55, openCurviness: -0.25, curvinessJitter: 0.15,
    size: 0.62, width: 0.62, bloomDelay: 0.3,
  }),
  Object.freeze({
    count: 7, height: 0.055, radius: 0.045, outness: 0.42,
    closedTiltDegrees: 6, openTiltDegrees: 36, tiltJitterDegrees: 8,
    closedCurviness: 0.5, openCurviness: -0.45, curvinessJitter: 0.2,
    size: 0.78, width: 0.8, bloomDelay: 0.2,
  }),
  Object.freeze({
    count: 8, height: 0.03, radius: 0.065, outness: 0.68,
    closedTiltDegrees: 10, openTiltDegrees: 50, tiltJitterDegrees: 10,
    closedCurviness: 0.42, openCurviness: -0.6, curvinessJitter: 0.22,
    size: 0.98, width: 0.98, bloomDelay: 0.1,
  }),
  Object.freeze({
    count: 8, height: 0.0, radius: 0.085, outness: 0.95,
    closedTiltDegrees: 16, openTiltDegrees: 64, tiltJitterDegrees: 10,
    closedCurviness: 0.34, openCurviness: -0.75, curvinessJitter: 0.22,
    size: 1.12, width: 1.05, bloomDelay: 0,
  }),
  // Outermost skirt: the widest petals, opening almost flat and rolling
  // their margins outward the most.
  Object.freeze({
    count: 9, height: -0.02, radius: 0.1, outness: 1,
    closedTiltDegrees: 22, openTiltDegrees: 80, tiltJitterDegrees: 9,
    closedCurviness: 0.28, openCurviness: -0.9, curvinessJitter: 0.2,
    size: 1.22, width: 1.15, bloomDelay: 0,
  }),
] as const);

export const FLOWER_BLOOM = {
  // Portion of the bloom range each whorl takes to open fully.
  layerSpan: 0.7,
  initial: 0.3,
} as const;

export const FLOWER_LAYERED_PETAL_COUNT = FLOWER_LAYERS.reduce(
  (total, layer) => total + layer.count,
  0,
);

export const FLOWER_BASE_DEFAULTS: Readonly<FlowerBaseSettings> = Object.freeze({
  anchorCount: FLOWER_LAYERED_PETAL_COUNT,
  radius: 0.1,
  domeHeight: 0.08,
});

export type FlowerAnchor = {
  index: number;
  sequenceT: number;
  outness: number;
  position: THREE.Vector3;
  normal: THREE.Vector3;
  orientation: THREE.Quaternion;
  // Final petal pose; used directly for placement.
  sizeScale: number;
  widthScale: number;
  curviness: number;
};

function seededRandom(seed: number) {
  const value = Math.sin(seed * 91.3458) * 47453.5453;
  return value - Math.floor(value);
}

function signedRandom(seed: number) {
  return seededRandom(seed) * 2 - 1;
}

export function sampleLayerBloom(bloom: number, bloomDelay: number) {
  return THREE.MathUtils.smootherstep(
    bloom,
    bloomDelay,
    bloomDelay + FLOWER_BLOOM.layerSpan,
  );
}

export function buildFlowerAnchors(
  parameters: FlowerBaseSettings,
  bloom: number = FLOWER_BLOOM.initial,
) {
  const anchors: FlowerAnchor[] = [];
  const up = new THREE.Vector3(0, 1, 0);
  const radial = new THREE.Vector3();
  const growth = new THREE.Vector3();
  const outward = new THREE.Vector3();
  const across = new THREE.Vector3();
  const goldenAngle = Math.PI * (3 - Math.sqrt(5));
  let index = 0;

  FLOWER_LAYERS.forEach((layer, layerIndex) => {
    const layerBloom = sampleLayerBloom(bloom, layer.bloomDelay);
    // Rotate each whorl so its petals sit over the gaps of the one inside.
    const layerOffset = layerIndex * goldenAngle * 1.7;
    for (let slot = 0; slot < layer.count; slot += 1) {
      if (index >= parameters.anchorCount) return;
      const seed = index * 7 + 3;
      const azimuth =
        layerOffset +
        (slot / layer.count) * Math.PI * 2 +
        signedRandom(seed) * (Math.PI / layer.count) * 0.55;
      // Each petal opens slightly ahead or behind its whorl.
      const petalBloom = THREE.MathUtils.clamp(
        layerBloom + signedRandom(seed + 9) * 0.08 * layerBloom * (1 - layerBloom) * 4,
        0,
        1,
      );
      const tilt = THREE.MathUtils.degToRad(
        THREE.MathUtils.lerp(
          layer.closedTiltDegrees,
          layer.openTiltDegrees,
          petalBloom,
        ) +
          signedRandom(seed + 1) * layer.tiltJitterDegrees * (0.3 + 0.7 * petalBloom),
      );
      const roll = signedRandom(seed + 2) * THREE.MathUtils.degToRad(14);
      radial.set(Math.cos(azimuth), 0, Math.sin(azimuth));
      growth
        .copy(radial)
        .multiplyScalar(Math.sin(tilt))
        .addScaledVector(up, Math.cos(tilt))
        .normalize();
      outward
        .copy(radial)
        .multiplyScalar(Math.cos(tilt))
        .addScaledVector(up, -Math.sin(tilt))
        .normalize();
      across.crossVectors(growth, outward).normalize();
      const orientation = new THREE.Quaternion()
        .setFromRotationMatrix(
          new THREE.Matrix4().makeBasis(across, growth, outward),
        )
        .multiply(
          new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0),
            roll,
          ),
        );
      const position = radial
        .clone()
        .multiplyScalar(layer.radius * (0.85 + 0.3 * seededRandom(seed + 3)))
        .setY(layer.height + signedRandom(seed + 4) * 0.008);
      anchors.push({
        index,
        sequenceT:
          parameters.anchorCount === 1 ? 0 : index / (parameters.anchorCount - 1),
        outness: THREE.MathUtils.clamp(
          layer.outness + signedRandom(seed + 5) * 0.05,
          0,
          1,
        ),
        position,
        normal: outward.clone(),
        orientation,
        sizeScale: layer.size * (0.88 + 0.24 * seededRandom(seed + 6)),
        widthScale: layer.width * (0.85 + 0.3 * seededRandom(seed + 7)),
        curviness:
          THREE.MathUtils.lerp(
            layer.closedCurviness,
            layer.openCurviness,
            petalBloom,
          ) +
          signedRandom(seed + 8) * layer.curvinessJitter,
      });
      index += 1;
    }
  });

  return anchors;
}
