const GAME_WIDTH = 512;
const GAME_HEIGHT = 288;
const TILE_SIZE = 16;

const CHUNKY_SPEED = 48;
const FALL_SPEED = 180;
const JUMP_DURATION = 0.32;
const JUMP_HEIGHT = 22;
const MONSTER_SPEED = 16;
const FIRST_MONSTER_DELAY = 3000;
const MONSTER_SPAWN_INTERVAL = 4000;
const MONSTERS_PER_SPAWN = 1;

const CAMERA_LERP_X = 0.12;
const CAMERA_LERP_Y = 0.16;
const CAMERA_FALL_LERP_Y = 0.28;
const CAMERA_RIGHT_SCREEN_X = 128;
const CAMERA_SCREEN_Y = 136;
const CAMERA_FALL_SCREEN_Y = 104;

const START_GRID_X = 0;
const START_GRID_Y = 9;

const CHUNKY_BODY_WIDTH = 12;
const CHUNKY_BODY_HEIGHT = 16;
const CHUNKY_HALF_WIDTH = CHUNKY_BODY_WIDTH * 0.5;
const CHUNKY_HALF_HEIGHT = CHUNKY_BODY_HEIGHT * 0.5;
const MONSTER_HITBOX_RADIUS = 6;
const CHUNKY_HITBOX_RADIUS = 6;
const MONSTER_CLEANUP_MARGIN = 48;
const MAX_MONSTERS = 6;

const ASSIST_RADIUS = 16;

const STATE_STOPPED = "STOPPED";
const STATE_RUNNING = "RUNNING";
const STATE_FALLING = "FALLING";
const STATE_JUMPING = "JUMPING";

const TILE_DEPTH = 0;
const CHUNKY_DEPTH = 1;
const MONSTER_DEPTH = 2;

function cellKey(gridX, gridY) {
  return `${gridX},${gridY}`;
}

function distanceSquared(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return (dx * dx) + (dy * dy);
}

class LoadingScene extends Phaser.Scene {
  constructor() {
    super("loading");
  }

  preload() {
    this.load.image("game-bg", "assets/game-bg.jpg");
    this.load.image("tile", "assets/tile.png");
    this.load.image("chunky1", "assets/chunky1.png");
    this.load.image("chunky2", "assets/chunky2.png");
    this.load.image("monster1a", "assets/monster1-1.png");
    this.load.image("monster1b", "assets/monster1-2.png");
    this.load.image("monster2a", "assets/monster2-1.png");
    this.load.image("monster2b", "assets/monster2-2.png");
    this.load.audio("bg", "assets/bg.ogg");
    this.load.audio("collision", "assets/collision.ogg");

    this.cameras.main.setBackgroundColor(0x101418);

    const barWidth = 192;
    const barHeight = 8;
    const barX = (GAME_WIDTH - barWidth) * 0.5;
    const barY = (GAME_HEIGHT - barHeight) * 0.5;

    const track = this.add.rectangle(barX, barY, barWidth, barHeight, 0x2b3138);
    track.setOrigin(0, 0);

    const fill = this.add.rectangle(barX + 1, barY + 1, 2, barHeight - 2, 0xeed7c5);
    fill.setOrigin(0, 0);

    this.load.on("progress", (value) => {
      fill.width = Math.max(2, (barWidth - 2) * Math.min(value, 0.98));
    });

    this.load.once("complete", () => {
      fill.width = barWidth - 2;
      this.scene.start("game");
    });
  }
}

class GameScene extends Phaser.Scene {
  constructor() {
    super("game");
  }

  create() {
    this.tiles = new Map();
    this.monsters = [];
    this.isResetting = false;
    this.jumpData = null;

    this.cameras.main.setBackgroundColor(0x101418);
    this.cameras.main.setBounds(0, -100000, 200000, 200000);
    this.cameras.main.roundPixels = true;
    this.cameras.main.setScroll(0, 0);

    this.createBackground();
    this.createAnimations();
    this.createAudio();
    this.createChunky();
    this.resetRun();

    this.input.on("pointerdown", (pointer) => {
      this.tryPlaceTile(pointer, true);
    });

    this.input.on("pointermove", (pointer) => {
      if (pointer.isDown) {
        this.tryPlaceTile(pointer);
      }
    });

    this.input.on("pointerup", () => {
      this.lastPlacedKey = null;
      this.lastPointerCellKey = null;
    });
  }

