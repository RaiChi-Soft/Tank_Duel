const THREE = window.THREE_LITE;
const CONFIG = window.GAME_CONFIG;
const AgentBridgeClass = window.AgentBridge;
const UI = window.current_ui;

const GameState = {
  MENU: "MENU",
  GENERATING_MAP: "GENERATING_MAP",
  GAMEPLAY: "GAMEPLAY",
  ROUND_OVER: "ROUND_OVER",
};

const CELL_SIZE = CONFIG.maze.cellSize;
const HALF_CELL = CELL_SIZE / 2;
const PLAYER_ID = "player";
const ENEMY_ID = "enemy";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const forwardFromYaw = (yaw) => new THREE.Vector3(Math.sin(yaw), 0, -Math.cos(yaw));
const rightFromYaw = (yaw) => new THREE.Vector3(Math.cos(yaw), 0, Math.sin(yaw));
const lerpAngle = (from, to, t) => {
  let delta = ((to - from + Math.PI) % (Math.PI * 2)) - Math.PI;
  if (delta < -Math.PI) delta += Math.PI * 2;
  return from + delta * clamp(t, 0, 1);
};

class EventBus extends EventTarget {
  emit(type, detail = {}) {
    this.dispatchEvent(new CustomEvent(type, { detail }));
  }
}

class MazeGenerator {
  constructor(width = 19, height = 19, config = CONFIG.maze) {
    this.width = width % 2 === 0 ? width + 1 : width;
    this.height = height % 2 === 0 ? height + 1 : height;
    this.config = config;
    this.grid = [];
  }

  generate() {
    if (!this.config.generateMaze) return this.generateArena();

    this.grid = Array.from({ length: this.height }, () =>
      Array.from({ length: this.width }, () => 1),
    );
    const stack = [[1, 1]];
    this.grid[1][1] = 0;

    while (stack.length) {
      const [x, y] = stack[stack.length - 1];
      const neighbors = [
        [x + 2, y, 1, 0],
        [x - 2, y, -1, 0],
        [x, y + 2, 0, 1],
        [x, y - 2, 0, -1],
      ].filter(([nx, ny]) => this.inBounds(nx, ny) && this.grid[ny][nx] === 1);

      if (!neighbors.length) {
        stack.pop();
        continue;
      }

      const [nx, ny, wx, wy] = neighbors[Math.floor(Math.random() * neighbors.length)];
      this.grid[y + wy][x + wx] = 0;
      this.grid[ny][nx] = 0;
      stack.push([nx, ny]);
    }

    this.addLoops(this.config.loopChance);
    return this.grid;
  }

  generateArena() {
    this.grid = Array.from({ length: this.height }, (_row, y) =>
      Array.from({ length: this.width }, (_cell, x) =>
        x === 0 || y === 0 || x === this.width - 1 || y === this.height - 1 ? 1 : 0,
      ),
    );

    const coverCount = Math.max(2, Math.floor((this.width * this.height) / 52));
    for (let i = 0; i < coverCount; i++) {
      const x = 2 + Math.floor(Math.random() * Math.max(1, this.width - 4));
      const y = 2 + Math.floor(Math.random() * Math.max(1, this.height - 4));
      if ((x <= 3 && y <= 3) || (x >= this.width - 4 && y >= this.height - 4)) continue;
      this.grid[y][x] = 1;
    }
    return this.grid;
  }

  addLoops(chance) {
    for (let y = 2; y < this.height - 2; y += 2) {
      for (let x = 2; x < this.width - 2; x += 2) {
        if (Math.random() < chance) this.grid[y][x] = 0;
      }
    }
  }

  inBounds(x, y) {
    return x > 0 && y > 0 && x < this.width - 1 && y < this.height - 1;
  }

  cellToWorld(x, y) {
    return new THREE.Vector3(
      (x - this.width / 2) * CELL_SIZE + HALF_CELL,
      0,
      (y - this.height / 2) * CELL_SIZE + HALF_CELL,
    );
  }

  worldToCell(position) {
    return {
      x: Math.floor(position.x / CELL_SIZE + this.width / 2),
      y: Math.floor(position.z / CELL_SIZE + this.height / 2),
    };
  }

  isWallCell(x, y) {
    if (x < 0 || y < 0 || x >= this.width || y >= this.height) return true;
    return this.grid[y][x] === 1;
  }

  isWorldBlocked(position, radius = 0.1) {
    const probes = [
      [position.x, position.z],
      [position.x + radius, position.z],
      [position.x - radius, position.z],
      [position.x, position.z + radius],
      [position.x, position.z - radius],
    ];
    return probes.some(([x, z]) => this.isWallCell(
      Math.floor(x / CELL_SIZE + this.width / 2),
      Math.floor(z / CELL_SIZE + this.height / 2),
    ));
  }

  randomOpenCell(minDistanceFrom = null) {
    const open = [];
    const fallback = [];
    for (let y = 1; y < this.height - 1; y++) {
      for (let x = 1; x < this.width - 1; x++) {
        if (this.grid[y][x] === 0) {
          const candidate = this.cellToWorld(x, y);
          fallback.push({ x, y, position: candidate });
          const minDistance = CELL_SIZE * this.config.spawnMinDistanceCells;
          if (!minDistanceFrom || candidate.distanceTo(minDistanceFrom) > minDistance) {
            open.push({ x, y, position: candidate });
          }
        }
      }
    }
    const choices = open.length ? open : fallback;
    return choices[Math.floor(Math.random() * choices.length)];
  }

  buildWalls() {
    const wallCount = this.grid.flat().filter((cell) => cell === 1).length;
    const geometry = new THREE.BoxGeometry(CELL_SIZE, CONFIG.presentation.wallHeight, CELL_SIZE);
    const material = new THREE.MeshStandardMaterial({
      color: 0x6f8596,
      roughness: 0.78,
      metalness: 0.05,
    });
    const mesh = new THREE.InstancedMesh(geometry, material, wallCount);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    const matrix = new THREE.Matrix4();
    let index = 0;

    this.grid.forEach((row, y) => {
      row.forEach((cell, x) => {
        if (cell !== 1) return;
        const pos = this.cellToWorld(x, y);
        matrix.makeTranslation(pos.x, CONFIG.presentation.wallHeight / 2, pos.z);
        mesh.setMatrixAt(index, matrix);
        index += 1;
      });
    });

    mesh.instanceMatrix.needsUpdate = true;
    return mesh;
  }
}

