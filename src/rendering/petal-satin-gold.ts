import { LIGHTING_UNIFORMS } from './lighting-presets';
import {
  cameraViewMatrix,
  float,
  fwidth,
  positionView,
  smoothstep,
  time,
  vec3,
} from 'three/tsl';

// Look D from the petal material lab: cold silver-white satin with a broken,
// twinkling gold outline.
export const PETAL_SATIN_GOLD = {
  satin: {
    // Kajiya-Kay style streak along the petal growth direction.
    sharpExponent: 70,
    sharpStrength: 0.8,
    broadExponent: 7,
    broadStrength: 0.16,
    color: [0.92, 0.94, 1] as const,
    // Fine fibre streaks across the petal width.
    fibreFrequency: 70,
    fibreDepth: 0.1,
    // Secondary soft sky direction (world space). 0 = key light only.
    skyDirection: [0.2, 1, 0.35] as const,
    skyStrength: 0,
  },
  gold: {
    // Gold outline switched off for now; the satin look stays.
    enabled: false,
    color: [0.86, 0.56, 0.18] as const,
    glow: [1, 0.68, 0.26] as const,
    glowStrength: 1.25,
    edgeWidth: 0.014,
    // Gold appears only on part of the petal from root to tip.
    rootFadeStart: 0.03,
    rootFadeEnd: 0.12,
    // Broken outline: cells along the margin, each on or off, each twinkling.
    cellFrequency: 110,
    cellThreshold: 0.45,
    twinkleSpeed: 2.6,
    twinkleFloor: 0.3,
  },
} as const;

export function createBrokenGoldEdgeMaskNode(uvNode: any, cutDepthNode: any) {
  const { gold } = PETAL_SATIN_GOLD;
  if (!gold.enabled) return float(0);
  const u = uvNode.x;
  const v = uvNode.y;
  const edgeDistance = u
    .min(u.oneMinus())
    .min(v.oneMinus().sub(cutDepthNode).max(0).mul(0.9));
  const antialias = (fwidth as any)(edgeDistance).mul(1.2);
  const line = (smoothstep as any)(
    float(gold.edgeWidth),
    antialias.add(gold.edgeWidth),
    edgeDistance,
  ).oneMinus();
  const cell = v.add(u.mul(0.35)).mul(gold.cellFrequency).floor();
  const hash = cell.mul(12.9898).sin().mul(43758.5453).fract();
  const fleck = (smoothstep as any)(
    gold.cellThreshold,
    gold.cellThreshold + 0.05,
    hash,
  );
  const twinkle = (time as any)
    .mul(gold.twinkleSpeed)
    .add(hash.mul(25))
    .sin()
    .mul(0.5)
    .add(0.5)
    .mul(1 - gold.twinkleFloor)
    .add(gold.twinkleFloor);
  return line
    .mul((smoothstep as any)(gold.rootFadeStart, gold.rootFadeEnd, v))
    .mul(fleck)
    .mul(twinkle);
}

export function goldColorNode() {
  return (vec3 as any)(...PETAL_SATIN_GOLD.gold.color);
}

export function goldGlowNode(goldMaskNode: any) {
  const { gold } = PETAL_SATIN_GOLD;
  return (vec3 as any)(...gold.glow).mul(goldMaskNode.mul(gold.glowStrength));
}

function streak(tangent: any, halfVector: any, exponent: number) {
  const along = tangent.dot(halfVector);
  return along.mul(along).oneMinus().max(0).sqrt().pow(exponent);
}

export function createSatinHighlightNode({
  uvNode,
  viewNormalNode,
  viewTangentAlongNode,
  worldLightDirectionNode,
}: {
  uvNode: any;
  viewNormalNode: any;
  viewTangentAlongNode: any;
  worldLightDirectionNode: any;
}) {
  const { satin } = PETAL_SATIN_GOLD;
  const makeVec3 = vec3 as (...values: any[]) => any;
  const viewDirection = (positionView as any).negate().normalize();
  const tangent = viewTangentAlongNode.normalize();
  const keyLight = worldLightDirectionNode
    .transformDirection(cameraViewMatrix)
    .normalize();
  const skyLight = makeVec3(...satin.skyDirection)
    .normalize()
    .transformDirection(cameraViewMatrix)
    .normalize();
  const keyHalf = keyLight.add(viewDirection).normalize();
  const skyHalf = skyLight.add(viewDirection).normalize();
  const keyFacing = viewNormalNode.dot(keyLight).abs().mul(0.65).add(0.35);
  const keyStreak = streak(tangent, keyHalf, satin.sharpExponent)
    .mul(satin.sharpStrength)
    .add(streak(tangent, keyHalf, satin.broadExponent).mul(satin.broadStrength))
    .mul(keyFacing);
  const skyStreak = streak(tangent, skyHalf, satin.broadExponent).mul(
    LIGHTING_UNIFORMS.skySatin.mul(satin.broadStrength),
  );
  const fibre = uvNode.x
    .mul(satin.fibreFrequency)
    .add(uvNode.y.mul(3).sin())
    .sin()
    .mul(0.5)
    .add(0.5)
    .mul(satin.fibreDepth)
    .add(1 - satin.fibreDepth);
  return makeVec3(...satin.color).mul(keyStreak.add(skyStreak).mul(fibre));
}