  update(_, delta) {
    const deltaSeconds = delta / 1000;

    this.elapsedRunTime += delta;
    this.updateChunky(deltaSeconds);
    this.updateMonsters(deltaSeconds);
    this.updateMonsterSpawning();
    this.updateCamera(deltaSeconds);
  }

  createAnimations() {
    if (!this.anims.exists("chunky-run")) {
      this.anims.create({
        key: "chunky-run",
        frames: [{ key: "chunky1" }, { key: "chunky2" }],
        frameRate: 6,
        repeat: -1
      });
    }

    if (!this.anims.exists("monster-type-1")) {
      this.anims.create({
        key: "monster-type-1",
        frames: [{ key: "monster1a" }, { key: "monster1b" }],
        frameRate: 6,
        repeat: -1
      });
    }

    if (!this.anims.exists("monster-type-2")) {
      this.anims.create({
        key: "monster-type-2",
        frames: [{ key: "monster2a" }, { key: "monster2b" }],
        frameRate: 6,
        repeat: -1
      });
    }
  }

  createAudio() {
    if (!this.backgroundMusic) {
      this.backgroundMusic = this.sound.add("bg", {
        loop: true
      });
    }

    if (!this.collisionSound) {
      this.collisionSound = this.sound.add("collision");
    }

    if (!this.backgroundMusic.isPlaying) {
      this.backgroundMusic.play();
    }
  }

  createBackground() {
    this.background = this.add.image(0, 0, "game-bg");
    this.background.setOrigin(0, 0);
    this.background.setDisplaySize(GAME_WIDTH, GAME_HEIGHT);
    this.background.setScrollFactor(0);
    this.background.setDepth(-10);
  }

  createChunky() {
    const startWorld = this.gridToWorld(START_GRID_X, START_GRID_Y);
    this.chunky = this.add.sprite(
      startWorld.x + (TILE_SIZE * 0.5),
      startWorld.y - CHUNKY_HALF_HEIGHT,
      "chunky1"
    );
    this.chunky.setOrigin(0.5, 0.5);
    this.chunky.setDepth(CHUNKY_DEPTH);
    this.chunky.play("chunky-run");
    this.chunky.setFlipX(false);
  }

  tryPlaceTile(pointer, force = false) {
    const baseCell = this.getPointerBaseCell(pointer);
    if (!baseCell) {
      return false;
    }

    const pointerCellKey = cellKey(baseCell.gridX, baseCell.gridY);
    if (!force && pointerCellKey === this.lastPointerCellKey) {
      return false;
    }

    this.lastPointerCellKey = pointerCellKey;

    const cell = this.resolvePlacementCell(pointer);
    if (!cell) {
      return false;
    }

    const key = cellKey(cell.gridX, cell.gridY);

    if (force && this.isCellOccupied(cell.gridX, cell.gridY)) {
      if (this.isChunkyUsingCell(cell.gridX, cell.gridY)) {
        return false;
      }

      const didRemove = this.removeTileAt(cell.gridX, cell.gridY);
      if (didRemove) {
        this.lastPlacedKey = key;
      }
      return didRemove;
    }

    if (key === this.lastPlacedKey) {
      return false;
    }

    if (this.doesCellOverlapChunky(cell.gridX, cell.gridY)) {
      return false;
    }

    const didPlace = this.placeTileAt(cell.gridX, cell.gridY);
    this.lastPlacedKey = key;
    return didPlace;
  }

  getPointerBaseCell(pointer) {
    if (!pointer) {
      return null;
    }

    const worldPoint = pointer.positionToCamera(this.cameras.main);
    return this.worldToGrid(worldPoint.x, worldPoint.y);
  }