class TankEntity {
  constructor({ id, color, accent, scene, position, speed = CONFIG.tank.playerSpeed }) {
    this.id = id;
    this.maxHp = CONFIG.tank.maxHp;
    this.hp = this.maxHp;
    this.radius = CONFIG.tank.radius;
    this.speed = speed;
    this.rotationSpeed = CONFIG.tank.rotationSpeed;
    this.cooldown = 0;
    this.fireInterval = CONFIG.tank.fireInterval;
    this.invulnerableTimer = CONFIG.tank.spawnInvulnerableSeconds;
    this.alive = true;
    this.lastCollision = false;
    this.input = { throttle: 0, turn: 0, move: new THREE.Vector3() };
    this.group = new THREE.Group();
    this.group.position.copy(position);
    this.group.rotation.y = Math.random() * Math.PI * 2;

    const bodyGeometry = new THREE.BoxGeometry(2.2, 0.8, 2.8);
    const bodyMaterial = new THREE.MeshStandardMaterial({ color, roughness: 0.55, metalness: 0.16 });
    this.body = new THREE.Mesh(bodyGeometry, bodyMaterial);
    this.body.position.y = 0.55;
    this.body.castShadow = true;
    this.body.receiveShadow = true;
    this.group.add(this.body);

    const treadGeometry = new THREE.BoxGeometry(0.46, 0.46, 3.06);
    const treadMaterial = new THREE.MeshStandardMaterial({ color: 0x242827, roughness: 0.7 });
    [-1.28, 1.28].forEach((x) => {
      const tread = new THREE.Mesh(treadGeometry, treadMaterial);
      tread.position.set(x, 0.38, 0);
      tread.castShadow = true;
      this.group.add(tread);
    });

    this.turret = new THREE.Group();
    this.turret.position.y = 1.13;
    this.group.add(this.turret);

    const turretMesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.82, 0.92, 0.56, 8),
      new THREE.MeshStandardMaterial({ color: accent, roughness: 0.48, metalness: 0.18 }),
    );
    turretMesh.castShadow = true;
    this.turret.add(turretMesh);

    this.barrel = new THREE.Group();
    this.barrel.position.set(0, 0.08, -0.58);
    this.turret.add(this.barrel);

    const barrelMesh = new THREE.Mesh(
      new THREE.BoxGeometry(0.28, 0.28, 2.3),
      new THREE.MeshStandardMaterial({ color: 0x222928, roughness: 0.45, metalness: 0.25 }),
    );
    barrelMesh.position.z = -1.04;
    barrelMesh.castShadow = true;
    this.barrel.add(barrelMesh);

    const flag = new THREE.Mesh(
      new THREE.BoxGeometry(0.16, 1.3, 0.16),
      new THREE.MeshStandardMaterial({ color: accent }),
    );
    flag.position.set(0, 1.1, 0.8);
    this.group.add(flag);

    scene.add(this.group);
  }

  faceWorldPoint(worldPoint) {
    const delta = worldPoint.clone().sub(this.group.position);
    delta.y = 0;
    if (delta.length() <= 0.001) return;
    this.group.rotation.y = Math.atan2(delta.x, -delta.z);
    this.turret.rotation.y = 0;
  }

  drive(throttle, turn) {
    this.input.throttle = clamp(throttle, -1, 1);
    this.input.turn = clamp(turn, -1, 1);
    this.input.move.set(0, 0, 0);
  }

  moveWorld(direction) {
    this.input.throttle = 0;
    this.input.turn = 0;
    this.input.move.copy(direction);
  }

  rotateTurretTo(worldTarget, dt) {
    const localTarget = this.group.worldToLocal(worldTarget.clone());
    const targetAngle = Math.atan2(localTarget.x, -localTarget.z);
    this.turret.rotation.y = lerpAngle(this.turret.rotation.y, targetAngle, dt * 9);
  }

  rotateTurretToYaw(worldYaw, dt, instant = false) {
    const targetAngle = ((worldYaw - this.group.rotation.y + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    this.turret.rotation.y = instant ? targetAngle : lerpAngle(this.turret.rotation.y, targetAngle, dt * 16);
  }

  fire(projectiles, ownerTarget, yawOverride = null) {
    if (!this.alive || this.cooldown > 0) return false;
    this.cooldown = this.fireInterval;

    const yaw = typeof yawOverride === "number" ? yawOverride : this.group.rotation.y + this.turret.rotation.y;
    const direction = forwardFromYaw(yaw).normalize();
    const muzzle = this.group.position
      .clone()
      .addScaledVector(direction, 2.05)
      .add(new THREE.Vector3(0, 1.23, 0));
    projectiles.spawn(this.id, muzzle, direction, ownerTarget);
    return true;
  }

  update(dt, maze) {
    if (!this.alive) return;
    this.lastCollision = false;
    this.cooldown = Math.max(0, this.cooldown - dt);
    this.invulnerableTimer = Math.max(0, this.invulnerableTimer - dt);

    let desiredMove = this.input.move.clone();
    if (desiredMove.length() > 0.001) {
      desiredMove.normalize();
      const desiredYaw = Math.atan2(desiredMove.x, -desiredMove.z);
      this.group.rotation.y = lerpAngle(this.group.rotation.y, desiredYaw, dt * 10);
    } else {
      this.group.rotation.y += this.input.turn * this.rotationSpeed * dt;
      desiredMove = forwardFromYaw(this.group.rotation.y).multiplyScalar(this.input.throttle);
    }

    const next = this.group.position.clone().addScaledVector(desiredMove, this.speed * dt);

    if (!maze.isWorldBlocked(next, this.radius)) {
      this.group.position.copy(next);
    } else {
      this.lastCollision = Math.abs(this.input.throttle) > 0.1 || Math.abs(this.input.turn) > 0.1 || desiredMove.length() > 0.1;
      const slideX = this.group.position.clone();
      slideX.x = next.x;
      const slideZ = this.group.position.clone();
      slideZ.z = next.z;
      if (!maze.isWorldBlocked(slideX, this.radius)) this.group.position.copy(slideX);
      if (!maze.isWorldBlocked(slideZ, this.radius)) this.group.position.copy(slideZ);
    }
  }

  takeDamage(amount) {
    if (!this.alive) return { hpBefore: this.hp, hpAfter: this.hp, killed: false };
    if (this.invulnerableTimer > 0) {
      return { hpBefore: this.hp, hpAfter: this.hp, killed: false, ignored: true };
    }
    const hpBefore = this.hp;
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) {
      this.alive = false;
      this.group.visible = false;
    }
    return { hpBefore, hpAfter: this.hp, killed: hpBefore > 0 && this.hp <= 0 };
  }

  reset(position) {
    this.hp = this.maxHp;
    this.alive = true;
    this.cooldown = 0;
    this.invulnerableTimer = CONFIG.tank.spawnInvulnerableSeconds;
    this.group.visible = true;
    this.group.position.copy(position);
    this.group.rotation.y = Math.random() * Math.PI * 2;
    this.turret.rotation.y = 0;
  }

  serialize() {
    return [
      this.id,
      Number(this.group.position.x.toFixed(2)),
      Number(this.group.position.y.toFixed(2)),
      Number(this.group.position.z.toFixed(2)),
      Number(this.group.rotation.y.toFixed(3)),
      Number(this.turret.rotation.y.toFixed(3)),
    ];
  }
}

