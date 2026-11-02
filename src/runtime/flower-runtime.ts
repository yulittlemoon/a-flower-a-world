import * as THREE from 'three/webgpu';
import {
  buildFlowerAnchors,
  FLOWER_BLOOM,
  type FlowerBaseSettings,
} from '../geometry/flower-base';
import {
  FLOWER_PETAL_BASE_SCALE,
  type FlowerModeSettings,
} from '../geometry/flower-mode';
import type { FrameContext, FrameParticipant } from '../app/animation-contract';
import { PETAL_GEOMETRY } from '../geometry/geometry-contract';
import { createFlowerStamens } from './flower-stamens';
import { createFlowerStem } from './flower-stem';
import type { Lookdev } from '../rendering/lookdev';
import {
  createFlowerParticles,
} from '../presentation/flower-particles';
import type {
  CanonicalPetalGeometryResource,
} from './petal-geometry-resource';

export const FLOWER_SELF_ROTATION_RADIANS_PER_SECOND =
  3 * (Math.PI / 180);
export const FLOWER_SELF_ROTATION_MAXIMUM_DELTA_SECONDS = 0.05;
export const FLOWER_LEAN_RADIANS = THREE.MathUtils.degToRad(20);
export const FLOWER_FACE_TILT_RADIANS = THREE.MathUtils.degToRad(-48);

export function advanceFlowerRotation(
  angle: number,
  elapsedSeconds: number,
) {
  return (
    angle +
    Math.min(
      FLOWER_SELF_ROTATION_MAXIMUM_DELTA_SECONDS,
      Math.max(0, elapsedSeconds),
    ) *
      FLOWER_SELF_ROTATION_RADIANS_PER_SECOND
  );
}

export function createFlowerSelfRotation(flowerRoot: THREE.Object3D) {
  let angle = 0;
  let previousTimestamp: number | null = null;
  let paused = false;

  function setPaused(nextPaused: boolean) {
    if (paused === nextPaused) return;
    paused = nextPaused;
    previousTimestamp = null;
  }

  function update(timestamp: number) {
    if (paused) return;
    if (previousTimestamp !== null) {
      angle = advanceFlowerRotation(
        angle,
        (timestamp - previousTimestamp) / 1000,
      );
      flowerRoot.rotation.y = angle;
    }
    previousTimestamp = timestamp;
  }

  return {
    setPaused,
    update,
  };
}