  resolvePlacementCell(pointer) {
    if (!pointer) {
      return null;
    }

    const worldPoint = pointer.positionToCamera(this.cameras.main);
    const nearest = this.worldToGrid(worldPoint.x, worldPoint.y);

    if (this.isCellOccupied(nearest.gridX, nearest.gridY)) {
      return nearest;
    }

    const candidates = [];
    const radiusSquared = ASSIST_RADIUS * ASSIST_RADIUS;

    for (const key of this.tiles.keys()) {
      const [gridXText, gridYText] = key.split(",");
      const tileGridX = Number(gridXText);
      const tileGridY = Number(gridYText);
      const tileCenterX = (tileGridX * TILE_SIZE) + (TILE_SIZE * 0.5);
      const tileCenterY = (tileGridY * TILE_SIZE) + (TILE_SIZE * 0.5);

      if (distanceSquared(worldPoint.x, worldPoint.y, tileCenterX, tileCenterY) > radiusSquared) {
        continue;
      }

      const neighbors = [
        { gridX: tileGridX - 1, gridY: tileGridY },
        { gridX: tileGridX + 1, gridY: tileGridY },
        { gridX: tileGridX, gridY: tileGridY - 1 },
        { gridX: tileGridX, gridY: tileGridY + 1 }
      ];

      for (const neighbor of neighbors) {
        if (this.isCellOccupied(neighbor.gridX, neighbor.gridY)) {
          continue;
        }

        const centerX = (neighbor.gridX * TILE_SIZE) + (TILE_SIZE * 0.5);
        const centerY = (neighbor.gridY * TILE_SIZE) + (TILE_SIZE * 0.5);
        const candidateDistance = distanceSquared(worldPoint.x, worldPoint.y, centerX, centerY);

        if (candidateDistance <= radiusSquared) {
          candidates.push({
            gridX: neighbor.gridX,
            gridY: neighbor.gridY,
            distance: candidateDistance
          });
        }
      }
    }

    if (candidates.length > 0) {
      candidates.sort((a, b) => a.distance - b.distance);
      return {
        gridX: candidates[0].gridX,
        gridY: candidates[0].gridY
      };
    }

    return nearest;
  }

  placeTileAt(gridX, gridY) {
    const key = cellKey(gridX, gridY);
    if (this.tiles.has(key)) {
      return false;
    }

    const world = this.gridToWorld(gridX, gridY);
    const tile = this.add.image(world.x, world.y, "tile");
    tile.setOrigin(0, 0);
    tile.setDepth(TILE_DEPTH);
    this.tiles.set(key, tile);
    return true;
  }

  removeTileAt(gridX, gridY) {
    const key = cellKey(gridX, gridY);
    const tile = this.tiles.get(key);
    if (!tile) {
      return false;
    }

    tile.destroy();
    this.tiles.delete(key);
    return true;
  }

  clearTiles() {
    for (const tile of this.tiles.values()) {
      tile.destroy();
    }
    this.tiles.clear();
  }

  updateChunky(deltaSeconds) {
    if (this.chunkyState === STATE_JUMPING) {
      this.updateJump(deltaSeconds);
      return;
    }

    if (this.chunkyState === STATE_FALLING) {
      this.updateFall(deltaSeconds);
      return;
    }

    const support = this.getCurrentSupport();
    if (!support) {
      this.startFall(Math.floor(this.chunky.x / TILE_SIZE));
      return;
    }

    this.chunky.y = this.getSupportTopY(support.gridY) - CHUNKY_HALF_HEIGHT;

    const blockerKey = this.getBlockingTileAhead(support);
    if (blockerKey && this.isAtBlockingFace(support)) {
      if (this.canJumpOntoBlocker(support)) {
        this.startJumpOntoBlocker(support);
        return;
      }

      this.chunkyState = STATE_STOPPED;
      return;
    }

    if (this.hasWalkableTileAhead(support)) {
      this.chunkyState = STATE_RUNNING;
      this.moveGrounded(deltaSeconds);
      return;
    }

    const dropColumn = support.gridX + 1;
    const landing = this.findLandingBelow(dropColumn, support.gridY);
    if (landing) {
      this.chunkyState = STATE_RUNNING;
      this.walkToEdgeAndStartFall(deltaSeconds, support, dropColumn);
      return;
    }

    this.stopAtEdge(deltaSeconds, support);
  }

  moveGrounded(deltaSeconds) {
    this.chunky.x += CHUNKY_SPEED * deltaSeconds;
  }

