class AgentBridge {
  constructor(game) {
    this.game = game;
    this.externalControllers = new Map();
  }

  getObservation() {
    const game = this.game;
    if (!game.player || !game.enemy || !game.maze) return null;
    return {
      state: game.state,
      maze: {
        width: game.maze.width,
        height: game.maze.height,
        cellSize: game.cellSize,
        grid: game.maze.grid.map((row) => [...row]),
      },
      tanks: [game.player, game.enemy].map((tank) => ({
        id: tank.id,
        hp: tank.hp,
        alive: tank.alive,
        position: vectorToArray(tank.group.position),
        rotationY: tank.group.rotation.y,
        turretRotationY: tank.turret.rotation.y,
        cooldown: tank.cooldown,
        invulnerableTimer: tank.invulnerableTimer,
      })),
      projectiles: game.projectiles.projectiles.map((projectile) => ({
        ownerId: projectile.ownerId,
        position: vectorToArray(projectile.mesh.position),
        velocity: vectorToArray(projectile.velocity),
        bounces: projectile.bounces,
        age: projectile.age,
      })),
      scores: Object.fromEntries(
        Object.entries(game.scores).map(([id, score]) => [id, { ...score }]),
      ),
    };
  }

  setController(entityId, controller) {
    this.externalControllers.set(entityId, controller);
  }

  clearController(entityId) {
    this.externalControllers.delete(entityId);
  }

  getController(entityId) {
    return this.externalControllers.get(entityId) ?? null;
  }

  applyAction(entityId, action = {}) {
    const tank = this.game.getTankById(entityId);
    if (!tank || !tank.alive) return false;
    const move = action.move;
    if (Array.isArray(move)) {
      tank.moveWorld(this.game.vectorFromArray(move));
    }
    if (typeof action.aimYaw === "number") {
      const target = tank.group.position
        .clone()
        .addScaledVector(this.game.forwardFromYaw(action.aimYaw), 12);
      tank.rotateTurretTo(target, 1);
    }
    if (action.fire) {
      tank.fire(this.game.projectiles, null);
    }
    return true;
  }

  serializeState() {
    return JSON.stringify(this.getObservation());
  }
}

function vectorToArray(vector) {
  return [
    Number(vector.x.toFixed(3)),
    Number(vector.y.toFixed(3)),
    Number(vector.z.toFixed(3)),
  ];
}

window.AgentBridge = AgentBridge;
