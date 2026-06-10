const TAU = Math.PI * 2;

const PCFSoftShadowMap = "PCFSoftShadowMap";

class Vector2 {
  constructor(x = 0, y = 0) {
    this.x = x;
    this.y = y;
  }
}

class Vector3 {
  constructor(x = 0, y = 0, z = 0) {
    this.x = x;
    this.y = y;
    this.z = z;
  }

  set(x, y, z) {
    this.x = x;
    this.y = y;
    this.z = z;
    return this;
  }

  copy(v) {
    this.x = v.x;
    this.y = v.y;
    this.z = v.z;
    return this;
  }

  clone() {
    return new Vector3(this.x, this.y, this.z);
  }

  add(v) {
    this.x += v.x;
    this.y += v.y;
    this.z += v.z;
    return this;
  }

  sub(v) {
    this.x -= v.x;
    this.y -= v.y;
    this.z -= v.z;
    return this;
  }

  addScaledVector(v, scale) {
    this.x += v.x * scale;
    this.y += v.y * scale;
    this.z += v.z * scale;
    return this;
  }

  multiplyScalar(scale) {
    this.x *= scale;
    this.y *= scale;
    this.z *= scale;
    return this;
  }

  distanceTo(v) {
    return Math.hypot(this.x - v.x, this.y - v.y, this.z - v.z);
  }

  length() {
    return Math.hypot(this.x, this.y, this.z);
  }

  normalize() {
    const length = this.length() || 1;
    return this.multiplyScalar(1 / length);
  }

  dot(v) {
    return this.x * v.x + this.y * v.y + this.z * v.z;
  }

  reflect(normal) {
    const scale = 2 * this.dot(normal);
    this.x -= scale * normal.x;
    this.y -= scale * normal.y;
    this.z -= scale * normal.z;
    return this;
  }

  lerp(v, t) {
    this.x += (v.x - this.x) * t;
    this.y += (v.y - this.y) * t;
    this.z += (v.z - this.z) * t;
    return this;
  }

  applyAxisAngle(axis, angle) {
    if (Math.abs(axis.y) < 0.9) return this;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const x = this.x * cos - this.z * sin;
    const z = this.x * sin + this.z * cos;
    this.x = x;
    this.z = z;
    return this;
  }
}

class Matrix4 {
  constructor() {
    this.position = new Vector3();
  }

  makeTranslation(x, y, z) {
    this.position.set(x, y, z);
    return this;
  }
}

class Color {
  constructor(hex = 0x000000) {
    this.hex = hex;
  }
}

class Fog {
  constructor(color, near, far) {
    this.color = color;
    this.near = near;
    this.far = far;
  }
}

class Object3D {
  constructor() {
    this.position = new Vector3();
    this.rotation = { x: 0, y: 0, z: 0 };
    this.children = [];
    this.parent = null;
    this.visible = true;
    this.castShadow = false;
    this.receiveShadow = false;
  }

  add(child) {
    child.parent = this;
    this.children.push(child);
    return this;
  }

  remove(child) {
    const index = this.children.indexOf(child);
    if (index >= 0) {
      child.parent = null;
      this.children.splice(index, 1);
    }
    return this;
  }

  traverse(callback) {
    callback(this);
    this.children.forEach((child) => child.traverse(callback));
  }

  getWorldRotationY() {
    return (this.parent?.getWorldRotationY?.() ?? 0) + this.rotation.y;
  }

  getWorldPosition(target = new Vector3()) {
    target.copy(this.position);
    let node = this.parent;
    let child = this;
    while (node) {
      target.applyAxisAngle(new Vector3(0, 1, 0), node.rotation.y);
      target.add(node.position);
      child = node;
      node = child.parent;
    }
    return target;
  }

  localToWorld(vector) {
    vector.applyAxisAngle(new Vector3(0, 1, 0), this.getWorldRotationY());
    vector.add(this.getWorldPosition(new Vector3()));
    return vector;
  }

  worldToLocal(vector) {
    vector.sub(this.getWorldPosition(new Vector3()));
    vector.applyAxisAngle(new Vector3(0, 1, 0), -this.getWorldRotationY());
    return vector;
  }
}

class Group extends Object3D {}

class Scene extends Object3D {
  constructor() {
    super();
    this.background = new Color(0x111111);
  }
}

class PerspectiveCamera extends Object3D {
  constructor(fov, aspect, near, far) {
    super();
    this.fov = fov;
    this.aspect = aspect;
    this.near = near;
    this.far = far;
    this.isCamera = true;
    this.lookTarget = new Vector3();
  }

  updateProjectionMatrix() {}

  lookAt(target) {
    this.lookTarget.copy(target);
  }
}