  walkToEdgeAndStartFall(deltaSeconds, support, dropColumn) {
    const targetX = this.getDropCenterX(dropColumn);
    const nextX = this.chunky.x + (CHUNKY_SPEED * deltaSeconds);

    this.chunky.x = Math.min(nextX, targetX);
    if (this.chunky.x >= targetX) {
      this.startFall(dropColumn);
    }
  }

  startFall(dropColumn) {
    this.chunkyState = STATE_FALLING;
    this.fallColumn = dropColumn;
    this.jumpData = null;
    this.chunky.x = this.getDropCenterX(dropColumn);
  }

  canJumpOntoBlocker(support) {
    const landingGridX = support.gridX + 1;
    const landingGridY = support.gridY - 1;

    if (!this.isCellOccupied(landingGridX, landingGridY)) {
      return false;
    }

    if (this.isCellOccupied(landingGridX, landingGridY - 1)) {
      return false;
    }

    return true;
  }

  startJumpOntoBlocker(support) {
    const landingGridX = support.gridX + 1;
    const landingGridY = support.gridY - 1;

    this.jumpData = {
      startX: this.chunky.x,
      startY: this.chunky.y,
      targetX: this.getDropCenterX(landingGridX),
      targetY: this.getSupportTopY(landingGridY) - CHUNKY_HALF_HEIGHT,
      elapsed: 0
    };
    this.chunkyState = STATE_JUMPING;
  }

  updateJump(deltaSeconds) {
    if (!this.jumpData) {
      this.chunkyState = STATE_STOPPED;
      return;
    }

    this.jumpData.elapsed += deltaSeconds;
    const progress = Math.min(this.jumpData.elapsed / JUMP_DURATION, 1);
    const arcOffset = Math.sin(progress * Math.PI) * JUMP_HEIGHT;

    this.chunky.x = Phaser.Math.Linear(this.jumpData.startX, this.jumpData.targetX, progress);
    this.chunky.y = Phaser.Math.Linear(this.jumpData.startY, this.jumpData.targetY, progress) - arcOffset;

    if (progress < 1) {
      return;
    }

    this.chunky.x = this.jumpData.targetX;
    this.chunky.y = this.jumpData.targetY;
    this.jumpData = null;
    this.chunkyState = STATE_STOPPED;
  }

  updateFall(deltaSeconds) {
    const previousBottom = this.chunky.y + CHUNKY_HALF_HEIGHT;
    const nextBottom = previousBottom + (FALL_SPEED * deltaSeconds);

    const landing = this.findTouchedLandingInColumn(this.fallColumn, previousBottom, nextBottom);
    if (landing) {
      this.chunky.y = this.getSupportTopY(landing.gridY) - CHUNKY_HALF_HEIGHT;
      this.chunkyState = STATE_STOPPED;
      this.fallColumn = null;
      return;
    }

    this.chunky.y += FALL_SPEED * deltaSeconds;
  }

  updateMonsters(deltaSeconds) {
    for (let index = this.monsters.length - 1; index >= 0; index -= 1) {
      const monster = this.monsters[index];
      const deltaX = this.chunky.x - monster.x;
      const deltaY = this.chunky.y - monster.y;
      const distance = Math.hypot(deltaX, deltaY);

      if (distance > 0.0001) {
        const step = MONSTER_SPEED * deltaSeconds;
        monster.x += (deltaX / distance) * step;
        monster.y += (deltaY / distance) * step;
      }

      if (this.monsterTouchesChunky(monster)) {
        this.handleDeath();
        return;
      }

      if (this.isMonsterVisible(monster)) {
        monster.wasVisible = true;
      } else if (monster.wasVisible || this.isMonsterStale(monster)) {
        monster.destroy();
        this.monsters.splice(index, 1);
        this.respawnMonsterImmediately();
      }
    }
  }

  monsterTouchesChunky(monster) {
    const dx = monster.x - this.chunky.x;
    const dy = monster.y - this.chunky.y;
    const combinedRadius = MONSTER_HITBOX_RADIUS + CHUNKY_HITBOX_RADIUS;
    return ((dx * dx) + (dy * dy)) <= (combinedRadius * combinedRadius);
  }

