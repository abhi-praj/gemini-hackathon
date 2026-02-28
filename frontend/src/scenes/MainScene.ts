import Phaser from 'phaser';
import { ApiClient, WorldState, AssetRegistry, EnvironmentNode, AgentState } from '../ApiClient';
import { WorldRenderer, SCALED_TILE, FALLBACK_COLORS } from '../WorldRenderer';
import { FALLBACK_SEED_WORLD } from '../fallbackWorld';

const PLAYER_SPEED = 4;
const EDGE_EXPAND_THRESHOLD = 2;
const EXPAND_DEBOUNCE_MS = 5000;

export class MainScene extends Phaser.Scene {
  private apiClient!: ApiClient;
  private worldState!: WorldState;
  private renderer!: WorldRenderer;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private player!: Phaser.GameObjects.Container;
  private agentSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private initialized: boolean = false;
  private lastExpandTime: number = 0;
  private expandingDirections: Set<string> = new Set();
  private debugCollision: boolean = false;
  private debugGfx: Phaser.GameObjects.Graphics | null = null;

  constructor() {
    super({ key: 'MainScene' });
  }

  async create(data: { registry: AssetRegistry | null; failedKeys: Set<string> }): Promise<void> {
    this.apiClient = new ApiClient();

    // Receive sprite load results from BootScene
    const registry = data?.registry ?? null;
    const failedKeys = data?.failedKeys ?? new Set<string>();

    this.renderer = new WorldRenderer(this, registry, failedKeys);

    const loadingText = this.add.text(
      this.scale.width / 2, this.scale.height / 2,
      'Loading world state...', { fontSize: '20px', color: '#ffffff' }
    ).setOrigin(0.5).setDepth(9999).setScrollFactor(0);

    // Try backend, fall back to embedded seed world
    let backendAvailable = false;
    try {
      this.worldState = await this.apiClient.fetchState();
      backendAvailable = true;
    } catch {
      console.warn('Backend unavailable — using embedded seed world');
      this.worldState = FALLBACK_SEED_WORLD as WorldState;
    }

    const root = this.worldState.environment_root;

    // ── Render the world using WorldRenderer ──────────────────
    this.renderer.buildWorld(root);

    // ── Agents ────────────────────────────────────────────────
    this.renderAgents(this.worldState.agents);

    // ── Player ────────────────────────────────────────────────
    this.createPlayer(
      Math.floor(root.x + root.w / 2),
      Math.floor(root.y + root.h / 2)
    );

    // ── Camera ────────────────────────────────────────────────
    const worldW = root.w * SCALED_TILE;
    const worldH = root.h * SCALED_TILE;
    this.cameras.main.setBounds(root.x * SCALED_TILE, root.y * SCALED_TILE, worldW, worldH);
    this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

    // ── Input ─────────────────────────────────────────────────
    this.cursors = this.input.keyboard!.createCursorKeys();
    this.wasd = {
      W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
      A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
      S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
      D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
    };

    // Toggle collision debug overlay with C key
    const cKey = this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.C);
    cKey.on('down', () => this.toggleCollisionDebug());