class ProjectileSystem {
  constructor(scene, maze, eventBus, config = CONFIG.projectile) {
    this.scene = scene;
    this.maze = maze;
    this.eventBus = eventBus;
    this.config = config;
    this.projectiles = [];
    this.damage = config.damage;
    this.speed = config.speed;
    this.maxBounces = config.maxBounces;
    this.geometry = new THREE.SphereGeometry(config.radius, 12, 8);
    this.material = new THREE.MeshStandardMaterial({
      color: 0xf2c860,
      emissive: 0x2c1800,
      roughness: 0.35,
    });
  }

  spawn(ownerId, position, direction, ownerTarget) {
    const mesh = new THREE.Mesh(this.geometry, this.material);
    mesh.castShadow = true;
    mesh.position.copy(position);
    this.scene.add(mesh);
    const shotDirection = direction.clone().normalize();
    const velocity = shotDirection.clone().multiplyScalar(this.speed);
    this.projectiles.push({
      ownerId,
      ownerTarget,
      mesh,
      velocity,
      bounces: 0,
      age: 0,
    });
    this.eventBus.emit("projectile-fired", {
      ownerId,
      position: position.clone(),
      direction: shotDirection,
    });
  }

  clear() {
    this.projectiles.forEach((projectile) => this.scene.remove(projectile.mesh));
    this.projectiles = [];
  }

  update(dt, tanks) {
    const survivors = [];
    for (const projectile of this.projectiles) {
      projectile.age += dt;
      const previous = projectile.mesh.position.clone();
      const next = previous.clone().addScaledVector(projectile.velocity, dt);

      const collision = this.traceWallCollision(previous, next);
      if (collision) {
        projectile.mesh.position.copy(collision.position);
        projectile.velocity.reflect(collision.normal);
        projectile.bounces += 1;
        this.eventBus.emit("projectile-bounce", {
          ownerId: projectile.ownerId,
          position: collision.position.clone(),
          normal: collision.normal.clone(),
        });
      } else {
        projectile.mesh.position.copy(next);
      }

      let hit = false;
      for (const tank of tanks) {
        if (!tank.alive) continue;
        if (!this.config.friendlyFire && tank.id === projectile.ownerId) continue;
        if (tank.id === projectile.ownerId && projectile.age < this.config.ownerSafeSeconds) continue;
        const flatProjectile = projectile.mesh.position.clone();
        flatProjectile.y = 0;
        const flatTank = tank.group.position.clone();
        flatTank.y = 0;
        if (flatProjectile.distanceTo(flatTank) <= tank.radius + this.config.radius) {
          const damageResult = tank.takeDamage(this.damage);
          this.eventBus.emit("tank-hit", {
            tank,
            projectile,
            ownerId: projectile.ownerId,
            targetId: tank.id,
            damage: this.damage,
            killed: damageResult.killed,
            hpBefore: damageResult.hpBefore,
            hpAfter: damageResult.hpAfter,
            ignored: damageResult.ignored,
            position: projectile.mesh.position.clone(),
          });
          hit = true;
          break;
        }
      }

      if (hit || projectile.bounces > this.maxBounces || projectile.age > this.config.maxAgeSeconds) {
        this.scene.remove(projectile.mesh);
      } else {
        survivors.push(projectile);
      }
    }
    this.projectiles = survivors;
  }

  traceWallCollision(from, to) {
    const samples = Math.max(3, Math.ceil(from.distanceTo(to) / 0.12));
    let previousCell = this.maze.worldToCell(from);
    for (let i = 1; i <= samples; i++) {
      const t = i / samples;
      const point = from.clone().lerp(to, t);
      if (!this.maze.isWorldBlocked(point, 0.08)) {
        previousCell = this.maze.worldToCell(point);
        continue;
      }

      const cell = this.maze.worldToCell(point);
      let normal;
      if (cell.x !== previousCell.x) {
        normal = new THREE.Vector3(previousCell.x < cell.x ? -1 : 1, 0, 0);
      } else if (cell.y !== previousCell.y) {
        normal = new THREE.Vector3(0, 0, previousCell.y < cell.y ? -1 : 1);
      } else {
        const center = this.maze.cellToWorld(cell.x, cell.y);
        const dx = point.x - center.x;
        const dz = point.z - center.z;
        normal =
          Math.abs(dx) > Math.abs(dz)
            ? new THREE.Vector3(Math.sign(dx) || 1, 0, 0)
            : new THREE.Vector3(0, 0, Math.sign(dz) || 1);
      }
      return {
        position: from.clone().lerp(to, Math.max(0, t - 1 / samples)),
        normal,
      };
    }
    return null;
  }
}

class EffectsSystem {
  constructor(scene) {
    this.scene = scene;
    this.effects = [];
  }

  muzzleFlash(position, direction) {
    this.spawnBurst(position.clone().addScaledVector(direction, 0.35), direction, {
      count: 7,
      color: 0xffd16a,
      speed: 3.5,
      life: 0.18,
      radius: 0.12,
      spread: 0.8,
    });
  }

  wallSpark(position, normal) {
    this.spawnBurst(position, normal, {
      count: 9,
      color: 0x9fe6ff,
      speed: 4.2,
      life: 0.32,
      radius: 0.08,
      spread: 1.4,
    });
  }

  hitBurst(position, killed = false) {
    this.spawnBurst(position, new THREE.Vector3(0, 1, 0), {
      count: killed ? 22 : 12,
      color: killed ? 0xff744a : 0xffd86a,
      speed: killed ? 6.4 : 4.4,
      life: killed ? 0.62 : 0.34,
      radius: killed ? 0.13 : 0.09,
      spread: 2.1,
    });
  }

  scrape(position) {
    this.spawnBurst(position, new THREE.Vector3(0, 1, 0), {
      count: 4,
      color: 0xb6d4dd,
      speed: 1.8,
      life: 0.18,
      radius: 0.06,
      spread: 1.2,
    });
  }

  spawnBurst(position, direction, options) {
    const basisYaw = Math.atan2(direction.x, -direction.z);
    for (let i = 0; i < options.count; i++) {
      const angle = basisYaw + (Math.random() - 0.5) * options.spread;
      const lift = 0.3 + Math.random() * 1.5;
      const velocity = forwardFromYaw(angle)
        .multiplyScalar(options.speed * (0.35 + Math.random() * 0.85))
        .add(new THREE.Vector3(0, lift, 0));
      const mesh = new THREE.Mesh(
        new THREE.SphereGeometry(options.radius * (0.65 + Math.random() * 0.85), 8, 6),
        new THREE.MeshStandardMaterial({ color: options.color, roughness: 0.18 }),
      );
      mesh.position.copy(position);
      this.scene.add(mesh);
      this.effects.push({
        mesh,
        velocity,
        age: 0,
        life: options.life * (0.75 + Math.random() * 0.55),
      });
    }
  }