  updateMonsterSpawning() {
    if (this.time.now < this.nextMonsterSpawnAt) {
      return;
    }

    if (this.monsters.length >= MAX_MONSTERS) {
      this.nextMonsterSpawnAt = Number.POSITIVE_INFINITY;
      return;
    }

    this.spawnMonstersForSpawnTick();

    if (this.monsters.length >= MAX_MONSTERS) {
      this.nextMonsterSpawnAt = Number.POSITIVE_INFINITY;
      return;
    }

    this.scheduleNextMonster();
  }

  scheduleNextMonster(firstSpawn = false) {
    if (firstSpawn) {
      this.nextMonsterSpawnAt = this.time.now + FIRST_MONSTER_DELAY;
      return;
    }

    this.nextMonsterSpawnAt = this.time.now + MONSTER_SPAWN_INTERVAL;
  }

  spawnMonstersForSpawnTick() {
    if (this.monsters.length >= MAX_MONSTERS) {
      return;
    }

    const availableEdges = Phaser.Utils.Array.Shuffle([0, 1, 2, 3]);
    const spawnCount = Math.min(
      MONSTERS_PER_SPAWN,
      MAX_MONSTERS - this.monsters.length
    );

    for (let index = 0; index < spawnCount; index += 1) {
      const edge = availableEdges[index % availableEdges.length];
      this.spawnMonsterFromEdge(edge);
    }
  }

  spawnMonsterFromEdge(edge) {
    if (this.monsters.length >= MAX_MONSTERS) {
      return;
    }

    const camera = this.cameras.main;
    const edgePadding = 16;
    let spawnX = 0;
    let spawnY = 0;

    if (edge === 0) {
      spawnX = Phaser.Math.Between(Math.floor(camera.scrollX), Math.floor(camera.scrollX + GAME_WIDTH));
      spawnY = camera.scrollY - edgePadding;
    } else if (edge === 1) {
      spawnX = camera.scrollX + GAME_WIDTH + edgePadding;
      spawnY = Phaser.Math.Between(Math.floor(camera.scrollY), Math.floor(camera.scrollY + GAME_HEIGHT));
    } else if (edge === 2) {
      spawnX = Phaser.Math.Between(Math.floor(camera.scrollX), Math.floor(camera.scrollX + GAME_WIDTH));
      spawnY = camera.scrollY + GAME_HEIGHT + edgePadding;
    } else {
      spawnX = camera.scrollX - edgePadding;
      spawnY = Phaser.Math.Between(Math.floor(camera.scrollY), Math.floor(camera.scrollY + GAME_HEIGHT));
    }

    const monsterType = Phaser.Math.Between(0, 1) === 0 ? "monster-type-1" : "monster-type-2";
    const monsterTexture = monsterType === "monster-type-1" ? "monster1a" : "monster2a";
    const monster = this.add.sprite(spawnX, spawnY, monsterTexture);
    monster.setOrigin(0.5, 0.5);
    monster.setDepth(MONSTER_DEPTH);
    monster.play(monsterType);
    monster.wasVisible = false;
    this.monsters.push(monster);
  }

  fillMonsterSlots() {
    while (this.monsters.length < MAX_MONSTERS) {
      this.spawnMonsterFromEdge(Phaser.Math.Between(0, 3));
    }
  }

  respawnMonsterImmediately() {
    if (this.monsters.length >= MAX_MONSTERS) {
      return;
    }

    this.spawnMonsterFromEdge(Phaser.Math.Between(0, 3));
  }

  isMonsterVisible(monster) {
    const camera = this.cameras.main;
    return (
      monster.x >= camera.scrollX &&
      monster.x <= camera.scrollX + GAME_WIDTH &&
      monster.y >= camera.scrollY &&
      monster.y <= camera.scrollY + GAME_HEIGHT
    );
  }

  isMonsterStale(monster) {
    const camera = this.cameras.main;
    return (
      monster.x < camera.scrollX - MONSTER_CLEANUP_MARGIN ||
      monster.x > camera.scrollX + GAME_WIDTH + MONSTER_CLEANUP_MARGIN ||
      monster.y < camera.scrollY - MONSTER_CLEANUP_MARGIN ||
      monster.y > camera.scrollY + GAME_HEIGHT + MONSTER_CLEANUP_MARGIN
    );
  }