    // Scroll-to-zoom
    this.input.on('wheel', (_p: unknown, _gx: unknown, _gy: unknown, _dx: unknown, dy: number) => {
      const cam = this.cameras.main;
      cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.4, 3));
    });

    // ── HUD ───────────────────────────────────────────────────
    const mode = backendAvailable ? '' : ' [OFFLINE]';
    this.add.text(10, 10, `WASD / Arrows = move   Scroll = zoom   C = collision${mode}`, {
      fontSize: '14px', color: '#ffffff',
      backgroundColor: '#000000aa', padding: { x: 8, y: 4 },
    }).setScrollFactor(0).setDepth(1000);

    this.add.text(10, 35, `Agents: ${this.worldState.agents.length}`, {
      fontSize: '12px', color: '#aaffaa',
      backgroundColor: '#000000aa', padding: { x: 6, y: 4 },
    }).setScrollFactor(0).setDepth(1000);

    // ── WebSocket for live updates (only if backend available) ─
    if (backendAvailable) {
      this.apiClient.onStateUpdate((state: WorldState) => {
        this.worldState = state;
        this.updateAgentPositions(state.agents);
      });
      this.apiClient.connectWebSocket();
    }

    this.initialized = true;
    loadingText.destroy();
  }

  update(): void {
    if (!this.initialized) return;

    const speed = PLAYER_SPEED;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed;

    if (vx !== 0 || vy !== 0) {
      // Collision check: test the target position before moving
      const newX = this.player.x + vx;
      const newY = this.player.y + vy;

      // Check the tile at the player's center after moving
      const blockedX = this.renderer.isBlockedAtPixel(newX, this.player.y);
      const blockedY = this.renderer.isBlockedAtPixel(this.player.x, newY);

      if (!blockedX) this.player.x = newX;
      if (!blockedY) this.player.y = newY;
    }

    this.checkEdgeExpansion();
  }

  // ── Collision debug overlay ───────────────────────────────────────────

  private toggleCollisionDebug(): void {
    this.debugCollision = !this.debugCollision;

    if (this.debugGfx) {
      this.debugGfx.destroy();
      this.debugGfx = null;
    }

    if (!this.debugCollision) return;

    const root = this.worldState.environment_root;
    this.debugGfx = this.add.graphics();
    this.debugGfx.setDepth(999);

    for (let ty = root.y; ty < root.y + root.h; ty++) {
      for (let tx = root.x; tx < root.x + root.w; tx++) {
        if (this.renderer.isBlocked(tx, ty)) {
          this.debugGfx.fillStyle(0xff0000, 0.25);
          this.debugGfx.fillRect(
            tx * SCALED_TILE, ty * SCALED_TILE,
            SCALED_TILE, SCALED_TILE
          );
        }
      }
    }
  }

  // ── Edge expansion ────────────────────────────────────────────────────

  private checkEdgeExpansion(): void {
    const now = Date.now();
    if (now - this.lastExpandTime < EXPAND_DEBOUNCE_MS) return;

    const root = this.worldState.environment_root;
    const threshold = EDGE_EXPAND_THRESHOLD * SCALED_TILE;

    const px = this.player.x;
    const py = this.player.y;
    const bx = root.x * SCALED_TILE;
    const by = root.y * SCALED_TILE;
    const bw = root.w * SCALED_TILE;
    const bh = root.h * SCALED_TILE;

    let direction: string | null = null;
    if (px - bx < threshold) direction = 'west';
    else if ((bx + bw) - px < threshold) direction = 'east';
    else if (py - by < threshold) direction = 'north';
    else if ((by + bh) - py < threshold) direction = 'south';

    if (direction && !this.expandingDirections.has(direction)) {
      this.triggerExpansion(direction);
    }
  }

  private async triggerExpansion(direction: string): Promise<void> {
    this.expandingDirections.add(direction);
    this.lastExpandTime = Date.now();
    console.log(`Expanding world: ${direction}`);

    try {
      const result = await this.apiClient.expandWorld(
        direction,
        Math.floor(this.player.x / SCALED_TILE),
        Math.floor(this.player.y / SCALED_TILE),
      );

      if (result.success && result.new_zone) {
        const root = this.worldState.environment_root;
        this.renderer.expandWorld(result.new_zone, root);

        // Update camera bounds
        this.cameras.main.setBounds(
          root.x * SCALED_TILE, root.y * SCALED_TILE,
          root.w * SCALED_TILE, root.h * SCALED_TILE
        );
      }
    } catch (e) {
      console.warn('Expansion failed:', e);
    } finally {
      this.expandingDirections.delete(direction);
    }
  }

  // ── Agent rendering ───────────────────────────────────────────────────

  private renderAgents(agents: AgentState[]): void {
    for (const agent of agents) {
      this.createAgentSprite(agent);
    }
  }

  private createAgentSprite(agent: AgentState): void {
    const cx = agent.x * SCALED_TILE + SCALED_TILE / 2;
    const cy = agent.y * SCALED_TILE + SCALED_TILE / 2;

    const hasTexture = this.textures.exists(agent.sprite_key);
    const children: Phaser.GameObjects.GameObject[] = [];

    if (hasTexture) {
      const img = this.add.image(0, 0, agent.sprite_key);
      // Scale character sprite to fit one tile
      const scale = Math.min(SCALED_TILE / img.width, SCALED_TILE / img.height);
      img.setScale(scale);
      children.push(img);
    } else {
      // Fallback colored circle
      const gfx = this.add.graphics();
      const agentColors = [0xff4444, 0x4488ff, 0x44cc44, 0xffaa00, 0xff44ff];
      const colorIdx = Math.abs(agent.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % agentColors.length;
      gfx.fillStyle(agentColors[colorIdx], 1);
      gfx.fillCircle(0, 0, SCALED_TILE * 0.4);
      gfx.lineStyle(2, 0xffffff, 1);
      gfx.strokeCircle(0, 0, SCALED_TILE * 0.4);
      children.push(gfx);
    }

    const nameTag = this.add.text(0, -SCALED_TILE * 0.55, agent.name, {
      fontSize: '10px', color: '#ffffff',
      backgroundColor: '#000000cc', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1);
    children.push(nameTag);

    const actionTag = this.add.text(0, SCALED_TILE * 0.55, agent.current_action, {
      fontSize: '9px', color: '#cccccc',
      backgroundColor: '#00000088', padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 0);
    actionTag.setName('actionLabel');
    children.push(actionTag);

    const container = this.add.container(cx, cy, children);
    container.setDepth(800);
    this.agentSprites.set(agent.id, container);
  }

  private updateAgentPositions(agents: AgentState[]): void {
    for (const agent of agents) {
      const container = this.agentSprites.get(agent.id);
      if (!container) {
        this.createAgentSprite(agent);
        continue;
      }
      const px = agent.x * SCALED_TILE + SCALED_TILE / 2;
      const py = agent.y * SCALED_TILE + SCALED_TILE / 2;
      this.tweens.add({
        targets: container,
        x: px, y: py,
        duration: 300,
        ease: 'Power2',
      });
      const actionLabel = container.getByName('actionLabel') as Phaser.GameObjects.Text;
      if (actionLabel) {
        actionLabel.setText(agent.current_action);
      }
    }
  }

  // ── Player ────────────────────────────────────────────────────────────

  private createPlayer(tileX: number, tileY: number): void {
    const body = this.add.graphics();
    body.fillStyle(0xffc107, 1);
    body.fillCircle(0, 0, SCALED_TILE * 0.35);
    body.lineStyle(2, 0xff6f00, 1);
    body.strokeCircle(0, 0, SCALED_TILE * 0.35);
    // Direction dot
    body.fillStyle(0xff6f00, 1);
    body.fillCircle(0, -SCALED_TILE * 0.2, SCALED_TILE * 0.08);

    const tag = this.add.text(0, -SCALED_TILE * 0.5, 'YOU', {
      fontSize: '10px', fontStyle: 'bold', color: '#ffc107',
      backgroundColor: '#000000cc', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1);

    this.player = this.add.container(
      tileX * SCALED_TILE + SCALED_TILE / 2,
      tileY * SCALED_TILE + SCALED_TILE / 2,
      [body, tag]
    );
    this.player.setDepth(900);
  }
}
