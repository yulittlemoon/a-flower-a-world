import { ACTIVE_LIGHTING, LIGHTING_UNIFORMS } from './lighting-presets';
import * as THREE from 'three/webgpu';
import {
  PCFShadowFilter,
  cameraPosition,
  faceDirection,
  float,
  instanceIndex,
  lightShadowMatrix,
  mix,
  normalWorld,
  positionWorld,
  smoothstep,
  texture,
  uniform,
  vec3,
  vec4,
} from 'three/tsl';
import { CANOPY_OCCLUSION } from './canopy-occlusion';
import {
  createBakedPetalBumpNormalNode,
} from './baked-petal-bump';
import type { ValueNode } from '../geometry/geometry-contract';
import {
  createPetalDeformation,
  type PetalDeformation,
} from '../geometry/petal-deformation';
import type { DemoState } from '../state/state';
import { createTopEdgeAlphaCutoutMasks } from './top-edge-alpha-cutout';
import {
  createPetalLookNodes,
} from './petal-lookdev';
import { createStablePetalSeedNode } from './petal-broad-texture-bake';
import { PETAL_LOOKDEV } from './petal-lookdev-contract';
import { createRimLightNode } from './rim-light';
import { createBacklightBumpReliefNode } from './backlight-bump-relief';
import {
  createFlowerInteractionMaterial,
  type FlowerInteractionMaterial,
} from './flower-interaction-material';
import { createFlowerPetalCorruption } from './flower-petal-corruption';
import {
  createBrokenGoldEdgeMaskNode,
  createSatinHighlightNode,
  goldColorNode,
  goldGlowNode,
} from './petal-satin-gold';

export const DIRECTIONAL_SHADOW_PCF_RADIUS = 6;
export const DIRECTIONAL_SHADOW_DEPTH_BIAS = -0.0003;
export const DIRECTIONAL_SHADOW_NORMAL_BIAS = 0.01;
export const CUSTOM_SHADOW_RECEIVER_BIAS = 0.021;

export const PETAL_EDGE_SHEEN = {
  bandWidth: 0.16,
  edgeOpacity: 0.9,
  hueFresnelScale: 0.9,
  hueAlongScale: 0.35,
  hueAcrossScale: 0.2,
  baseGain: 0.35,
  fresnelGain: 1.1,
  strength: 1.05,
} as const;

export type Lookdev = {
  materials: {
    flowerPetal: THREE.MeshStandardNodeMaterial;
    flowerInteraction: THREE.MeshStandardNodeMaterial;
    flowerPresentationDigital: THREE.MeshStandardNodeMaterial;
    flowerPresentationReal: THREE.MeshStandardNodeMaterial;
    flowerCorruption: THREE.MeshBasicNodeMaterial;
    flowerCorruptionWireframe: THREE.MeshBasicNodeMaterial;
  };
  deformation: PetalDeformation;
  lighting: {
    backlightStrength: ValueNode<number>;
    rimLightStrength: ValueNode<number>;
    updateDirectionalLight(): void;
    bindShadowDepthTexture(depthTexture: THREE.DepthTexture): void;
  };
  fineVein: {
    updateTime(timestampMilliseconds: number): void;
  };
  interactionMaterial: FlowerInteractionMaterial;
  corruption: ReturnType<typeof createFlowerPetalCorruption>;
  dispose(): void;
};