  clearMonsters() {
    for (const monster of this.monsters) {
      monster.destroy();
    }
    this.monsters.length = 0;
  }

  handleDeath() {
    if (this.isResetting) {
      return;
    }

    this.isResetting = true;
    if (this.collisionSound) {
      this.collisionSound.play();
    }
    this.resetRun();
    this.isResetting = false;
  }

  resetRun() {
    this.clearTiles();
    this.clearMonsters();

    this.chunkyState = STATE_STOPPED;
    this.chunkyDirection = 1;
    this.fallColumn = null;
    this.jumpData = null;
    this.lastPlacedKey = null;
    this.lastPointerCellKey = null;
    this.elapsedRunTime = 0;

    this.placeTileAt(START_GRID_X, START_GRID_Y);

    const startWorld = this.gridToWorld(START_GRID_X, START_GRID_Y);
    this.chunky.x = startWorld.x + (TILE_SIZE * 0.5);
    this.chunky.y = startWorld.y - CHUNKY_HALF_HEIGHT;
    this.chunky.setFlipX(false);

    this.cameras.main.setScroll(0, 0);
    this.scheduleNextMonster(true);
  }

  stopAtEdge(deltaSeconds, support) {
    const supportRight = (support.gridX * TILE_SIZE) + TILE_SIZE;
    const targetX = supportRight - CHUNKY_HALF_WIDTH;
    const nextX = this.chunky.x + (CHUNKY_SPEED * deltaSeconds);

    this.chunky.x = Math.min(nextX, targetX);
    if (this.chunky.x >= targetX) {
      this.chunkyState = STATE_STOPPED;
    } else {
      this.chunkyState = STATE_RUNNING;
    }
  }

  getCurrentSupport() {
    const footY = this.chunky.y + CHUNKY_HALF_HEIGHT + 0.5;
    const gridY = Math.floor(footY / TILE_SIZE);
    const leftFootGridX = Math.floor((this.chunky.x - CHUNKY_HALF_WIDTH + 1) / TILE_SIZE);
    const rightFootGridX = Math.floor((this.chunky.x + CHUNKY_HALF_WIDTH - 1) / TILE_SIZE);
    const occupied = [];

    if (this.isCellOccupied(leftFootGridX, gridY)) {
      occupied.push(leftFootGridX);
    }

    if (rightFootGridX !== leftFootGridX && this.isCellOccupied(rightFootGridX, gridY)) {
      occupied.push(rightFootGridX);
    }

    if (occupied.length === 0) {
      return null;
    }

    return {
      gridX: Math.max(...occupied),
      gridY
    };
  }

  getBlockingTileAhead(support) {
    const blockerGridX = support.gridX + 1;
    const blockerGridY = support.gridY - 1;

    if (!this.isCellOccupied(blockerGridX, blockerGridY)) {
      return null;
    }

    return cellKey(blockerGridX, blockerGridY);
  }

  isAtBlockingFace(support) {
    const blockerLeft = (support.gridX + 1) * TILE_SIZE;
    const frontX = this.chunky.x + CHUNKY_HALF_WIDTH;
    return frontX >= blockerLeft;
  }

  hasWalkableTileAhead(support) {
    return this.isCellOccupied(support.gridX + 1, support.gridY);
  }

  findLandingBelow(gridX, supportGridY) {
    for (let gridY = supportGridY + 1; gridY < supportGridY + 256; gridY += 1) {
      if (this.isCellOccupied(gridX, gridY)) {
        return { gridX, gridY };
      }
    }

    return null;
  }

  findTouchedLandingInColumn(gridX, previousBottom, nextBottom) {
    if (gridX === null) {
      return null;
    }

    const startGridY = Math.floor(previousBottom / TILE_SIZE);
    const endGridY = Math.floor(nextBottom / TILE_SIZE);

    for (let gridY = startGridY; gridY <= endGridY; gridY += 1) {
      if (!this.isCellOccupied(gridX, gridY)) {
        continue;
      }

      const tileTop = this.getSupportTopY(gridY);
      if (tileTop >= previousBottom && tileTop <= nextBottom) {
        return { gridX, gridY };
      }
    }

    return null;
  }

