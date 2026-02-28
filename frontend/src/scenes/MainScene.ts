import Phaser from 'phaser';
import { ApiClient, WorldState, AgentState } from '../ApiClient';
import { WorldRenderer, TILE_SIZE } from '../WorldRenderer';
import { CHARACTER_NAMES } from './BootScene';
import { UIPanel } from '../UIPanel';
import { FALLBACK_AGENTS } from '../fallbackWorld';

const PLAYER_SPEED = 160;
const AGENT_SPEED = 60; // pixels per second for agent walking
const DEFAULT_PLAYER_SPRITE = 'Adam_Smith';

// Per-agent visual + pathfinding state
interface AgentVisual {
  sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  nameTag: Phaser.GameObjects.Text;
  actionTag: Phaser.GameObjects.Text;
  spriteName: string;
  path: { x: number; y: number }[];
  pathIndex: number;
  walking: boolean;
}

export class MainScene extends Phaser.Scene {
  private apiClient!: ApiClient;
  private worldState: WorldState | null = null;
  private worldRenderer!: WorldRenderer;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private keysDown: Record<string, boolean> = {};
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private agentVisuals: Map<string, AgentVisual> = new Map();
  private initialized: boolean = false;
  private uiPanel!: UIPanel;

  constructor() {
    super({ key: 'MainScene' });
  }

  async create(): Promise<void> {
    this.apiClient = new ApiClient();

    // Build the tilemap world
    this.worldRenderer = new WorldRenderer(this);
    const map = this.worldRenderer.buildWorld();

    // Create walking animations for each character atlas
    this.createCharacterAnimations();

    // Create the player sprite
    this.createPlayer(map);

    // Camera setup
    this.cameras.main.setBounds(0, 0, this.worldRenderer.getMapWidthPx(), this.worldRenderer.getMapHeightPx());
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    // Input
    this.cursors = this.input.keyboard!.createCursorKeys();
    if (this.cursors.space) {
      this.input.keyboard!.removeCapture(Phaser.Input.Keyboard.KeyCodes.SPACE);
    }
    const onKeyDown = (e: KeyboardEvent) => { this.keysDown[e.code] = true; };
    const onKeyUp = (e: KeyboardEvent) => { this.keysDown[e.code] = false; };
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    this.events.on('shutdown', () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
    });