  update(dt) {
    const alive = [];
    for (const effect of this.effects) {
      effect.age += dt;
      effect.velocity.y -= 5.4 * dt;
      effect.mesh.position.addScaledVector(effect.velocity, dt);
      if (effect.age >= effect.life) {
        this.scene.remove(effect.mesh);
      } else {
        alive.push(effect);
      }
    }
    this.effects = alive;
  }

  clear() {
    this.effects.forEach((effect) => this.scene.remove(effect.mesh));
    this.effects = [];
  }
}

class AudioSystem {
  constructor() {
    this.ctx = null;
    this.engineOsc = null;
    this.engineGain = null;
    this.lastScrapeAt = 0;
  }

  ensure() {
    if (this.ctx) return;
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) return;
    this.ctx = new AudioContextClass();
  }

  resume() {
    this.ensure();
    this.ctx?.resume?.();
  }

  beep({ frequency = 220, duration = 0.12, type = "sine", gain = 0.08, slide = 1 }) {
    this.ensure();
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const amp = this.ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, frequency * slide), now + duration);
    amp.gain.setValueAtTime(gain, now);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp);
    amp.connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  fire() {
    this.beep({ frequency: 96, duration: 0.13, type: "square", gain: 0.09, slide: 0.42 });
    this.beep({ frequency: 640, duration: 0.04, type: "sawtooth", gain: 0.035, slide: 0.7 });
  }

  bounce() {
    this.beep({ frequency: 420, duration: 0.06, type: "triangle", gain: 0.045, slide: 1.35 });
  }

  hit(killed) {
    this.beep({ frequency: killed ? 82 : 150, duration: killed ? 0.34 : 0.12, type: "sawtooth", gain: killed ? 0.12 : 0.08, slide: killed ? 0.35 : 0.65 });
  }

  scrape() {
    const now = performance.now();
    if (now - this.lastScrapeAt < 130) return;
    this.lastScrapeAt = now;
    this.beep({ frequency: 180, duration: 0.055, type: "sawtooth", gain: 0.035, slide: 0.8 });
  }

  setEngine(active, intensity = 0) {
    this.ensure();
    if (!this.ctx) return;
    if (!this.engineOsc) {
      this.engineOsc = this.ctx.createOscillator();
      this.engineGain = this.ctx.createGain();
      this.engineOsc.type = "sawtooth";
      this.engineOsc.frequency.value = 42;
      this.engineGain.gain.value = 0.0001;
      this.engineOsc.connect(this.engineGain);
      this.engineGain.connect(this.ctx.destination);
      this.engineOsc.start();
    }
    const now = this.ctx.currentTime;
    this.engineOsc.frequency.setTargetAtTime(38 + intensity * 34, now, 0.05);
    this.engineGain.gain.setTargetAtTime(active ? 0.022 + intensity * 0.018 : 0.0001, now, 0.08);
  }
}

class PlayerController {
  constructor(tank, camera, canvas, projectileSystem) {
    this.tank = tank;
    this.camera = camera;
    this.canvas = canvas;
    this.projectileSystem = projectileSystem;
    this.keys = new Set();
    this.aimYaw = tank.group.rotation.y;
    this.mouseSensitivity = CONFIG.tank.mouseSensitivity;
    this.disposers = [];

    const onKeyDown = (event) => {
      const key = event.key.toLowerCase();
      if (["w", "a", "s", "d", "arrowup", "arrowdown", "arrowleft", "arrowright", " "].includes(key)) {
        event.preventDefault();
      }
      this.keys.add(key);
    };
    const onKeyUp = (event) => this.keys.delete(event.key.toLowerCase());
    const onPointerMove = (event) => this.updateAim(event);
    const onPointerDown = (event) => {
      this.canvas.requestPointerLock?.();
      this.updateAim(event);
      this.tank.fire(this.projectileSystem, ENEMY_ID, this.aimYaw);
    };
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    canvas.addEventListener("pointermove", onPointerMove);
    canvas.addEventListener("pointerdown", onPointerDown);
    this.disposers.push(
      () => window.removeEventListener("keydown", onKeyDown),
      () => window.removeEventListener("keyup", onKeyUp),
      () => canvas.removeEventListener("pointermove", onPointerMove),
      () => canvas.removeEventListener("pointerdown", onPointerDown),
    );
  }

  updateAim(event) {
    if (document.pointerLockElement === this.canvas) {
      this.aimYaw += event.movementX * this.mouseSensitivity;
      return;
    }

    const rect = this.canvas.getBoundingClientRect();
    const normalizedX = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    this.aimYaw += normalizedX * this.mouseSensitivity * 10;
  }

  update(dt) {
    const forwardInput =
      Number(this.keys.has("w") || this.keys.has("arrowup")) -
      Number(this.keys.has("s") || this.keys.has("arrowdown"));
    const turnInput =
      Number(this.keys.has("d") || this.keys.has("arrowright")) -
      Number(this.keys.has("a") || this.keys.has("arrowleft"));

    this.tank.drive(forwardInput, turnInput);
    this.tank.rotateTurretToYaw(this.aimYaw, dt, true);
    if (this.keys.has(" ") || this.keys.has("enter")) this.tank.fire(this.projectileSystem, ENEMY_ID, this.aimYaw);
  }

  dispose() {
    this.disposers.forEach((dispose) => dispose());
    this.disposers = [];
    this.keys.clear();
  }
}

class AIController {
  constructor(tank, target, maze, projectileSystem, config = CONFIG.ai) {
    this.tank = tank;
    this.target = target;
    this.maze = maze;
    this.projectileSystem = projectileSystem;
    this.config = config;
    this.state = "PATROL";
    this.path = [];
    this.pathTimer = 0;
    this.losTimer = 0;
    this.strafeTimer = 0;
    this.strafeSign = Math.random() < 0.5 ? -1 : 1;
  }

  update(dt) {
    if (!this.tank.alive || !this.target.alive) return;
    this.losTimer -= dt;
    if (this.losTimer <= 0) {
      this.losTimer = this.config.losCheckSeconds;
      const distance = this.tank.group.position.distanceTo(this.target.group.position);
      const hasLos = this.hasLineOfSight();
      if (hasLos && distance <= this.config.attackRange) this.state = "ATTACK";
      else this.state = "HUNT";
    }

    this.pathTimer -= dt;
    if (this.pathTimer <= 0) {
      this.pathTimer = this.state === "ATTACK" ? this.config.repathSeconds : this.config.patrolRepathSeconds;
      this.path = this.findPathToTarget();
    }

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = this.config.strafeChangeSeconds;
      this.strafeSign *= -1;
    }

