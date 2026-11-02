// Standalone petal material lab: one petal per material variant, side by side.
// Open /petal-lab.html on the dev server.
import * as THREE from 'three/webgpu';
import {
  color,
  float,
  fwidth,
  mix,
  pass,
  smoothstep,
  time,
  uv,
} from 'three/tsl';
import { bloom } from 'three/examples/jsm/tsl/display/BloomNode.js';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { buildPetalGeometry, PETAL_DEFAULTS } from '../geometry/petal';
import {
  deformFlowerPetalPointWithSignedCurvinessAndWrinkle,
  ruffleFlatPetalPoint,
} from '../geometry/flower-mode';
import { createDeepBlueBackgroundNode } from '../rendering/renderer-lifecycle';

type GoldLines = {
  // Gold outline width in uv units, 0 disables it.
  edgeWidth: number;
  // Outline only above this root-to-tip position, fading in.
  edgeFrom: number;
  // Break the outline into twinkling gold flecks.
  edgeBroken: boolean;
  // Number of gold veins across the petal, 0 disables them.
  veinCount: number;
  veinWidth: number;
  // Veins run from the root and fade out by this root-to-tip position.
  veinEnd: number;
  // Overall presence of the gold, 1 = full metallic gold.
  intensity: number;
};

type PetalVariant = {
  title: string;
  note: string;
  baseColor: number;
  opacity: number;
  roughness: number;
  metalness: number;
  sheenColor: number;
  sheenRoughness: number;
  anisotropy: number;
  clearcoat: number;
  iridescence: number;
  gold: GoldLines;
};

const GOLD = {
  color: 0xe2ac4c,
  glowColor: 0xffcf78,
  glow: 1.0,
} as const;

// All variants share look D (cold silver-white satin); only the gold differs.
const SATIN_D = {
  baseColor: 0xe8edfb,
  opacity: 0.9,
  roughness: 0.18,
  metalness: 0.12,
  sheenColor: 0xffffff,
  sheenRoughness: 0.25,
  anisotropy: 0.92,
  clearcoat: 0.4,
  iridescence: 0.25,
} as const;

const VARIANTS: PetalVariant[] = [
  {
    ...SATIN_D,
    title: 'D1 发丝金边 · 根部金脉',
    note: '整圈发丝细金边，根部到中下部 6 条细金脉',
    gold: {
      edgeWidth: 0.005, edgeFrom: 0.06, edgeBroken: false,
      veinCount: 6, veinWidth: 0.003, veinEnd: 0.45, intensity: 0.95,
    },
  },
  {
    ...SATIN_D,
    title: 'D2 上半金边',
    note: '金边只在花瓣上半部，从中部渐显，没有金脉',
    gold: {
      edgeWidth: 0.0045, edgeFrom: 0.4, edgeBroken: false,
      veinCount: 0, veinWidth: 0, veinEnd: 0, intensity: 0.95,
    },
  },
  {
    ...SATIN_D,
    title: 'D3 只有根部金脉',
    note: '不描边，根部散出 7 条极细金脉，到中下部消失',
    gold: {
      edgeWidth: 0, edgeFrom: 0, edgeBroken: false,
      veinCount: 7, veinWidth: 0.0026, veinEnd: 0.4, intensity: 1,
    },
  },
  {
    ...SATIN_D,
    title: 'D4 细碎金边 · 短金脉',
    note: '极细断续金边微微闪烁，根部 4 条短金脉',
    gold: {
      edgeWidth: 0.0045, edgeFrom: 0.1, edgeBroken: true,
      veinCount: 4, veinWidth: 0.0028, veinEnd: 0.3, intensity: 0.95,
    },
  },
];

function createLabPetalGeometry(phase: number, curviness: number) {
  const geometry = buildPetalGeometry({
    ...PETAL_DEFAULTS,
    subdivisionsX: 48,
    subdivisionsY: 48,
  });
  const position = geometry.getAttribute('position');
  const uvAttribute = geometry.getAttribute('uv');
  const shape = geometry.getAttribute('petalShapeU');
  const point = new THREE.Vector3();
  for (let vertex = 0; vertex < position.count; vertex += 1) {
    point.fromBufferAttribute(position, vertex);
    const shapeU = shape.getX(vertex);
    const rootToTip = uvAttribute.getY(vertex);
    const deformed = deformFlowerPetalPointWithSignedCurvinessAndWrinkle(
      ruffleFlatPetalPoint(point, shapeU, rootToTip, phase),
      uvAttribute.getX(vertex),
      shapeU,
      rootToTip,
      phase,
      curviness,
      9,
      0.1,
      4,
      0.28,
    );
    position.setXYZ(vertex, deformed.x, deformed.y, deformed.z);
  }
  geometry.translate(0, -PETAL_DEFAULTS.height * 0.5, 0);
  geometry.computeVertexNormals();
  geometry.computeTangents();
  geometry.computeBoundingSphere();
  return geometry;
}

// Anti-aliased line mask: 1 inside `width` of the zero distance, 0 outside.
function lineMask(distance: any, width: number) {
  const aa = (fwidth as any)(distance).mul(1.2);
  return (smoothstep as any)(float(width), aa.add(width), distance).oneMinus();
}