class HemisphereLight extends Object3D {
  constructor() {
    super();
    this.isLight = true;
  }
}

class DirectionalLight extends Object3D {
  constructor() {
    super();
    this.isLight = true;
    this.shadow = {
      mapSize: { set() {} },
      camera: {},
    };
  }
}

class BoxGeometry {
  constructor(width, height, depth) {
    this.type = "box";
    this.width = width;
    this.height = height;
    this.depth = depth;
  }
}

class CylinderGeometry {
  constructor(radiusTop, radiusBottom, height, radialSegments = 12) {
    this.type = "cylinder";
    this.radiusTop = radiusTop;
    this.radiusBottom = radiusBottom;
    this.height = height;
    this.radialSegments = radialSegments;
  }
}

class SphereGeometry {
  constructor(radius) {
    this.type = "sphere";
    this.radius = radius;
  }
}

class MeshStandardMaterial {
  constructor(options = {}) {
    this.color = options.color ?? 0xffffff;
    this.roughness = options.roughness ?? 0.5;
    this.metalness = options.metalness ?? 0;
    this.opacity = options.opacity ?? 1;
    this.transparent = options.transparent ?? false;
  }
}

class Mesh extends Object3D {
  constructor(geometry, material) {
    super();
    this.geometry = geometry;
    this.material = material;
    this.isMesh = true;
  }
}

class InstancedMesh extends Mesh {
  constructor(geometry, material, count) {
    super(geometry, material);
    this.count = count;
    this.instances = Array.from({ length: count }, () => new Vector3());
    this.instanceMatrix = { needsUpdate: false };
    this.isInstancedMesh = true;
  }

  setMatrixAt(index, matrix) {
    this.instances[index] = matrix.position.clone();
  }
}

class GridHelper extends Object3D {
  constructor(size, divisions, colorCenterLine, colorGrid) {
    super();
    this.size = size;
    this.divisions = divisions;
    this.colorGrid = colorGrid;
    this.material = { opacity: 1, transparent: false };
    this.isGridHelper = true;
  }
}

class Plane {
  constructor(normal = new Vector3(0, 1, 0), constant = 0) {
    this.normal = normal;
    this.constant = constant;
  }
}

class Raycaster {
  constructor() {
    this.ray = {
      origin: new Vector3(),
      direction: new Vector3(0, -1, 0),
      intersectPlane: (_plane, target) => {
        target.copy(this.groundPoint ?? new Vector3());
        return target;
      },
    };
  }

  setFromCamera(pointer, camera) {
    const target = camera.lookTarget ?? new Vector3();
    const range = Math.max(18, camera.position.y * 0.92);
    this.groundPoint = new Vector3(
      target.x + pointer.x * range * camera.aspect,
      0,
      target.z - pointer.y * range,
    );
  }
}

class Clock {
  constructor() {
    this.last = performance.now();
  }

  getDelta() {
    const now = performance.now();
    const delta = (now - this.last) / 1000;
    this.last = now;
    return delta;
  }
}

class WebGLRenderer {
  constructor({ canvas, antialias = true }) {
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d", { alpha: false });
    this.antialias = antialias;
    this.pixelRatio = 1;
    this.width = canvas.clientWidth || window.innerWidth;
    this.height = canvas.clientHeight || window.innerHeight;
    this.shadowMap = { enabled: false, type: null };
  }

  setPixelRatio(pixelRatio) {
    this.pixelRatio = pixelRatio || 1;
  }

  setSize(width, height) {
    this.width = width;
    this.height = height;
    this.canvas.width = Math.floor(width * this.pixelRatio);
    this.canvas.height = Math.floor(height * this.pixelRatio);
    this.canvas.style.width = `${width}px`;
    this.canvas.style.height = `${height}px`;
    this.ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
  }

  render(scene, camera) {
    const ctx = this.ctx;
    ctx.save();
    ctx.setTransform(this.pixelRatio, 0, 0, this.pixelRatio, 0, 0);
    ctx.clearRect(0, 0, this.width, this.height);
    drawSky(ctx, this.width, this.height);
    drawVignette(ctx, this.width, this.height);

    const projector = makeProjector(camera, this.width, this.height);
    const items = [];
    collectSceneItems(items, scene, projector);
    items.sort((a, b) => b.depth - a.depth);
    items.forEach((item) => item.draw(ctx));
    drawFilmGrain(ctx, this.width, this.height);
    ctx.restore();
  }
}

function collectSceneItems(items, object, projector) {
  if (!object.visible) return;
  if (object.isGridHelper) pushGrid(items, object, projector);
  if (object.isInstancedMesh) pushInstances(items, object, projector);
  if (object.isMesh && !object.isInstancedMesh) pushMesh(items, object, projector);
  object.children.forEach((child) => collectSceneItems(items, child, projector));
}

