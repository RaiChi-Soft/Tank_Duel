const GAME_CONFIG = {
  maze: {
    width: 15,
    height: 15,
    cellSize: 4,
    loopChance: 0.18,
    spawnMinDistanceCells: 5,
    generateMaze: true,
    sizePresets: {
      small: { label: "小", width: 13, height: 13, spawnMinDistanceCells: 4 },
      medium: { label: "中", width: 17, height: 17, spawnMinDistanceCells: 5 },
      large: { label: "大", width: 21, height: 21, spawnMinDistanceCells: 7 },
    },
  },

  tank: {
    maxHp: 10,
    playerSpeed: 10.5,
    enemySpeed: 8.6,
    rotationSpeed: 3.0,
    fireInterval: 0.42,
    radius: 1.02,
    mouseSensitivity: 0.0028,
    spawnInvulnerableSeconds: 1,
  },

  projectile: {
    damage: 100,
    speed: 36,
    radius: 0.22,
    maxBounces: 5,
    maxAgeSeconds: 6.5,
    friendlyFire: true,
    ownerSafeSeconds: 0.12,
  },

  ai: {
    enabled: true,
    repathSeconds: 0.35,
    losCheckSeconds: 0.12,
    attackRange: 46,
    preferredRange: 18,
    strafeChangeSeconds: 1.1,
    aimLeadSeconds: 0.08,
    patrolRepathSeconds: 1.4,
    pathLookahead: 10,
  },

  camera: {
    distance: 7.2,
    height: 3.6,
    lookAhead: 7.6,
    collisionRadius: 0.35,
    fov: 62,
  },

  minimap: {
    size: 178,
    fogRadiusCells: 6,
    showEnemyAlways: true,
    showProjectiles: true,
  },

  presentation: {
    wallHeight: 2.7,
    sourceStyle: false,
  },
};

window.GAME_CONFIG = GAME_CONFIG;