    this.driveCombat(dt);
    const targetVelocity = this.target.input?.move?.clone?.().multiplyScalar(this.target.speed) ?? new THREE.Vector3();
    const targetPoint = this.target.group.position
      .clone()
      .addScaledVector(targetVelocity, this.config.aimLeadSeconds);
    this.tank.rotateTurretTo(targetPoint, dt);
    if (this.state === "ATTACK") this.tank.fire(this.projectileSystem, PLAYER_ID);
  }

  hasLineOfSight() {
    const from = this.tank.group.position.clone();
    const to = this.target.group.position.clone();
    const steps = Math.ceil(from.distanceTo(to) / 0.45);
    for (let i = 1; i < steps; i++) {
      const point = from.clone().lerp(to, i / steps);
      if (this.maze.isWorldBlocked(point, 0.05)) return false;
    }
    return true;
  }

  findPathToTarget() {
    const start = this.maze.worldToCell(this.tank.group.position);
    const goal = this.maze.worldToCell(this.target.group.position);
    const key = ({ x, y }) => `${x},${y}`;
    const open = [{ ...start, g: 0, f: 0 }];
    const cameFrom = new Map();
    const scores = new Map([[key(start), 0]]);

    while (open.length) {
      open.sort((a, b) => a.f - b.f);
      const current = open.shift();
      if (current.x === goal.x && current.y === goal.y) {
        const path = [];
        let cursor = key(current);
        while (cameFrom.has(cursor)) {
          const [x, y] = cursor.split(",").map(Number);
          path.unshift(this.maze.cellToWorld(x, y));
          cursor = cameFrom.get(cursor);
        }
        return path.slice(0, this.config.pathLookahead);
      }

      for (const neighbor of this.neighbors(current)) {
        const tentative = current.g + 1;
        const nKey = key(neighbor);
        if (tentative >= (scores.get(nKey) ?? Infinity)) continue;
        cameFrom.set(nKey, key(current));
        scores.set(nKey, tentative);
        const h = Math.abs(neighbor.x - goal.x) + Math.abs(neighbor.y - goal.y);
        open.push({ ...neighbor, g: tentative, f: tentative + h });
      }
    }
    return [];
  }

  neighbors(node) {
    return [
      { x: node.x + 1, y: node.y },
      { x: node.x - 1, y: node.y },
      { x: node.x, y: node.y + 1 },
      { x: node.x, y: node.y - 1 },
    ].filter((cell) => !this.maze.isWallCell(cell.x, cell.y));
  }

  drivePath(dt) {
    const waypoint = this.path[0];
    if (!waypoint) {
      this.tank.drive(0, 0.35);
      return;
    }

    const delta = waypoint.clone().sub(this.tank.group.position);
    delta.y = 0;
    if (delta.length() < 0.45) {
      this.path.shift();
      return;
    }

    const desired = Math.atan2(-delta.x, -delta.z);
    const current = this.tank.group.rotation.y;
    const diff = ((desired - current + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    const turn = clamp(diff * 1.8, -1, 1);
    const throttle = Math.abs(diff) > 1.2 ? 0.15 : 0.78;
    this.tank.drive(throttle, turn);
    this.tank.update(dt, this.maze);
  }

  driveCombat(dt) {
    if (this.state === "ATTACK") {
      const toTarget = this.target.group.position.clone().sub(this.tank.group.position);
      toTarget.y = 0;
      const distance = toTarget.length();
      const toward = toTarget.clone().normalize();
      const strafe = rightFromYaw(Math.atan2(toward.x, -toward.z)).multiplyScalar(this.strafeSign * 0.72);
      const rangeCorrection =
        distance > this.config.preferredRange + 4
          ? toward.multiplyScalar(0.85)
          : distance < this.config.preferredRange - 4
            ? toward.multiplyScalar(-0.55)
            : new THREE.Vector3();
      const move = rangeCorrection.add(strafe);
      if (!this.maze.isWorldBlocked(this.tank.group.position.clone().addScaledVector(move, CELL_SIZE * 0.5), this.tank.radius)) {
        this.tank.moveWorld(move);
        this.tank.update(dt, this.maze);
        return;
      }
    }
    this.drivePath(dt);
  }
}

class GameManager {
  constructor() {
    this.canvas = document.querySelector("#gameCanvas");
    this.menuOverlay = document.querySelector("#menuOverlay");
    this.mainMenuPage = document.querySelector("#mainMenuPage");
    this.settingsPage = document.querySelector("#settingsPage");
    this.loadingOverlay = document.querySelector("#loadingOverlay");
    this.hud = document.querySelector("#hud");
    this.roundMessage = document.querySelector("#roundMessage");
    this.menuError = document.querySelector("#menuError");
    this.minimap = document.querySelector("#minimap");
    this.minimapCtx = this.minimap.getContext("2d");
    this.mapSizeSelect = document.querySelector("#mapSizeSelect");
    this.mazeToggle = document.querySelector("#mazeToggle");
    this.maxHpInput = document.querySelector("#maxHpInput");
    this.playerSpeedInput = document.querySelector("#playerSpeedInput");
    this.rotationSpeedInput = document.querySelector("#rotationSpeedInput");
    this.enemySpeedInput = document.querySelector("#enemySpeedInput");
    this.damageInput = document.querySelector("#damageInput");
    this.projectileSpeedInput = document.querySelector("#projectileSpeedInput");
    this.fireIntervalInput = document.querySelector("#fireIntervalInput");
    this.projectileLifeInput = document.querySelector("#projectileLifeInput");
    this.invulnerableInput = document.querySelector("#invulnerableInput");
    this.playerHp = document.querySelector("#playerHp");
    this.enemyHp = document.querySelector("#enemyHp");
    this.playerHpFill = document.querySelector("#playerHpFill");
    this.enemyHpFill = document.querySelector("#enemyHpFill");
    this.scoreboardBody = document.querySelector("#scoreboardBody");
    this.eventBus = new EventBus();
    this.audio = new AudioSystem();
    this.config = CONFIG;
    this.cellSize = CELL_SIZE;
    this.playerLabels = {
      [PLAYER_ID]: "玩家",
      [ENEMY_ID]: "敌人",
    };
    this.scores = this.createEmptyScores();
    this.clock = new THREE.Clock();
    this.state = GameState.MENU;
    this.lastBroadcast = [];

    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x151a18);
    this.scene.fog = new THREE.Fog(0x151a18, 58, 118);

    this.camera = new THREE.PerspectiveCamera(this.config.camera.fov, 1, 0.1, 260);
    this.cameraTarget = new THREE.Vector3();
    this.agentBridge = new AgentBridgeClass(this);
    this.effects = new EffectsSystem(this.scene);

    this.configureLights();
    this.bindUI();
    this.bindEvents();
    this.resize();
    window.addEventListener("resize", () => this.resize());
    if (new URLSearchParams(window.location.search).has("autostart")) {
      window.setTimeout(() => this.startRound(), 80);
    }
    this.animate();
  }

  configureLights() {
    const ambient = new THREE.HemisphereLight(0xf1f5df, 0x313b37, 1.35);
    this.scene.add(ambient);
    const sun = new THREE.DirectionalLight(0xfff3d0, 2.25);
    sun.position.set(-30, 50, 24);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.camera.near = 1;
    sun.shadow.camera.far = 120;
    sun.shadow.camera.left = -70;
    sun.shadow.camera.right = 70;
    sun.shadow.camera.top = 70;
    sun.shadow.camera.bottom = -70;
    this.scene.add(sun);
  }

  bindUI() {
    document.querySelector("#startButton").textContent = UI.start_game;
    document.querySelector("#lanButton").textContent = UI.lan_lobby;
    this.syncSettingsForm();
    document.querySelector("#startButton").addEventListener("click", () => this.startRound());
    document.querySelector("#settingsPageButton").addEventListener("click", () => this.showSettingsPage());
    document.querySelector("#backToMainButton").addEventListener("click", () => this.showMainMenuPage());
    window.addEventListener("keydown", (event) => this.handleGlobalKeys(event));
    window.addEventListener("keydown", () => this.audio.resume(), { once: true });
    this.canvas.addEventListener("pointerdown", () => this.audio.resume());
  }

  syncSettingsForm() {
    this.maxHpInput.value = String(this.config.tank.maxHp);
    this.playerSpeedInput.value = String(this.config.tank.playerSpeed);
    this.rotationSpeedInput.value = String(this.config.tank.rotationSpeed);
    this.enemySpeedInput.value = String(this.config.tank.enemySpeed);
    this.damageInput.value = String(this.config.projectile.damage);
    this.projectileSpeedInput.value = String(this.config.projectile.speed);
    this.fireIntervalInput.value = String(this.config.tank.fireInterval);
    this.projectileLifeInput.value = String(this.config.projectile.maxAgeSeconds);
    this.invulnerableInput.value = String(this.config.tank.spawnInvulnerableSeconds);
  }

  handleGlobalKeys(event) {
    const key = event.key.toLowerCase();
    const activeTag = document.activeElement?.tagName?.toLowerCase();
    const editingSetting = activeTag === "select" || activeTag === "input";
    if (this.state === GameState.MENU && key === "escape" && !this.settingsPage.classList.contains("hidden")) {
      event.preventDefault();
      this.showMainMenuPage();
      return;
    }
    if (this.state === GameState.MENU && key === "enter") {
      if (editingSetting) return;
      event.preventDefault();
      this.startRound();
      return;
    }
    if (this.state === GameState.ROUND_OVER) {
      if (key === "enter" || key === "r") {
        event.preventDefault();
        this.startRound();
      } else if (key === "escape" || key === "m") {
        event.preventDefault();
        this.showMenu();
      }
    }
  }

  bindEvents() {
    this.eventBus.addEventListener("projectile-fired", (event) => {
      this.effects.muzzleFlash(event.detail.position, event.detail.direction);
      this.audio.fire();
    });
    this.eventBus.addEventListener("projectile-bounce", (event) => {
      this.effects.wallSpark(event.detail.position, event.detail.normal);
      this.audio.bounce();
    });
    this.eventBus.addEventListener("tank-hit", (event) => {
      this.recordHit(event.detail);
      if (!event.detail.ignored) {
        this.effects.hitBurst(event.detail.position, event.detail.killed);
        this.audio.hit(event.detail.killed);
      }
      this.checkRoundOver();
    });
  }

  createEmptyScores() {
    return {
      [PLAYER_ID]: { kills: 0, deaths: 0, assists: 0 },
      [ENEMY_ID]: { kills: 0, deaths: 0, assists: 0 },
    };
  }

  startRound() {
    if (this.state === GameState.GENERATING_MAP) return;
    this.menuError.classList.add("hidden");
    this.applyMenuSettings();
    this.state = GameState.GENERATING_MAP;
    this.menuOverlay.classList.add("hidden");
    this.loadingOverlay.classList.remove("hidden");
    this.hud.classList.add("hidden");
    this.roundMessage.classList.add("hidden");

    requestAnimationFrame(() => {
      try {
      this.playerController?.dispose();
      this.projectiles?.clear();
      this.effects?.clear();
      this.resetScene();
      this.maze = new MazeGenerator(this.config.maze.width, this.config.maze.height, this.config.maze);
      this.maze.generate();
      this.wallMesh = this.maze.buildWalls();
      this.scene.add(this.wallMesh);
      this.buildFloor();

      const playerSpawn = this.maze.randomOpenCell();
      const enemySpawn = this.maze.randomOpenCell(playerSpawn.position);
      this.projectiles = new ProjectileSystem(this.scene, this.maze, this.eventBus, this.config.projectile);
      this.player = new TankEntity({
        id: PLAYER_ID,
        color: 0x497fd4,
        accent: 0x9cc6ff,
        scene: this.scene,
        position: playerSpawn.position,
        speed: this.config.tank.playerSpeed,
      });
      this.enemy = new TankEntity({
        id: ENEMY_ID,
        color: 0xc85243,
        accent: 0xffb26f,
        scene: this.scene,
        position: enemySpawn.position,
        speed: this.config.tank.enemySpeed,
      });
      this.faceTanksToEnemies();
      this.playerController = new PlayerController(
        this.player,
        this.camera,
        this.canvas,
        this.projectiles,
      );
      this.aiController = new AIController(this.enemy, this.player, this.maze, this.projectiles, this.config.ai);
      this.placeCameraBehindPlayer();

      this.state = GameState.GAMEPLAY;
      this.loadingOverlay.classList.add("hidden");
      this.hud.classList.remove("hidden");
      this.updateScoreboard();
      this.clock.getDelta();
      } catch (error) {
        this.showStartupError(error);
      }
    });
  }

  applyMenuSettings() {
    const presetKey = this.mapSizeSelect?.value ?? "small";
    const preset = this.config.maze.sizePresets[presetKey] ?? this.config.maze.sizePresets.small;
    this.config.maze.width = preset.width;
    this.config.maze.height = preset.height;
    this.config.maze.spawnMinDistanceCells = preset.spawnMinDistanceCells;
    this.config.maze.generateMaze = this.mazeToggle?.checked ?? true;
    this.config.tank.maxHp = this.readNumber(this.maxHpInput, 1, 999, this.config.tank.maxHp);
    this.config.tank.playerSpeed = this.readNumber(this.playerSpeedInput, 1, 40, this.config.tank.playerSpeed);
    this.config.tank.rotationSpeed = this.readNumber(this.rotationSpeedInput, 0.5, 12, this.config.tank.rotationSpeed);
    this.config.tank.enemySpeed = this.readNumber(this.enemySpeedInput, 1, 40, this.config.tank.enemySpeed);
    this.config.projectile.damage = this.readNumber(this.damageInput, 1, 999, this.config.projectile.damage);
    this.config.projectile.speed = this.readNumber(this.projectileSpeedInput, 5, 100, this.config.projectile.speed);
    this.config.tank.fireInterval = this.readNumber(this.fireIntervalInput, 0.05, 5, this.config.tank.fireInterval);
    this.config.projectile.maxAgeSeconds = this.readNumber(
      this.projectileLifeInput,
      0.2,
      30,
      this.config.projectile.maxAgeSeconds,
    );
    this.config.tank.spawnInvulnerableSeconds = this.readNumber(
      this.invulnerableInput,
      0,
      10,
      this.config.tank.spawnInvulnerableSeconds,
    );
  }

  readNumber(input, min, max, fallback) {
    const value = Number(input?.value);
    if (!Number.isFinite(value)) return fallback;
    const clamped = clamp(value, min, max);
    if (input) input.value = String(clamped);
    return clamped;
  }

  showMenu() {
    this.exitPointerLock();
    this.state = GameState.MENU;
    this.playerController?.dispose();
    this.roundMessage.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.loadingOverlay.classList.add("hidden");
    this.menuOverlay.classList.remove("hidden");
    this.showMainMenuPage(false);
    document.querySelector("#startButton").focus();
  }

  showSettingsPage() {
    this.mainMenuPage.classList.add("hidden");
    this.settingsPage.classList.remove("hidden");
    this.maxHpInput.focus();
  }

  showMainMenuPage(focusStart = true) {
    this.settingsPage.classList.add("hidden");
    this.mainMenuPage.classList.remove("hidden");
    if (focusStart) document.querySelector("#startButton").focus();
  }

  exitPointerLock() {
    if (document.pointerLockElement && document.exitPointerLock) {
      document.exitPointerLock();
    }
  }

  showStartupError(error) {
    console.error(error);
    this.state = GameState.MENU;
    this.loadingOverlay.classList.add("hidden");
    this.hud.classList.add("hidden");
    this.menuOverlay.classList.remove("hidden");
    const message = error?.message ?? String(error);
    this.menuError.textContent = `启动失败：${message}`;
    this.menuError.classList.remove("hidden");
  }

  resetScene() {
    const keep = new Set();
    this.scene.traverse((object) => {
      if (object.isLight || object.isCamera) keep.add(object);
    });
    [...this.scene.children].forEach((child) => {
      if (!keep.has(child)) this.scene.remove(child);
    });
  }

  buildFloor() {
    const width = this.maze.width * CELL_SIZE;
    const height = this.maze.height * CELL_SIZE;
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(width, 0.18, height),
      new THREE.MeshStandardMaterial({ color: 0x27323b, roughness: 0.82 }),
    );
    floor.position.y = -0.09;
    floor.receiveShadow = true;
    this.scene.add(floor);

    const grid = new THREE.GridHelper(width, this.maze.width, 0x9fd8ff, 0x40515d);
    grid.position.y = 0.02;
    grid.material.opacity = 0.26;
    grid.material.transparent = true;
    this.scene.add(grid);
  }

  faceTanksToEnemies() {
    this.player.faceWorldPoint(this.enemy.group.position);
    this.enemy.faceWorldPoint(this.player.group.position);
  }

  resize() {
    const { innerWidth, innerHeight } = window;
    this.renderer.setSize(innerWidth, innerHeight, false);
    this.camera.aspect = innerWidth / innerHeight;
    this.camera.updateProjectionMatrix();
  }

  animate() {
    requestAnimationFrame(() => this.animate());
    const dt = Math.min(this.clock.getDelta(), 0.033);

    if (this.state === GameState.GAMEPLAY) {
      this.playerController.update(dt);
      this.player.update(dt, this.maze);
      this.updateEnemyController(dt);
      this.updateCollisionFeedback();
      this.projectiles.update(dt, [this.player, this.enemy]);
      this.effects.update(dt);
      this.updateCamera(dt);
      this.updateHUD();
      this.updateMinimap();
      this.lastBroadcast = [this.player.serialize(), this.enemy.serialize()];
    }

    this.renderer.render(this.scene, this.camera);
  }

  updateCollisionFeedback() {
    const playerActive = this.player?.alive && (
      Math.abs(this.player.input.throttle) > 0.05 ||
      Math.abs(this.player.input.turn) > 0.05 ||
      this.player.input.move.length() > 0.05
    );
    this.audio.setEngine(this.state === GameState.GAMEPLAY && playerActive, playerActive ? 1 : 0);

    [this.player, this.enemy].forEach((tank) => {
      if (tank?.lastCollision) {
        const front = forwardFromYaw(tank.group.rotation.y);
        this.effects.scrape(tank.group.position.clone().addScaledVector(front, 1.2).add(new THREE.Vector3(0, 0.4, 0)));
        this.audio.scrape();
      }
    });
  }

  updateCamera(dt) {
    const playerPos = this.player?.group.position ?? new THREE.Vector3();
    const aimYaw = this.playerController?.aimYaw ?? this.player?.group.rotation.y ?? 0;
    const forward = forwardFromYaw(aimYaw);
    const target = this.resolveCameraPosition(playerPos, forward);
    const lookAt = playerPos
      .clone()
      .addScaledVector(forward, this.config.camera.lookAhead)
      .add(new THREE.Vector3(0, 1.25, 0));
    this.camera.position.lerp(target, clamp(dt * 4, 0, 1));
    this.cameraTarget.lerp(lookAt, clamp(dt * 8, 0, 1));
    this.camera.lookAt(this.cameraTarget);
  }

  resolveCameraPosition(playerPos, forward) {
    const base = this.config.camera.distance;
    const distances = [base, base * 0.78, base * 0.58, base * 0.38, 2.0];
    for (const distance of distances) {
      const candidate = playerPos
        .clone()
        .addScaledVector(forward, -distance)
        .add(new THREE.Vector3(0, this.config.camera.height, 0));
      if (
        !this.maze?.isWorldBlocked(candidate, this.config.camera.collisionRadius) &&
        this.hasCameraLine(playerPos.clone().add(new THREE.Vector3(0, 1.4, 0)), candidate)
      ) {
        return candidate;
      }
    }
    return playerPos.clone().add(new THREE.Vector3(0, this.config.camera.height + 1.0, 0));
  }

  hasCameraLine(from, to) {
    if (!this.maze) return true;
    const steps = Math.max(2, Math.ceil(from.distanceTo(to) / 0.45));
    for (let i = 1; i < steps; i++) {
      const point = from.clone().lerp(to, i / steps);
      point.y = 0;
      if (this.maze.isWorldBlocked(point, 0.18)) return false;
    }
    return true;
  }

  placeCameraBehindPlayer() {
    const playerPos = this.player.group.position;
    const aimYaw = this.playerController.aimYaw;
    const forward = forwardFromYaw(aimYaw);
    this.camera.position.copy(this.resolveCameraPosition(playerPos, forward));
    this.cameraTarget.copy(
      playerPos
        .clone()
        .addScaledVector(forward, this.config.camera.lookAhead)
        .add(new THREE.Vector3(0, 1.25, 0)),
    );
    this.camera.lookAt(this.cameraTarget);
  }

  updateHUD() {
    this.playerHp.textContent = String(this.player.hp);
    this.enemyHp.textContent = String(this.enemy.hp);
    this.playerHpFill.style.width = `${(this.player.hp / this.player.maxHp) * 100}%`;
    this.enemyHpFill.style.width = `${(this.enemy.hp / this.enemy.maxHp) * 100}%`;
  }

  recordHit({ ownerId, targetId, killed, ignored }) {
    if (!ownerId || !targetId || !this.scores[ownerId] || !this.scores[targetId]) return;
    if (ignored) return;

    if (killed) {
      this.scores[targetId].deaths += 1;
      if (ownerId !== targetId) {
        this.scores[ownerId].kills += 1;
      }
    } else if (ownerId !== targetId) {
      this.scores[ownerId].assists += 1;
    }

    this.updateScoreboard();
  }

  updateScoreboard() {
    if (!this.scoreboardBody) return;
    this.scoreboardBody.innerHTML = [PLAYER_ID, ENEMY_ID]
      .map((id) => {
        const score = this.scores[id];
        return `
          <tr>
            <td>${this.playerLabels[id]}</td>
            <td>${score.kills}</td>
            <td>${score.deaths}</td>
            <td>${score.assists}</td>
          </tr>
        `;
      })
      .join("");
  }

  updateEnemyController(dt) {
    const external = this.agentBridge.getController(ENEMY_ID);
    if (!external) {
      if (this.config.ai.enabled) this.aiController.update(dt);
      return;
    }

    const observation = this.agentBridge.getObservation();
    const action = typeof external === "function"
      ? external(observation, dt)
      : external.update?.(observation, dt);
    if (action) {
      this.agentBridge.applyAction(ENEMY_ID, action);
      this.enemy.update(dt, this.maze);
    }
  }

  updateMinimap() {
    if (!this.minimapCtx || !this.maze) return;
    const cfg = this.config.minimap;
    const ctx = this.minimapCtx;
    const size = cfg.size;
    if (this.minimap.width !== size || this.minimap.height !== size) {
      this.minimap.width = size;
      this.minimap.height = size;
    }
    const cellW = size / this.maze.width;
    const cellH = size / this.maze.height;
    const playerCell = this.maze.worldToCell(this.player.group.position);
    ctx.clearRect(0, 0, size, size);
    ctx.fillStyle = "#101614";
    ctx.fillRect(0, 0, size, size);

    for (let y = 0; y < this.maze.height; y++) {
      for (let x = 0; x < this.maze.width; x++) {
        const distance = Math.hypot(x - playerCell.x, y - playerCell.y);
        const visible = cfg.showEnemyAlways || distance <= cfg.fogRadiusCells;
        ctx.fillStyle = this.maze.grid[y][x] === 1 ? "#6f7c67" : "#202b25";
        if (!visible) ctx.fillStyle = this.maze.grid[y][x] === 1 ? "#333b34" : "#101513";
        ctx.fillRect(x * cellW, y * cellH, Math.ceil(cellW), Math.ceil(cellH));
      }
    }

    this.drawMinimapTank(this.player, "#65a8ff", cellW, cellH);
    if (cfg.showEnemyAlways || this.player.group.position.distanceTo(this.enemy.group.position) < cfg.fogRadiusCells * CELL_SIZE) {
      this.drawMinimapTank(this.enemy, "#ff806f", cellW, cellH);
    }

    if (cfg.showProjectiles) {
      ctx.fillStyle = "#f2c860";
      this.projectiles.projectiles.forEach((projectile) => {
        const cell = this.maze.worldToCell(projectile.mesh.position);
        ctx.beginPath();
        ctx.arc((cell.x + 0.5) * cellW, (cell.y + 0.5) * cellH, 2, 0, Math.PI * 2);
        ctx.fill();
      });
    }
  }

  drawMinimapTank(tank, color, cellW, cellH) {
    const ctx = this.minimapCtx;
    const cell = this.maze.worldToCell(tank.group.position);
    const x = (cell.x + 0.5) * cellW;
    const y = (cell.y + 0.5) * cellH;
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(tank.group.rotation.y);
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(0, -6);
    ctx.lineTo(4.5, 5);
    ctx.lineTo(-4.5, 5);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  getTankById(entityId) {
    if (entityId === PLAYER_ID) return this.player;
    if (entityId === ENEMY_ID) return this.enemy;
    return null;
  }

  vectorFromArray(values) {
    return new THREE.Vector3(values[0] ?? 0, values[1] ?? 0, values[2] ?? 0);
  }

  forwardFromYaw(yaw) {
    return forwardFromYaw(yaw);
  }

  checkRoundOver() {
    if (this.state !== GameState.GAMEPLAY) return;
    const playerDead = !this.player.alive;
    const enemyDead = !this.enemy.alive;
    if (!playerDead && !enemyDead) return;

    this.state = GameState.ROUND_OVER;
    this.exitPointerLock();
    this.playerController?.dispose();
    this.updateHUD();
    const title = playerDead && enemyDead ? UI.draw : enemyDead ? UI.victory : UI.defeat;
    this.roundMessage.innerHTML = `
      <h2>${title}</h2>
      <p class="round-hint">Enter / R：下一关　Esc / M：回设置</p>
      <div class="round-actions">
        <button id="restartButton" class="primary-button">${UI.restart}</button>
        <button id="settingsButton" class="ghost-button">回到设置</button>
      </div>
    `;
    this.roundMessage.classList.remove("hidden");
    document.querySelector("#restartButton").addEventListener("click", () => this.startRound());
    document.querySelector("#settingsButton").addEventListener("click", () => this.showMenu());
    document.querySelector("#restartButton").focus();
  }
}

window.__tankGame = new GameManager();