function pushGrid(items, grid, projector) {
  const half = grid.size / 2;
  const step = grid.size / grid.divisions;
  for (let i = 0; i <= grid.divisions; i++) {
    const p = -half + i * step;
    pushLine(items, projector, new Vector3(-half, 0.02, p), new Vector3(half, 0.02, p), grid.colorGrid, grid.material.opacity);
    pushLine(items, projector, new Vector3(p, 0.02, -half), new Vector3(p, 0.02, half), grid.colorGrid, grid.material.opacity);
  }
}

function pushInstances(items, mesh, projector) {
  mesh.instances.filter(Boolean).forEach((pos) => {
    pushBox(items, projector, pos, 0, mesh.geometry, mesh.material.color);
  });
}

function pushMesh(items, mesh, projector) {
  const pos = mesh.getWorldPosition(new Vector3());
  const rot = mesh.getWorldRotationY();
  if (mesh.geometry.type === "box") {
    pushBox(items, projector, pos, rot, mesh.geometry, mesh.material.color);
  } else if (mesh.geometry.type === "cylinder") {
    const radius = Math.max(mesh.geometry.radiusTop, mesh.geometry.radiusBottom);
    pushBox(items, projector, pos, rot, new BoxGeometry(radius * 1.8, mesh.geometry.height, radius * 1.8), mesh.material.color);
  } else if (mesh.geometry.type === "sphere") {
    pushSphere(items, projector, pos, mesh.geometry.radius, mesh.material.color);
  }
}

function makeProjector(camera, width, height) {
  const forward = camera.lookTarget.clone().sub(camera.position).normalize();
  const right = new Vector3(-forward.z, 0, forward.x).normalize();
  const up = cross(right, forward).normalize();
  const focalLength = height / (2 * Math.tan(((camera.fov || 50) * Math.PI) / 360));

  return {
    point(world) {
      const rel = world.clone().sub(camera.position);
      const x = rel.dot(right);
      const y = rel.dot(up);
      const z = rel.dot(forward);
      if (z <= 0.18) return null;
      return {
        x: width / 2 + (x * focalLength) / z,
        y: height / 2 - (y * focalLength) / z,
        z,
      };
    },
  };
}

function pushBox(items, projector, center, yaw, geometry, color) {
  const hx = geometry.width / 2;
  const hy = geometry.height / 2;
  const hz = geometry.depth / 2;
  const local = [
    new Vector3(-hx, -hy, -hz),
    new Vector3(hx, -hy, -hz),
    new Vector3(hx, hy, -hz),
    new Vector3(-hx, hy, -hz),
    new Vector3(-hx, -hy, hz),
    new Vector3(hx, -hy, hz),
    new Vector3(hx, hy, hz),
    new Vector3(-hx, hy, hz),
  ];
  const world = local.map((point) => point.applyAxisAngle(new Vector3(0, 1, 0), yaw).add(center));
  const faces = [
    { indexes: [0, 1, 2, 3], shade: 0.92 },
    { indexes: [5, 4, 7, 6], shade: 0.74 },
    { indexes: [4, 0, 3, 7], shade: 0.82 },
    { indexes: [1, 5, 6, 2], shade: 0.88 },
    { indexes: [3, 2, 6, 7], shade: 1.1 },
    { indexes: [4, 5, 1, 0], shade: 0.58 },
  ];

  faces.forEach((face) => {
    const projected = face.indexes.map((index) => projector.point(world[index]));
    if (projected.some((point) => !point)) return;
    const depth = projected.reduce((sum, point) => sum + point.z, 0) / projected.length;
    items.push({
      depth,
      draw(ctx) {
        ctx.save();
        ctx.fillStyle = shadeColor(color, face.shade);
        ctx.strokeStyle = "rgba(255,255,255,0.13)";
        ctx.lineWidth = 1;
        drawPath(ctx, projected);
        ctx.fill();
        drawConcreteFace(ctx, projected, depth, face.shade);
        ctx.stroke();
        ctx.restore();
      },
    });
  });
}

function pushSphere(items, projector, center, radius, color) {
  const projected = projector.point(center);
  if (!projected) return;
  const screenRadius = Math.max(2, radius * 420 / projected.z);
  items.push({
    depth: projected.z,
    draw(ctx) {
      ctx.save();
      ctx.fillStyle = shadeColor(color, 1.08);
      ctx.shadowColor = "rgba(242,200,96,0.9)";
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(projected.x, projected.y, screenRadius, 0, TAU);
      ctx.fill();
      ctx.restore();
    },
  });
}