function createGoldLineNode(gold: GoldLines) {
  const petalUv: any = uv();
  const u = petalUv.x;
  const v = petalUv.y;
  let mask: any = float(0);
  if (gold.edgeWidth > 0) {
    const edgeDistance = u.min(u.oneMinus()).min(v.oneMinus().mul(0.9));
    let edge = lineMask(edgeDistance, gold.edgeWidth).mul(
      (smoothstep as any)(gold.edgeFrom, gold.edgeFrom + 0.12, v),
    );
    if (gold.edgeBroken) {
      const cell = v.add(u.mul(0.35)).mul(140).floor();
      const hash = cell.mul(12.9898).sin().mul(43758.5453).fract();
      const twinkle = (time as any)
        .mul(2.2)
        .add(hash.mul(25))
        .sin()
        .mul(0.5)
        .add(0.5);
      edge = edge
        .mul((smoothstep as any)(0.35, 0.45, hash))
        .mul(twinkle.mul(0.6).add(0.4));
    }
    mask = mask.max(edge);
  }
  if (gold.veinCount > 0) {
    // Veins fan out from the root and fade before the middle of the petal.
    const coordinate = u
      .mul(gold.veinCount)
      .add(v.mul(5).add(u.mul(11)).sin().mul(0.08));
    const veinDistance = coordinate
      .add(0.5)
      .fract()
      .sub(0.5)
      .abs()
      .div(gold.veinCount);
    const along = (smoothstep as any)(0.01, 0.05, v).mul(
      (smoothstep as any)(gold.veinEnd * 0.45, gold.veinEnd, v).oneMinus(),
    );
    const inside = (smoothstep as any)(0.03, 0.08, u.min(u.oneMinus()));
    const taperedWidth = float(gold.veinWidth).mul(
      v.div(gold.veinEnd).clamp(0, 1).mul(-0.6).add(1),
    );
    const vein = (smoothstep as any)(
      taperedWidth,
      (fwidth as any)(veinDistance).mul(1.2).add(taperedWidth),
      veinDistance,
    )
      .oneMinus()
      .mul(along)
      .mul(inside);
    mask = mask.max(vein);
  }
  return mask.mul(gold.intensity);
}

function createPetalMaterial(variant: PetalVariant) {
  const material = new THREE.MeshPhysicalNodeMaterial({
    color: variant.baseColor,
    roughness: variant.roughness,
    metalness: variant.metalness,
    sheen: 0.6,
    sheenColor: new THREE.Color(variant.sheenColor),
    sheenRoughness: variant.sheenRoughness,
    anisotropy: variant.anisotropy,
    clearcoat: variant.clearcoat,
    clearcoatRoughness: 0.25,
    iridescence: variant.iridescence,
    iridescenceIOR: 1.35,
    iridescenceThicknessRange: [180, 520],
    transparent: true,
    opacity: variant.opacity,
    side: THREE.DoubleSide,
  });
  const goldMask = createGoldLineNode(variant.gold);
  const petalUv: any = uv();
  // Warm light from the flower heart at the root, as on the main flower.
  const heart = color(0xffe2a8).mul(petalUv.y.oneMinus().pow(3).mul(0.12));
  // Base albedo kept below pure white so highlights and gold lines can read.
  material.colorNode = (mix as any)(
    color(variant.baseColor).mul(0.78),
    color(GOLD.color),
    goldMask,
  );
  material.metalnessNode = (mix as any)(
    float(variant.metalness),
    float(0.85),
    goldMask,
  );
  material.roughnessNode = (mix as any)(
    float(variant.roughness),
    float(0.22),
    goldMask,
  );
  material.emissiveNode = color(GOLD.glowColor)
    .mul(goldMask.mul(GOLD.glow))
    .add(heart);
  material.opacityNode = (mix as any)(float(variant.opacity), float(1), goldMask);
  return material;
}

async function startPetalLab() {
  const host = document.querySelector<HTMLElement>('#lab')!;
  const renderer = new THREE.WebGPURenderer({ antialias: true });
  await renderer.init();
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.85;
  host.append(renderer.domElement);

  const scene = new THREE.Scene();
  scene.backgroundNode = createDeepBlueBackgroundNode();
  const camera = new THREE.PerspectiveCamera(
    32,
    window.innerWidth / window.innerHeight,
    0.1,
    50,
  );
  camera.position.set(0, 0.15, 8.2);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;

  scene.add(new THREE.HemisphereLight(0xe2ebff, 0x2a4aa8, 1.2));
  // Soft studio reflections give the satin its sliding sheen.
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.16;
  const key = new THREE.DirectionalLight(0xfff4e6, 1.5);
  key.position.set(-2.5, 3, 4);
  const rim = new THREE.DirectionalLight(0xd6dcff, 3.2);
  rim.position.set(1.5, 2.5, -4);
  scene.add(key, rim);

  const spacing = 1.6;
  const petals = VARIANTS.map((variant, index) => {
    const geometry = createLabPetalGeometry(index * 2.3 + 1.1, 0.42);
    const mesh = new THREE.Mesh(geometry, createPetalMaterial(variant));
    mesh.scale.setScalar(0.72);
    mesh.position.x = (index - (VARIANTS.length - 1) / 2) * spacing;
    mesh.rotation.x = -0.35;
    scene.add(mesh);
    return mesh;
  });

  const labels = document.querySelector<HTMLElement>('[data-lab-labels]')!;
  labels.replaceChildren(
    ...VARIANTS.map((variant) => {
      const label = document.createElement('div');
      label.textContent = variant.title;
      const note = document.createElement('small');
      note.textContent = variant.note;
      label.append(note);
      return label;
    }),
  );

  const pipeline = new THREE.RenderPipeline(renderer);
  const scenePass = pass(scene, camera);
  const sceneColor = scenePass.getTextureNode('output');
  pipeline.outputNode = sceneColor.add(bloom(sceneColor, 0.4, 0.3, 0.95));

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  renderer.setAnimationLoop((timestamp) => {
    const seconds = timestamp / 1000;
    // Slow sway so the satin highlight slides across each petal.
    petals.forEach((mesh, index) => {
      mesh.rotation.y = Math.sin(seconds * 0.45 + index * 0.9) * 0.55;
    });
    controls.update();
    pipeline.render();
  });
}

void startPetalLab();