export function createFlowerRuntime(
  scene: THREE.Scene,
  geometryResource: CanonicalPetalGeometryResource,
  lookdev: Lookdev,
  flowerBaseSettings: FlowerBaseSettings,
  flowerModeSettings: FlowerModeSettings,
): FrameParticipant & {
  rebuildBase(rebuildInstances?: boolean): void;
  updatePlacement(rebuildRest?: boolean): void;
  rebuildSimulationRest(): void;
  refreshSimulationRenderRest(): void;
  setInteractionActive(active: boolean): void;
  setPresentationMaterials(
    realMaterial: THREE.Material | null,
    digitalMaterial: THREE.Material | null,
  ): void;
  prepareInteractionOverlayPrewarm(): () => void;
  setInteractionOverlayActive(active: boolean): void;
  setCorruptionActive(active: boolean): void;
  setStamenGrowth(growth: number): void;
  setBloom(bloom: number): void;
  update(
    context: FrameContext,
    runPetalSimulation?: boolean,
  ): void;
  readonly interactionSpace: THREE.Object3D;
  readonly particles: ReturnType<
    typeof createFlowerParticles
  >;
} {
  const petalGroup = new THREE.Group();
  petalGroup.name = 'Flower Petals';
  const flowerRoot = new THREE.Group();
  flowerRoot.name = 'Flower Root';
  // Lean the flower across the frame and tip its face toward the camera like
  // the reference shots; the self rotation (innermost, Y) still spins it
  // around its own stem axis.
  flowerRoot.rotation.order = 'XZY';
  flowerRoot.rotation.x = FLOWER_FACE_TILT_RADIANS;
  flowerRoot.rotation.z = FLOWER_LEAN_RADIANS;
  // Sit the flower a little left of and below centre so the fully open bloom
  // stays inside the frame. The camera looks along +z, so screen left is +x.
  flowerRoot.position.set(0.35, 0.05, 0);
  flowerRoot.add(petalGroup);
  scene.add(flowerRoot);
  const stamens = createFlowerStamens();
  flowerRoot.add(stamens.group);
  const stem = createFlowerStem();
  flowerRoot.add(stem.group);

  function setStamenGrowth(growth: number) {
    stamens.group.visible = growth > 0;
    stamens.group.scale.setScalar(Math.max(growth, 1e-3));
  }
  let bloom: number = FLOWER_BLOOM.initial;
  let anchors = buildFlowerAnchors(flowerBaseSettings, bloom);
  const instances:
    THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> =
    new THREE.InstancedMesh(
      geometryResource.geometry,
      lookdev.materials.flowerPetal,
      PETAL_GEOMETRY.flowerCapacity.maximumPetals,
    );
  const digitalOverlayInstances:
    THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> =
    new THREE.InstancedMesh(
      geometryResource.geometry,
      lookdev.materials.flowerPresentationDigital,
      PETAL_GEOMETRY.flowerCapacity.maximumPetals,
    );
  const corruptionInstances:
    THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> =
    new THREE.InstancedMesh(
      geometryResource.geometry,
      lookdev.materials.flowerCorruption,
      PETAL_GEOMETRY.flowerCapacity.maximumPetals,
    );
  const corruptionWireframeInstances:
    THREE.InstancedMesh<THREE.BufferGeometry, THREE.Material> =
    new THREE.InstancedMesh(
      geometryResource.geometry,
      lookdev.materials.flowerCorruptionWireframe,
      PETAL_GEOMETRY.flowerCapacity.maximumPetals,
    );
  digitalOverlayInstances.instanceMatrix = instances.instanceMatrix;
  digitalOverlayInstances.visible = false;
  digitalOverlayInstances.castShadow = false;
  digitalOverlayInstances.receiveShadow = false;
  digitalOverlayInstances.renderOrder = 1;
  corruptionInstances.instanceMatrix = instances.instanceMatrix;
  corruptionInstances.visible = false;
  corruptionInstances.castShadow = false;
  corruptionInstances.receiveShadow = false;
  corruptionInstances.renderOrder = 2;
  corruptionWireframeInstances.instanceMatrix = instances.instanceMatrix;
  corruptionWireframeInstances.visible = false;
  corruptionWireframeInstances.castShadow = false;
  corruptionWireframeInstances.receiveShadow = false;
  corruptionWireframeInstances.renderOrder = 3;
  let interactionActive = false;
  let presentationRealMaterial: THREE.Material | null = null;
  let presentationDigitalMaterial: THREE.Material | null = null;
  let interactionOverlayActive = false;
  let corruptionActive = false;
  let disposed = false;
  const selfRotation = createFlowerSelfRotation(flowerRoot);
  const simulation = lookdev.deformation.simulation;
  const particles =
    createFlowerParticles({
      parent: flowerRoot,
      geometryResource,
      simulation,
      instances,
      getAnchors: () => anchors,
    });
  instances.castShadow = true;
  instances.receiveShadow = true;
  petalGroup.add(
    instances,
    digitalOverlayInstances,
    corruptionInstances,
    corruptionWireframeInstances,
  );

  function rebuildSimulationRest() {
    simulation.updateSnapshot({
      anchors,
      flowerRadius: flowerBaseSettings.radius,
      geometry: geometryResource.geometry,
      topology: geometryResource.topology,
      instances,
    });
    particles.syncAnchors();
  }

  function refreshSimulationRenderRest() {
    simulation.refreshRenderRest({
      anchors,
      flowerRadius: flowerBaseSettings.radius,
      geometry: geometryResource.geometry,
      topology: geometryResource.topology,
      instances,
    });
  }

  function updatePlacement(rebuildRest = true) {
    const matrix = new THREE.Matrix4();
    const scale = new THREE.Vector3();
    anchors.forEach((anchor) => {
      const size = FLOWER_PETAL_BASE_SCALE * anchor.sizeScale;
      scale.set(size * anchor.widthScale, size, size);
      matrix.compose(anchor.position, anchor.orientation, scale);
      instances.setMatrixAt(anchor.index, matrix);
      geometryResource.setFlowerInstance(
        anchor.index,
        matrix,
        anchor.outness,
      );
    });
    instances.instanceMatrix.needsUpdate = true;
    geometryResource.commitFlowerInstances(anchors.length);
    instances.count = anchors.length;
    digitalOverlayInstances.count = anchors.length;
    corruptionInstances.count = anchors.length;
    corruptionWireframeInstances.count = anchors.length;
    instances.computeBoundingSphere();
    digitalOverlayInstances.computeBoundingSphere();
    corruptionInstances.computeBoundingSphere();
    corruptionWireframeInstances.computeBoundingSphere();
    if (rebuildRest) rebuildSimulationRest();
  }

  function updateRenderState() {
    instances.material = interactionOverlayActive
      ? lookdev.materials.flowerInteraction
      : presentationRealMaterial ?? lookdev.materials.flowerPetal;
    digitalOverlayInstances.visible =
      !interactionOverlayActive &&
      presentationDigitalMaterial !== null;
    if (presentationDigitalMaterial !== null) {
      digitalOverlayInstances.material = presentationDigitalMaterial;
    }
    corruptionInstances.visible = corruptionActive;
    corruptionWireframeInstances.visible = corruptionActive;
  }

  function rebuildBase(
    rebuildInstances = true,
  ) {
    anchors = buildFlowerAnchors(flowerBaseSettings, bloom);
    if (rebuildInstances) updatePlacement();
  }

  // Re-pose every petal for a new bloom amount. Only the render rest shape is
  // refreshed, so the petal simulation keeps running on top of it.
  function setBloom(nextBloom: number) {
    if (nextBloom === bloom) return;
    bloom = nextBloom;
    anchors = buildFlowerAnchors(flowerBaseSettings, bloom);
    updatePlacement(false);
    refreshSimulationRenderRest();
  }

  function setInteractionActive(active: boolean) {
    interactionActive = active;
    selfRotation.setPaused(interactionActive);
  }

  function setPresentationMaterials(
    realMaterial: THREE.Material | null,
    digitalMaterial: THREE.Material | null,
  ) {
    presentationRealMaterial = realMaterial;
    presentationDigitalMaterial = digitalMaterial;
    updateRenderState();
  }

  function setInteractionOverlayActive(active: boolean) {
    if (interactionOverlayActive === active) return;
    interactionOverlayActive = active;
    updateRenderState();
  }

  function prepareInteractionOverlayPrewarm() {
    const previousInteractionOverlayActive = interactionOverlayActive;
    const previousCorruptionActive = corruptionActive;
    setInteractionOverlayActive(true);
    setCorruptionActive(true);
    return () => {
      setCorruptionActive(previousCorruptionActive);
      setInteractionOverlayActive(previousInteractionOverlayActive);
    };
  }

  function setCorruptionActive(active: boolean) {
    if (corruptionActive === active) return;
    corruptionActive = active;
    updateRenderState();
  }

  function update(
    { renderer, timestamp }: FrameContext,
    runPetalSimulation = true,
  ) {
    selfRotation.update(timestamp);
    particles.update(renderer, timestamp);
    simulation.update(renderer, timestamp, runPetalSimulation);
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    particles.dispose();
    stamens.group.removeFromParent();
    stamens.dispose();
    stem.group.removeFromParent();
    stem.dispose();
    digitalOverlayInstances.removeFromParent();
    digitalOverlayInstances.dispose();
    corruptionInstances.removeFromParent();
    corruptionInstances.dispose();
    corruptionWireframeInstances.removeFromParent();
    corruptionWireframeInstances.dispose();
    instances.removeFromParent();
    instances.dispose();
    flowerRoot.removeFromParent();
  }

  return {
    rebuildBase,
    updatePlacement,
    rebuildSimulationRest,
    refreshSimulationRenderRest,
    setInteractionActive,
    setPresentationMaterials,
    prepareInteractionOverlayPrewarm,
    setInteractionOverlayActive,
    setCorruptionActive,
    setStamenGrowth,
    setBloom,
    interactionSpace: flowerRoot,
    particles,
    update,
    dispose,
  };
}