    // Scroll-to-zoom
    this.input.on('wheel', (_p: unknown, _gx: unknown, _gy: unknown, _dx: unknown, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.4, 3));
    });

    // Try fetching agents from backend, fall back to sample agents
    let backendAvailable = false;
    let agents: AgentState[] = FALLBACK_AGENTS;
    try {
      this.worldState = await this.apiClient.fetchState();
      backendAvailable = true;
      agents = this.worldState.agents;
    } catch {
      console.warn('Backend unavailable — using fallback agents');
    }
    this.renderAgents(agents);

    // HUD
    const mode = backendAvailable ? '' : ' [OFFLINE]';
    const agentCount = agents.length;
    this.add.text(10, 10, `WASD / Arrows = move   Scroll = zoom${mode}`, {
      fontSize: '14px', color: '#ffffff',
      backgroundColor: '#000000aa', padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(1000);

    this.add.text(10, 35, `Agents: ${agentCount}`, {
      fontSize: '12px', color: '#aaffaa',
      backgroundColor: '#000000aa', padding: { x: 6, y: 4 },
    }).setScrollFactor(0).setDepth(1000);

    // UI Panel
    this.uiPanel = new UIPanel(this.apiClient);
    this.uiPanel.setAgents(agents);

    // WebSocket for live updates
    if (backendAvailable) {
      this.apiClient.onStateUpdate((state: WorldState) => {
        this.worldState = state;
        this.updateAgentPositions(state.agents);
        this.uiPanel.setAgents(state.agents);
      });
      this.apiClient.connectWebSocket();
    }

    this.initialized = true;
  }

  update(): void {
    if (!this.initialized) return;

    // Player movement
    const ae = document.activeElement;
    const isTyping = ae instanceof HTMLInputElement || ae instanceof HTMLTextAreaElement;
    if (isTyping) {
      this.player.setVelocity(0, 0);
      this.player.anims.stop();
    } else {
      this.updatePlayerMovement();
    }

    // Step all agents along their paths
    this.updateAgentWalking();
  }

  private updatePlayerMovement(): void {
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.keysDown['KeyA']) vx = -PLAYER_SPEED;
    else if (this.cursors.right.isDown || this.keysDown['KeyD']) vx = PLAYER_SPEED;
    if (this.cursors.up.isDown || this.keysDown['KeyW']) vy = -PLAYER_SPEED;
    else if (this.cursors.down.isDown || this.keysDown['KeyS']) vy = PLAYER_SPEED;

    this.player.setVelocity(vx, vy);
    if (vx !== 0 && vy !== 0) {
      this.player.setVelocity(vx * 0.707, vy * 0.707);
    }

    const spriteKey = DEFAULT_PLAYER_SPRITE;
    if (vx < 0) {
      this.player.anims.play(`${spriteKey}_left_walk`, true);
    } else if (vx > 0) {
      this.player.anims.play(`${spriteKey}_right_walk`, true);
    } else if (vy < 0) {
      this.player.anims.play(`${spriteKey}_up_walk`, true);
    } else if (vy > 0) {
      this.player.anims.play(`${spriteKey}_down_walk`, true);
    } else {
      this.player.anims.stop();
      const currentAnim = this.player.anims.currentAnim;
      if (currentAnim) {
        const dir = currentAnim.key.includes('left') ? 'left' :
                    currentAnim.key.includes('right') ? 'right' :
                    currentAnim.key.includes('up') ? 'up' : 'down';
        this.player.setFrame(dir);
      }
    }
  }

  // ── Agent path-walking each frame ──────────────────────────────────

  private updateAgentWalking(): void {
    for (const [, av] of this.agentVisuals) {
      if (!av.walking || av.path.length === 0) continue;

      const target = av.path[av.pathIndex];
      const tpx = target.x * TILE_SIZE + TILE_SIZE / 2;
      const tpy = target.y * TILE_SIZE + TILE_SIZE / 2;
      const dx = tpx - av.sprite.x;
      const dy = tpy - av.sprite.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      if (dist < 2) {
        // Arrived at this waypoint
        av.sprite.setPosition(tpx, tpy);
        av.pathIndex++;
        if (av.pathIndex >= av.path.length) {
          // Path complete
          av.walking = false;
          av.path = [];
          av.pathIndex = 0;
          av.sprite.setVelocity(0, 0);
          av.sprite.anims.stop();
          // Set idle frame facing last direction
          const currentAnim = av.sprite.anims.currentAnim;
          if (currentAnim) {
            const dir = currentAnim.key.includes('left') ? 'left' :
                        currentAnim.key.includes('right') ? 'right' :
                        currentAnim.key.includes('up') ? 'up' : 'down';
            av.sprite.setFrame(dir);
          }
        }
      } else {
        // Move toward the waypoint
        const angle = Math.atan2(dy, dx);
        av.sprite.setVelocity(
          Math.cos(angle) * AGENT_SPEED,
          Math.sin(angle) * AGENT_SPEED,
        );

        // Play walking animation based on dominant direction
        const animDir = Math.abs(dx) > Math.abs(dy)
          ? (dx < 0 ? 'left' : 'right')
          : (dy < 0 ? 'up' : 'down');
        const animKey = `${av.spriteName}_${animDir}_walk`;
        if (this.anims.exists(animKey)) {
          av.sprite.anims.play(animKey, true);
        }
      }

      // Keep labels following the sprite
      av.nameTag.setPosition(av.sprite.x, av.sprite.y - 20);
      av.actionTag.setPosition(av.sprite.x, av.sprite.y + 18);
    }
  }

  // ── Character animations ───────────────────────────────────────────

  private createCharacterAnimations(): void {
    const directions = ['down', 'left', 'right', 'up'];

    for (const name of CHARACTER_NAMES) {
      if (!this.textures.exists(name)) continue;

      for (const dir of directions) {
        this.anims.create({
          key: `${name}_${dir}_walk`,
          frames: [
            { key: name, frame: `${dir}-walk.000` },
            { key: name, frame: `${dir}-walk.001` },
            { key: name, frame: `${dir}-walk.002` },
            { key: name, frame: `${dir}-walk.003` },
          ],
          frameRate: 4,
          repeat: -1,
        });
      }
    }
  }

  // ── Player ─────────────────────────────────────────────────────────

  private createPlayer(map: Phaser.Tilemaps.Tilemap): void {
    const spawnX = Math.floor(map.width / 2) * TILE_SIZE + TILE_SIZE / 2;
    const spawnY = Math.floor(map.height / 2) * TILE_SIZE + TILE_SIZE / 2;

    this.player = this.physics.add.sprite(spawnX, spawnY, DEFAULT_PLAYER_SPRITE, 'down');
    this.player.setDepth(4);
    this.player.body.setSize(20, 20);
    this.player.body.setOffset(6, 12);

    const collisionLayer = this.worldRenderer.getCollisionLayer();
    if (collisionLayer) {
      this.physics.add.collider(this.player, collisionLayer);
    }

    const tag = this.add.text(0, 0, 'YOU', {
      fontSize: '10px', fontStyle: 'bold', color: '#ffc107',
      backgroundColor: '#000000cc', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(1000);

    this.events.on('update', () => {
      tag.setPosition(this.player.x, this.player.y - 20);
    });
  }

  // ── Agent rendering ────────────────────────────────────────────────

  private renderAgents(agents: AgentState[]): void {
    for (const agent of agents) {
      this.createAgentSprite(agent);
    }
  }

  private createAgentSprite(agent: AgentState): void {
    const px = agent.x * TILE_SIZE + TILE_SIZE / 2;
    const py = agent.y * TILE_SIZE + TILE_SIZE / 2;

    const spriteName = agent.sprite_key || agent.name.replace(/ /g, '_');

    // Create as a physics sprite so it collides with the tilemap
    let sprite: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
    if (this.textures.exists(spriteName)) {
      sprite = this.physics.add.sprite(px, py, spriteName, 'down');
    } else {
      // Use a known character as fallback visual
      sprite = this.physics.add.sprite(px, py, 'Adam_Smith', 'down');
    }
    sprite.setDepth(4);
    sprite.body.setSize(20, 20);
    sprite.body.setOffset(6, 12);

    // Add collision with the tilemap
    const collisionLayer = this.worldRenderer.getCollisionLayer();
    if (collisionLayer) {
      this.physics.add.collider(sprite, collisionLayer);
    }

    const nameTag = this.add.text(px, py - 20, agent.name, {
      fontSize: '10px', color: '#ffffff',
      backgroundColor: '#000000cc', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setDepth(1000);

    const actionTag = this.add.text(px, py + 18, agent.current_action, {
      fontSize: '9px', color: '#cccccc',
      backgroundColor: '#00000088', padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 0).setDepth(1000);

    this.agentVisuals.set(agent.id, {
      sprite,
      nameTag,
      actionTag,
      spriteName,
      path: [],
      pathIndex: 0,
      walking: false,
    });
  }

  private updateAgentPositions(agents: AgentState[]): void {
    for (const agent of agents) {
      const av = this.agentVisuals.get(agent.id);
      if (!av) {
        this.createAgentSprite(agent);
        continue;
      }

      // Update action label
      av.actionTag.setText(agent.current_action);

      const targetTileX = agent.x;
      const targetTileY = agent.y;
      const currentTileX = Math.floor(av.sprite.x / TILE_SIZE);
      const currentTileY = Math.floor(av.sprite.y / TILE_SIZE);

      // Only pathfind if the target tile actually changed
      if (targetTileX === currentTileX && targetTileY === currentTileY) continue;

      // Compute A* path from current position to target
      const path = this.findPath(currentTileX, currentTileY, targetTileX, targetTileY);
      if (path.length > 0) {
        av.path = path;
        av.pathIndex = 0;
        av.walking = true;
      } else {
        // No path found — teleport as last resort (e.g. across unreachable zones)
        const tpx = targetTileX * TILE_SIZE + TILE_SIZE / 2;
        const tpy = targetTileY * TILE_SIZE + TILE_SIZE / 2;
        av.sprite.setPosition(tpx, tpy);
        av.nameTag.setPosition(tpx, tpy - 20);
        av.actionTag.setPosition(tpx, tpy + 18);
        av.walking = false;
        av.path = [];
      }
    }
  }

  // ── A* Pathfinding ─────────────────────────────────────────────────

  private findPath(
    startX: number, startY: number,
    endX: number, endY: number,
    maxIterations: number = 2000,
  ): { x: number; y: number }[] {
    // If destination is blocked, try to get as close as possible
    if (this.worldRenderer.isBlocked(endX, endY)) {
      // Find nearest unblocked tile to the target
      const alt = this.findNearestOpen(endX, endY);
      if (!alt) return [];
      endX = alt.x;
      endY = alt.y;
    }

    if (startX === endX && startY === endY) return [];

    const key = (x: number, y: number) => `${x},${y}`;
    const heuristic = (x: number, y: number) =>
      Math.abs(x - endX) + Math.abs(y - endY);

    const open: { x: number; y: number; g: number; f: number }[] = [];
    const gScore = new Map<string, number>();
    const cameFrom = new Map<string, { x: number; y: number }>();

    const startKey = key(startX, startY);
    gScore.set(startKey, 0);
    open.push({ x: startX, y: startY, g: 0, f: heuristic(startX, startY) });

    const dirs = [
      { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
      { dx: -1, dy: 0 }, { dx: 1, dy: 0 },
    ];

    let iterations = 0;
    while (open.length > 0 && iterations < maxIterations) {
      iterations++;

      // Find node with lowest f
      let bestIdx = 0;
      for (let i = 1; i < open.length; i++) {
        if (open[i].f < open[bestIdx].f) bestIdx = i;
      }
      const current = open[bestIdx];
      open.splice(bestIdx, 1);

      if (current.x === endX && current.y === endY) {
        // Reconstruct path
        const path: { x: number; y: number }[] = [];
        let node: { x: number; y: number } | undefined = { x: endX, y: endY };
        while (node && !(node.x === startX && node.y === startY)) {
          path.unshift(node);
          node = cameFrom.get(key(node.x, node.y));
        }
        return path;
      }

      for (const dir of dirs) {
        const nx = current.x + dir.dx;
        const ny = current.y + dir.dy;
        if (this.worldRenderer.isBlocked(nx, ny)) continue;

        const nKey = key(nx, ny);
        const tentativeG = current.g + 1;
        const prevG = gScore.get(nKey);
        if (prevG !== undefined && tentativeG >= prevG) continue;

        gScore.set(nKey, tentativeG);
        cameFrom.set(nKey, { x: current.x, y: current.y });
        open.push({ x: nx, y: ny, g: tentativeG, f: tentativeG + heuristic(nx, ny) });
      }
    }

    return []; // No path found
  }

  private findNearestOpen(x: number, y: number): { x: number; y: number } | null {
    for (let r = 1; r <= 5; r++) {
      for (let dx = -r; dx <= r; dx++) {
        for (let dy = -r; dy <= r; dy++) {
          if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue; // only perimeter
          if (!this.worldRenderer.isBlocked(x + dx, y + dy)) {
            return { x: x + dx, y: y + dy };
          }
        }
      }
    }
    return null;
  }
}