  getSupportTopY(gridY) {
    return gridY * TILE_SIZE;
  }

  getDropCenterX(gridX) {
    return (gridX * TILE_SIZE) + (TILE_SIZE * 0.5);
  }

  gridToWorld(gridX, gridY) {
    return {
      x: gridX * TILE_SIZE,
      y: gridY * TILE_SIZE
    };
  }

  worldToGrid(worldX, worldY) {
    return {
      gridX: Math.round((worldX - (TILE_SIZE * 0.5)) / TILE_SIZE),
      gridY: Math.round((worldY - (TILE_SIZE * 0.5)) / TILE_SIZE)
    };
  }

  isCellOccupied(gridX, gridY) {
    return this.tiles.has(cellKey(gridX, gridY));
  }

  isChunkyUsingCell(gridX, gridY) {
    const supportCells = this.getChunkySupportCells();
    for (const supportCell of supportCells) {
      if (supportCell.gridX === gridX && supportCell.gridY === gridY) {
        return true;
      }
    }

    return false;
  }

  getChunkySupportCells() {
    const footY = this.chunky.y + CHUNKY_HALF_HEIGHT + 0.5;
    const gridY = Math.floor(footY / TILE_SIZE);
    const leftFootGridX = Math.floor((this.chunky.x - CHUNKY_HALF_WIDTH + 1) / TILE_SIZE);
    const rightFootGridX = Math.floor((this.chunky.x + CHUNKY_HALF_WIDTH - 1) / TILE_SIZE);
    const cells = [];

    if (this.isCellOccupied(leftFootGridX, gridY)) {
      cells.push({ gridX: leftFootGridX, gridY });
    }

    if (rightFootGridX !== leftFootGridX && this.isCellOccupied(rightFootGridX, gridY)) {
      cells.push({ gridX: rightFootGridX, gridY });
    }

    return cells;
  }

  doesCellOverlapChunky(gridX, gridY) {
    const tileLeft = gridX * TILE_SIZE;
    const tileTop = gridY * TILE_SIZE;
    const tileRight = tileLeft + TILE_SIZE;
    const tileBottom = tileTop + TILE_SIZE;

    const chunkyLeft = this.chunky.x - CHUNKY_HALF_WIDTH;
    const chunkyTop = this.chunky.y - CHUNKY_HALF_HEIGHT;
    const chunkyRight = this.chunky.x + CHUNKY_HALF_WIDTH;
    const chunkyBottom = this.chunky.y + CHUNKY_HALF_HEIGHT;

    return !(
      tileRight <= chunkyLeft ||
      tileLeft >= chunkyRight ||
      tileBottom <= chunkyTop ||
      tileTop >= chunkyBottom
    );
  }

  updateCamera(deltaSeconds) {
    const followFactorX = 1 - Math.pow(1 - CAMERA_LERP_X, deltaSeconds * 60);
    const baseLerpY = this.chunkyState === STATE_FALLING ? CAMERA_FALL_LERP_Y : CAMERA_LERP_Y;
    const followFactorY = 1 - Math.pow(1 - baseLerpY, deltaSeconds * 60);

    const targetScreenX = CAMERA_RIGHT_SCREEN_X;
    const targetScreenY = this.chunkyState === STATE_FALLING ? CAMERA_FALL_SCREEN_Y : CAMERA_SCREEN_Y;
    const targetScrollX = Math.max(0, this.chunky.x - targetScreenX);
    const targetScrollY = this.chunky.y - targetScreenY;

    this.cameras.main.setScroll(
      Phaser.Math.Linear(this.cameras.main.scrollX, targetScrollX, followFactorX),
      Phaser.Math.Linear(this.cameras.main.scrollY, targetScrollY, followFactorY)
    );
  }
}

const config = {
  type: Phaser.AUTO,
  parent: "game",
  width: GAME_WIDTH,
  height: GAME_HEIGHT,
  backgroundColor: "#101418",
  pixelArt: true,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width: GAME_WIDTH,
    height: GAME_HEIGHT
  },
  scene: [LoadingScene, GameScene]
};

window.game = new Phaser.Game(config);