function pushLine(items, projector, from, to, color, alpha = 1) {
  const a = projector.point(from);
  const b = projector.point(to);
  if (!a || !b) return;
  items.push({
    depth: (a.z + b.z) / 2,
    draw(ctx) {
      ctx.save();
      ctx.globalAlpha = alpha ?? 1;
      ctx.strokeStyle = toCss(color ?? 0x455147);
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.lineTo(b.x, b.y);
      ctx.stroke();
      ctx.restore();
    },
  });
}

function drawPath(ctx, points) {
  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.closePath();
}

function cross(a, b) {
  return new Vector3(
    a.y * b.z - a.z * b.y,
    a.z * b.x - a.x * b.z,
    a.x * b.y - a.y * b.x,
  );
}

function drawSky(ctx, width, height) {
  const sky = ctx.createLinearGradient(0, 0, 0, height);
  sky.addColorStop(0, "#d9f3ff");
  sky.addColorStop(0.42, "#7fa3b9");
  sky.addColorStop(0.45, "#41596b");
  sky.addColorStop(0.46, "#26323a");
  sky.addColorStop(1, "#121820");
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);
}

function drawConcreteFace(ctx, points, depth, shade) {
  const minX = Math.max(0, Math.floor(Math.min(...points.map((point) => point.x))));
  const maxX = Math.ceil(Math.max(...points.map((point) => point.x)));
  const minY = Math.max(0, Math.floor(Math.min(...points.map((point) => point.y))));
  const maxY = Math.ceil(Math.max(...points.map((point) => point.y)));
  const width = maxX - minX;
  const height = maxY - minY;
  if (width < 8 || height < 8 || depth > 48) return;

  ctx.save();
  drawPath(ctx, points);
  ctx.clip();
  ctx.globalAlpha = Math.max(0.035, Math.min(0.16, 0.2 - depth * 0.0017));
  ctx.strokeStyle = shade > 1 ? "#dff6ff" : "#10202a";
  ctx.lineWidth = 1;
  const spacing = Math.max(14, Math.min(34, 260 / Math.max(depth, 4)));
  for (let x = minX + ((depth * 7) % spacing); x < maxX; x += spacing) {
    ctx.beginPath();
    ctx.moveTo(x, minY);
    ctx.lineTo(x + height * 0.12, maxY);
    ctx.stroke();
  }
  for (let y = minY + spacing * 0.5; y < maxY; y += spacing * 1.35) {
    ctx.beginPath();
    ctx.moveTo(minX, y);
    ctx.lineTo(maxX, y + width * 0.025);
    ctx.stroke();
  }
  ctx.restore();
}

function drawFilmGrain(ctx, width, height) {
  ctx.save();
  ctx.globalAlpha = 0.018;
  ctx.fillStyle = "#fff";
  const step = 7;
  for (let y = 0; y < height; y += step) {
    for (let x = (y % 14) / 2; x < width; x += step * 2) {
      if (((x * 13 + y * 17) % 23) < 7) ctx.fillRect(x, y, 1, 1);
    }
  }
  ctx.restore();
}

function drawVignette(ctx, width, height) {
  const gradient = ctx.createRadialGradient(width / 2, height / 2, 0, width / 2, height / 2, Math.max(width, height) * 0.62);
  gradient.addColorStop(0, "rgba(255,255,255,0.02)");
  gradient.addColorStop(1, "rgba(0,0,0,0.32)");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
}

function toCss(hex) {
  const value = typeof hex === "number" ? hex : hex?.hex ?? 0xffffff;
  return `#${value.toString(16).padStart(6, "0")}`;
}

function shadeColor(hex, factor) {
  const value = typeof hex === "number" ? hex : hex?.hex ?? 0xffffff;
  const r = Math.max(0, Math.min(255, Math.round(((value >> 16) & 255) * factor)));
  const g = Math.max(0, Math.min(255, Math.round(((value >> 8) & 255) * factor)));
  const b = Math.max(0, Math.min(255, Math.round((value & 255) * factor)));
  return `rgb(${r} ${g} ${b})`;
}

window.THREE_LITE = {
  PCFSoftShadowMap,
  Vector2,
  Vector3,
  Matrix4,
  Color,
  Fog,
  Group,
  Scene,
  PerspectiveCamera,
  HemisphereLight,
  DirectionalLight,
  BoxGeometry,
  CylinderGeometry,
  SphereGeometry,
  MeshStandardMaterial,
  Mesh,
  InstancedMesh,
  GridHelper,
  Plane,
  Raycaster,
  Clock,
  WebGLRenderer,
};