export function createLookdev(
  keyLight: THREE.DirectionalLight,
  state: DemoState,
  textureInputs: {
    fineVein: THREE.Texture;
    bump: THREE.Texture;
    albedoGrain: THREE.Texture;
    broad: THREE.StorageArrayTexture;
  },
): Lookdev {
  const deformation = createPetalDeformation(
    state.flower,
    state.petal,
    state.simulation,
    state.flowerBase,
  );
  const makeUniform = uniform as (...values: any[]) => any;
  const makeFloat = float as (...values: any[]) => any;
  const makeTexture = texture as (...values: any[]) => any;
  const makeVec3 = vec3 as (...values: any[]) => any;
  const makeVec4 = vec4 as (...values: any[]) => any;
  const worldPositionNode: any = positionWorld;
  const visibleBumpWorldNormalNode: any = normalWorld;
  const visibleFaceDirectionNode: any = faceDirection;
  const backlightStrengthNode: any = makeUniform(
    state.lighting.backlightStrength,
  );
  const rimLightStrengthNode: any = makeUniform(
    state.lighting.rimLightStrength,
  );
  const canopyOcclusionStrengthNode: any = makeUniform(
    state.lighting.canopyOcclusionStrength,
  );
  const fineVeinStrengthNode: any = makeUniform(
    state.lighting.fineVeinDetailStrength,
  );
  const bumpStrengthNode: any = makeUniform(
    state.lighting.bumpStrength,
  );
  const fineVeinElapsedSecondsNode: any = makeUniform(0);
  const backlightDirectionNode: any = makeUniform(
    new THREE.Vector3(3, 4, 5).normalize(),
  );
  const backlightLightColorNode: any = makeUniform(
    new THREE.Color(3, 3, 3),
  );
  const backlightPetalColorNode: any = makeUniform(
    new THREE.Color(0xffeccc),
  );
  const keyLightShadowMatrixNode: any = (lightShadowMatrix as any)(
    keyLight,
  );
  const uvNode = deformation.nodes.uv;
  // Warm light that seems to shine out of the flower heart through the petal roots.
  const heartGlowNode = makeVec3(1, 0.78, 0.42).mul(
    uvNode.y.oneMinus().pow(2.4).mul(LIGHTING_UNIFORMS.heartGlow),
  );
  // Thin margin band where light passes through the petal edge.
  const petalEdgeDistanceNode = uvNode.x
    .min(uvNode.x.oneMinus())
    .min(uvNode.y.oneMinus().mul(0.8));
  const petalEdgeMaskNode = (smoothstep as any)(
    0,
    PETAL_EDGE_SHEEN.bandWidth,
    petalEdgeDistanceNode,
  )
    .oneMinus()
    .mul((smoothstep as any)(0.12, 0.4, uvNode.y));
  // Silk translucency: nearly solid at the root, sheer toward the tip,
  // sheerest along the margin.
  const petalOpacityNode = (mix as any)(
    0.95,
    0.86,
    (smoothstep as any)(0.1, 0.95, uvNode.y),
  ).mul((mix as any)(1, PETAL_EDGE_SHEEN.edgeOpacity, petalEdgeMaskNode));
  const topEdgeMasks = createTopEdgeAlphaCutoutMasks(uvNode);
  const flowerLook = createPetalLookNodes({
    uvNode,
    broadLayerNode: instanceIndex,
    seedNode: createStablePetalSeedNode(instanceIndex),
    elapsedSecondsNode: fineVeinElapsedSecondsNode,
    fineVeinStrengthNode,
    fineVeinTexture: textureInputs.fineVein,
    albedoGrainTexture: textureInputs.albedoGrain,
    broadTexture: textureInputs.broad,
  });
  const flowerCorruption = createFlowerPetalCorruption({
    positionNode: deformation.nodes.flowerPosition,
    realColorNode: flowerLook.color,
    realMaskNode: topEdgeMasks.flower,
  });
  const flowerBumpNormalNode = createBakedPetalBumpNormalNode({
    uvNode,
    seedNode: createStablePetalSeedNode(instanceIndex),
    strengthNode: bumpStrengthNode,
    baseViewNormalNode: deformation.nodes.flowerViewNormal,
    tangentAcrossNode: deformation.nodes.flowerViewTangentAcross,
    tangentAlongNode: deformation.nodes.flowerViewTangentAlong,
    faceDirectionNode: visibleFaceDirectionNode,
    bumpTexture: textureInputs.bump,
  });
  const goldEdgeMaskNode = createBrokenGoldEdgeMaskNode(
    uvNode,
    topEdgeMasks.flowerCutDepth,
  );
  const petalColorNode = (mix as any)(
    flowerLook.color,
    goldColorNode(),
    goldEdgeMaskNode,
  );
  const satinHighlightNode = createSatinHighlightNode({
    uvNode,
    viewNormalNode: deformation.nodes.flowerViewNormal,
    viewTangentAlongNode: deformation.nodes.flowerViewTangentAlong,
    worldLightDirectionNode: backlightDirectionNode,
  }).mul(goldEdgeMaskNode.oneMinus());

  function shadowVisibilityNode(depthNode: any) {
    const shadowWorldPosition = worldPositionNode.add(
      backlightDirectionNode.mul(
        CUSTOM_SHADOW_RECEIVER_BIAS,
      ),
    );
    const projected = keyLightShadowMatrixNode.mul(
      makeVec4(shadowWorldPosition, 1),
    );
    const projectedCoord = projected.xyz.div(projected.w);
    const shadowCoord = makeVec3(
      projectedCoord.x,
      projectedCoord.y.oneMinus(),
      projectedCoord.z.add(keyLight.shadow.bias),
    );
    const pcf = (PCFShadowFilter as any)({
      depthTexture: depthNode,
      shadowCoord,
      shadow: keyLight.shadow,
    });
    const inside = shadowCoord.x
      .greaterThanEqual(0)
      .and(shadowCoord.x.lessThanEqual(1))
      .and(shadowCoord.y.greaterThanEqual(0))
      .and(shadowCoord.y.lessThanEqual(1))
      .and(shadowCoord.z.lessThanEqual(1));
    return inside.select(pcf, 1);
  }

  function backlightNode(
    worldNormal: any,
    shadowVisibility: any,
    transmissionMask: any,
  ) {
    const smoothVisibleWorldNormal = worldNormal.mul(
      visibleFaceDirectionNode,
    );
    const smoothLobe = smoothVisibleWorldNormal
      .negate()
      .dot(backlightDirectionNode)
      .max(0)
      .pow(1.5);
    const relief = createBacklightBumpReliefNode({
      smoothVisibleWorldNormalNode: smoothVisibleWorldNormal,
      bumpVisibleWorldNormalNode: visibleBumpWorldNormalNode,
      lightDirectionNode: backlightDirectionNode,
      bumpStrengthNode,
    });
    const lobe = smoothLobe.mul(relief);
    return backlightPetalColorNode
      .mul(backlightLightColorNode)
      .mul(lobe)
      .mul((mix as any)(0.18, 1, shadowVisibility))
      .mul(transmissionMask)
      .mul(backlightStrengthNode);
  }

  function pearlEdgeSheenNode(worldNormal: any) {
    const viewDirection = (cameraPosition as any).sub(worldPositionNode).normalize();
    const facing = worldNormal.dot(viewDirection).abs();
    const fresnel = facing.oneMinus().pow(2);
    // Cosine palette drifting through lavender, silver white and pale pearl pink
    // as the view angle and position along the petal change.
    const hue = fresnel
      .mul(PETAL_EDGE_SHEEN.hueFresnelScale)
      .add(uvNode.y.mul(PETAL_EDGE_SHEEN.hueAlongScale))
      .add(uvNode.x.mul(PETAL_EDGE_SHEEN.hueAcrossScale));
    const phase = makeVec3(0, 0.33, 0.67).add(hue).mul(Math.PI * 2);
    const pearl = makeVec3(0.8, 0.8, 0.98).add(
      makeVec3(0.16, 0.12, 0.05).mul(phase.cos()),
    );
    return pearl
      .mul(petalEdgeMaskNode)
      .mul(fresnel.mul(PETAL_EDGE_SHEEN.fresnelGain).add(PETAL_EDGE_SHEEN.baseGain))
      .mul(PETAL_EDGE_SHEEN.strength);
  }

  function petalEmissiveNode(
    worldNormal: any,
    shadowVisibility: any,
    transmissionMask: any,
    petalColor: any,
    topEdgeCutDepth: any,
    topEdgeDetailSignal: any,
  ) {
    // Key-light terms (transmitted backlight, satin streak, backlit rim) plus
    // the self-lit heart glow and pearl edge sheen, scaled by the lighting
    // preset.
    const rimNode = createRimLightNode({
      uvNode,
      topEdgeCutDepthNode: topEdgeCutDepth,
      topEdgeDetailSignalNode: topEdgeDetailSignal,
      worldNormalNode: worldNormal,
      visibleFaceDirectionNode,
      lightDirectionNode: backlightDirectionNode,
      petalColorNode: petalColor,
      strengthNode: rimLightStrengthNode,
    });
    return backlightNode(
      worldNormal,
      shadowVisibility,
      transmissionMask,
    )
      .add(heartGlowNode)
      .add(satinHighlightNode)
      .add(
        rimNode
          .add(
            pearlEdgeSheenNode(worldNormal).mul(
              LIGHTING_UNIFORMS.pearlEdgeSheen,
            ),
          )
          .mul(goldEdgeMaskNode.oneMinus()),
      )
      .add(goldGlowNode(goldEdgeMaskNode));
  }

  function canopyAmbientVisibilityNode(rootMask: any) {
    const strengthResponse = canopyOcclusionStrengthNode.mul(
      canopyOcclusionStrengthNode
        .mul(CANOPY_OCCLUSION.maximumStrengthGain - 1)
        .add(1),
    );
    const occlusion = rootMask
      .mul(strengthResponse)
      .clamp(0, 1);
    return occlusion.oneMinus();
  }

  // Look D: cold silver-white satin. The streaked satin highlight itself is
  // added in the emissive term because the petals have no tangent attribute.
  const flowerPetalMaterial = new THREE.MeshPhysicalNodeMaterial({
    color: 0xe8edfb,
    roughness: 0.18,
    metalness: 0.12,
    ior: PETAL_LOOKDEV.reflectance.ior,
    sheen: 0.6,
    sheenColor: new THREE.Color(0xffffff),
    sheenRoughness: 0.25,
    clearcoat: 0.4,
    clearcoatRoughness: 0.25,
    iridescence: 0.25,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
    side: THREE.DoubleSide,
  });
  const petalRoughnessNode = (mix as any)(
    makeFloat(0.18),
    makeFloat(0.22),
    goldEdgeMaskNode,
  );
  flowerPetalMaterial.positionNode = deformation.nodes.flowerPosition;
  // Albedo kept below pure white, as in the material lab, so highlights read.
  flowerPetalMaterial.colorNode = petalColorNode.mul(0.8);
  flowerPetalMaterial.normalNode = flowerBumpNormalNode;
  flowerPetalMaterial.roughnessNode = petalRoughnessNode;
  flowerPetalMaterial.metalnessNode = (mix as any)(
    makeFloat(0.12),
    makeFloat(0.85),
    goldEdgeMaskNode,
  );
  flowerPetalMaterial.maskNode = topEdgeMasks.flower;
  flowerPetalMaterial.maskShadowNode = topEdgeMasks.flower;
  flowerPetalMaterial.opacityNode = (mix as any)(
    petalOpacityNode,
    makeFloat(1),
    goldEdgeMaskNode,
  );
  flowerPetalMaterial.transparent = true;
  flowerPetalMaterial.depthWrite = true;
  const flowerAoNode = canopyAmbientVisibilityNode(
    flowerLook.canopyRootMask,
  );
  flowerPetalMaterial.aoNode = flowerAoNode;
  const initialFlowerEmissiveNode = petalEmissiveNode(
    deformation.nodes.flowerWorldNormal,
    makeFloat(1),
    flowerLook.transmission,
    flowerLook.color,
    topEdgeMasks.flowerCutDepth,
    topEdgeMasks.flowerDetailSignal,
  );
  flowerPetalMaterial.emissiveNode = initialFlowerEmissiveNode;
  const flowerInteractionMaterial = createFlowerInteractionMaterial({
    positionNode: deformation.nodes.flowerPosition,
    curvinessDeltaNode: deformation.nodes.flowerCurvinessDelta,
    introStartCurvinessDeltaNode:
      deformation.nodes.flowerIntroStartCurvinessDelta,
    realColorNode: petalColorNode,
    realNormalNode: flowerBumpNormalNode,
    realRoughnessNode: petalRoughnessNode,
    realEmissiveNode: initialFlowerEmissiveNode,
    realAoNode: flowerAoNode,
    realMaskNode: topEdgeMasks.flower,
  });
  let shadowBound = false;
  let disposed = false;
  let fineVeinStartTimestamp: number | null = null;

  function updateFineVeinTime(timestampMilliseconds: number) {
    fineVeinStartTimestamp ??= timestampMilliseconds;
    fineVeinElapsedSecondsNode.value =
      (timestampMilliseconds - fineVeinStartTimestamp) / 1000;
  }

  function bindShadowDepthTexture(depthTexture: THREE.DepthTexture) {
    if (shadowBound) return;
    shadowBound = true;
    const depthNode = makeTexture(depthTexture);
    const flowerVisibility = shadowVisibilityNode(depthNode);
    const flowerEmissiveNode = petalEmissiveNode(
      deformation.nodes.flowerWorldNormal,
      flowerVisibility,
      flowerLook.transmission,
      flowerLook.color,
      topEdgeMasks.flowerCutDepth,
      topEdgeMasks.flowerDetailSignal,
    );
    flowerPetalMaterial.emissiveNode = flowerEmissiveNode;
    flowerInteractionMaterial.setRealEmissiveNode(flowerEmissiveNode);
    flowerPetalMaterial.needsUpdate = true;
  }

  function updateDirectionalLight() {
    backlightDirectionNode.value
      .copy(keyLight.position)
      .sub(keyLight.target.position)
      .normalize();
    backlightLightColorNode.value
      .copy(keyLight.color)
      .multiplyScalar(keyLight.intensity * 0.25);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    deformation.simulation.dispose();
    flowerPetalMaterial.dispose();
    flowerInteractionMaterial.digitalMaterial.dispose();
    flowerInteractionMaterial.realMaterial.dispose();
    flowerInteractionMaterial.interactionMaterial.dispose();
    flowerInteractionMaterial.dispose();
    flowerCorruption.dispose();
    keyLight.shadow.dispose();
  }

  updateDirectionalLight();

  return {
    materials: {
      flowerPetal: flowerPetalMaterial,
      flowerInteraction: flowerInteractionMaterial.interactionMaterial,
      flowerPresentationDigital: flowerInteractionMaterial.digitalMaterial,
      flowerPresentationReal: flowerInteractionMaterial.realMaterial,
      flowerCorruption: flowerCorruption.material,
      flowerCorruptionWireframe: flowerCorruption.wireframeMaterial,
    },
    deformation,
    lighting: {
      backlightStrength: backlightStrengthNode,
      rimLightStrength: rimLightStrengthNode,
      updateDirectionalLight,
      bindShadowDepthTexture,
    },
    fineVein: {
      updateTime: updateFineVeinTime,
    },
    interactionMaterial: flowerInteractionMaterial,
    corruption: flowerCorruption,
    dispose,
  };
}

export function createKeyLight() {
  const light = new THREE.DirectionalLight(
    ACTIVE_LIGHTING.keyColor,
    ACTIVE_LIGHTING.keyIntensity,
  );
  // In front of the flower, on the camera side and a little above and to the
  // left on screen (camera looks along +z, so screen left is +x).
  light.position.set(...ACTIVE_LIGHTING.keyPosition);
  light.castShadow = true;
  light.shadow.mapSize.set(1024, 1024);
  light.shadow.radius = DIRECTIONAL_SHADOW_PCF_RADIUS;
  light.shadow.bias = DIRECTIONAL_SHADOW_DEPTH_BIAS;
  light.shadow.normalBias = DIRECTIONAL_SHADOW_NORMAL_BIAS;
  light.shadow.camera.near = 0.5;
  light.shadow.camera.far = 10;
  return light;
}
