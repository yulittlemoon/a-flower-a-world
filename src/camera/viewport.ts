import { ACTIVE_LIGHTING } from '../rendering/lighting-presets';
import * as THREE from 'three/webgpu';
import type { Lookdev } from '../rendering/lookdev';
import {
  FLOWER_CAMERA_FOCAL_LENGTH,
  FLOWER_CAMERA_POSE,
  sampleFlowerCameraIntroPose,
  sampleFlowerStageThreeTargetPose,
  type CameraPose,
} from './camera-default';
import type { FlowerStageThreeMotion } from '../presentation/flower-stage-three';

export const FLOWER_COMPOSITION = Object.freeze({
  verticalPanDistanceFraction: 0.027,
});

export function createViewport(
  scene: THREE.Scene,
  renderer: THREE.WebGPURenderer,
  keyLight: THREE.DirectionalLight,
  lookdev: Lookdev,
): {
  camera: THREE.PerspectiveCamera;
  target: THREE.Vector3;
  hemisphereLight: THREE.HemisphereLight;
  setFlowerIntroProgress(progress: number): void;
  beginFlowerStageThree(returnPose: CameraPose): void;
  setFlowerStageThreeProgress(
    progress: number,
    motion: FlowerStageThreeMotion,
  ): void;
  resize(): THREE.Vector3;
} {
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.1,
    100,
  );
  camera.setFocalLength(FLOWER_CAMERA_FOCAL_LENGTH);
  camera.position.fromArray(FLOWER_CAMERA_POSE.position);

  const hemisphereLight = new THREE.HemisphereLight(
    ACTIVE_LIGHTING.hemisphereSky,
    ACTIVE_LIGHTING.hemisphereGround,
    ACTIVE_LIGHTING.hemisphereIntensity,
  );
  scene.add(hemisphereLight);
  scene.add(keyLight, keyLight.target);
  // Aim the key light at the flower head (the flower root is offset to the
  // left and tipped toward the camera) and cover the full open bloom.
  keyLight.target.position.set(0.35, 0.65, 0);
  const extent = 2.2;
  keyLight.shadow.camera.left = -extent;
  keyLight.shadow.camera.right = extent;
  keyLight.shadow.camera.top = extent;
  keyLight.shadow.camera.bottom = -extent;
  keyLight.shadow.camera.updateProjectionMatrix();
  lookdev.lighting.updateDirectionalLight();

  const target = new THREE.Vector3().fromArray(FLOWER_CAMERA_POSE.target);
  camera.lookAt(target);
  camera.updateMatrixWorld();
  const flowerCompositionPan = new THREE.Vector3();
  const flowerCompositionForward = new THREE.Vector3();
  const flowerCompositionRight = new THREE.Vector3();
  const flowerCompositionUp = new THREE.Vector3();
  const previousFlowerCompositionPan = new THREE.Vector3();
  const flowerCompositionPanDelta = new THREE.Vector3();
  const flowerIntroWorkingPose: CameraPose = {
    position: [0, 0, 0],
    target: [0, 0, 0],
  };
  let flowerStageThreeStartPose: CameraPose = {
    position: [...FLOWER_CAMERA_POSE.position],
    target: [...FLOWER_CAMERA_POSE.target],
  };
  let flowerStageThreeTargetPose = sampleFlowerStageThreeTargetPose(
    camera.aspect,
  );
  let flowerStageThreeReturnPose: CameraPose = {
    position: [...FLOWER_CAMERA_POSE.position],
    target: [...FLOWER_CAMERA_POSE.target],
  };
  let flowerStageThreeReturnStartPose: CameraPose = {
    position: [...FLOWER_CAMERA_POSE.position],
    target: [...FLOWER_CAMERA_POSE.target],
  };
  const flowerStageThreeWorkingPose: CameraPose = {
    position: [0, 0, 0],
    target: [0, 0, 0],
  };
  let flowerStageThreeProgress = 0;
  let flowerStageThreeMotion: FlowerStageThreeMotion = {
    phase: 'interactive',
    spreadProgress: 0,
    returnProgress: 0,
    returnStartProgress: 0,
  };
  let previousFlowerStageThreePhase: FlowerStageThreeMotion['phase'] =
    'interactive';

  function getFlowerCompositionPan() {
    const distance = camera.position.distanceTo(target);
    flowerCompositionForward
      .subVectors(target, camera.position)
      .normalize();
    flowerCompositionRight
      .crossVectors(flowerCompositionForward, camera.up)
      .normalize();
    flowerCompositionUp
      .crossVectors(flowerCompositionRight, flowerCompositionForward)
      .normalize();
    const verticalPanDistance =
      distance * FLOWER_COMPOSITION.verticalPanDistanceFraction;

    return flowerCompositionPan.set(0, 0, 0).addScaledVector(
      flowerCompositionUp,
      -verticalPanDistance,
    );
  }

  function applyFlowerCompositionPan() {
    getFlowerCompositionPan();
    camera.position.add(flowerCompositionPan);
    target.add(flowerCompositionPan);
  }

  function applyPose(pose: CameraPose, composeFlower = false) {
    camera.position.fromArray(pose.position);
    target.fromArray(pose.target);
    flowerCompositionPan.set(0, 0, 0);
    if (composeFlower) applyFlowerCompositionPan();
    camera.lookAt(target);
    camera.updateMatrixWorld();
  }

  function setFlowerIntroProgress(progress: number) {
    applyPose(
      sampleFlowerCameraIntroPose(progress, flowerIntroWorkingPose),
      true,
    );
  }

  function beginFlowerStageThree(returnPose: CameraPose) {
    flowerStageThreeStartPose = {
      position: camera.position.toArray() as CameraPose['position'],
      target: target.toArray() as CameraPose['target'],
    };
    flowerStageThreeReturnPose = {
      position: [...returnPose.position],
      target: [...returnPose.target],
    };
    flowerStageThreeReturnStartPose = {
      position: [...flowerStageThreeStartPose.position],
      target: [...flowerStageThreeStartPose.target],
    };
    flowerStageThreeTargetPose = sampleFlowerStageThreeTargetPose(
      camera.aspect,
    );
    previousFlowerStageThreePhase = 'entering';
  }

  function setFlowerStageThreeProgress(
    progress: number,
    motion: FlowerStageThreeMotion,
  ) {
    flowerStageThreeProgress = progress;
    flowerStageThreeMotion = motion;
    if (motion.phase === 'spreading') {
      previousFlowerStageThreePhase = motion.phase;
      return;
    }
    if (motion.phase === 'returning') {
      if (previousFlowerStageThreePhase !== 'returning') {
        flowerStageThreeReturnStartPose = {
          position: camera.position.toArray() as CameraPose['position'],
          target: target.toArray() as CameraPose['target'],
        };
      }
      const returnAmount = 1 - (1 - THREE.MathUtils.clamp(
        motion.returnProgress,
        0,
        1,
      )) ** 3;
      const returnStartPose = flowerStageThreeReturnStartPose;
      for (let index = 0; index < 3; index += 1) {
        flowerStageThreeWorkingPose.position[index] = THREE.MathUtils.lerp(
          returnStartPose.position[index],
          flowerStageThreeReturnPose.position[index],
          returnAmount,
        );
        flowerStageThreeWorkingPose.target[index] = THREE.MathUtils.lerp(
          returnStartPose.target[index],
          flowerStageThreeReturnPose.target[index],
          returnAmount,
        );
      }
      applyPose(flowerStageThreeWorkingPose);
      previousFlowerStageThreePhase = motion.phase;
      return;
    }
    if (motion.phase === 'interactive' || progress <= 0) {
      applyPose(flowerStageThreeReturnPose);
      previousFlowerStageThreePhase = motion.phase;
      return;
    }
    for (let index = 0; index < 3; index += 1) {
      flowerStageThreeWorkingPose.position[index] = THREE.MathUtils.lerp(
        flowerStageThreeStartPose.position[index],
        flowerStageThreeTargetPose.position[index],
        progress,
      );
      flowerStageThreeWorkingPose.target[index] = THREE.MathUtils.lerp(
        flowerStageThreeStartPose.target[index],
        flowerStageThreeTargetPose.target[index],
        progress,
      );
    }
    applyPose(flowerStageThreeWorkingPose);
    previousFlowerStageThreePhase = motion.phase;
  }

  function resize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.setFocalLength(FLOWER_CAMERA_FOCAL_LENGTH);
    renderer.setSize(window.innerWidth, window.innerHeight);

    if (previousFlowerStageThreePhase !== 'interactive') {
      flowerStageThreeTargetPose = sampleFlowerStageThreeTargetPose(
        camera.aspect,
      );
      setFlowerStageThreeProgress(
        flowerStageThreeProgress,
        flowerStageThreeMotion,
      );
      return flowerCompositionPanDelta.set(0, 0, 0);
    }

    previousFlowerCompositionPan.copy(flowerCompositionPan);
    camera.position.sub(previousFlowerCompositionPan);
    target.sub(previousFlowerCompositionPan);
    applyFlowerCompositionPan();
    camera.lookAt(target);
    camera.updateMatrixWorld();
    return flowerCompositionPanDelta
      .copy(flowerCompositionPan)
      .sub(previousFlowerCompositionPan);
  }

  return {
    camera,
    target,
    hemisphereLight,
    setFlowerIntroProgress,
    beginFlowerStageThree,
    setFlowerStageThreeProgress,
    resize,
  };
}
