import Phaser from 'phaser';
import { ApiClient, WorldState, AssetRegistry, EnvironmentNode, AgentState } from '../ApiClient';
import { SCALED_TILE } from '../WorldRenderer';

const PLAYER_SPEED = 4;
const EDGE_EXPAND_THRESHOLD = 2;
const EXPAND_DEBOUNCE_MS = 5000;

// ── Tile size config (matches asset_registry._meta) ─────────────────────
const TILE = 16;
const SCALE = 3;
const PX = TILE * SCALE; // 48px per tile on screen

// ── Color palette for placeholder textures ──────────────────────────────
const COLORS: Record<string, { fill: number; label: string }> = {
  // terrain
  grass:        { fill: 0x4caf50, label: '' },
  dirt_path:    { fill: 0xbcaaa4, label: '' },
  road:         { fill: 0x78909c, label: '' },
  water:        { fill: 0x42a5f5, label: '' },
  floor_wood:   { fill: 0xa1887f, label: '' },
  floor_tile:   { fill: 0xe0e0e0, label: '' },
  floor_carpet: { fill: 0x7e57c2, label: '' },

  // structures
  wall_horizontal: { fill: 0x5d4037, label: '=' },
  wall_vertical:   { fill: 0x5d4037, label: '|' },
  door:            { fill: 0xffb74d, label: 'D' },
  window:          { fill: 0x81d4fa, label: 'W' },
  house_exterior:  { fill: 0x8d6e63, label: 'H' },

  // furniture
  stove:         { fill: 0xf44336, label: 'Stv' },
  fridge:        { fill: 0xe0e0e0, label: 'Fri' },
  kitchen_table: { fill: 0x8d6e63, label: 'Tbl' },
  chair:         { fill: 0xa1887f, label: 'Ch' },
  bed:           { fill: 0xce93d8, label: 'Bed' },
  desk:          { fill: 0x8d6e63, label: 'Dsk' },
  bookshelf:     { fill: 0x6d4c41, label: 'Bks' },
  couch:         { fill: 0x5c6bc0, label: 'Cch' },
  tv:            { fill: 0x212121, label: 'TV' },
  sink:          { fill: 0x90caf9, label: 'Snk' },

  // outdoor
  tree_oak:   { fill: 0x2e7d32, label: 'Oak' },
  tree_pine:  { fill: 0x1b5e20, label: 'Pin' },
  bush:       { fill: 0x558b2f, label: 'Bu' },
  flower_bed: { fill: 0xf06292, label: '*' },
  bench:      { fill: 0x795548, label: 'Bnc' },
  fountain:   { fill: 0x29b6f6, label: 'Ftn' },
  lamp_post:  { fill: 0xfdd835, label: 'L' },
  mailbox:    { fill: 0x1565c0, label: 'M' },
  trash_can:  { fill: 0x616161, label: 'Tr' },

  // characters
  character_1: { fill: 0xff7043, label: 'P1' },
  character_2: { fill: 0x26c6da, label: 'P2' },
  character_3: { fill: 0xab47bc, label: 'P3' },
};

export class MainScene extends Phaser.Scene {
  private apiClient!: ApiClient;
  private worldState!: WorldState;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private player!: Phaser.GameObjects.Container;
  private agentSprites: Map<string, Phaser.GameObjects.Container> = new Map();
  private initialized: boolean = false;
  private lastExpandTime: number = 0;
  private expandingDirections: Set<string> = new Set();

  constructor() {
    super({ key: 'MainScene' });
  }

  async create(): Promise<void> {
    this.apiClient = new ApiClient();

    const loadingText = this.add.text(
      this.scale.width / 2, this.scale.height / 2,
      'Loading world...', { fontSize: '24px', color: '#ffffff' }
    ).setOrigin(0.5).setDepth(9999).setScrollFactor(0);

    try {
      // Fetch world state and assets from backend
      const [worldState] = await Promise.all([
        this.apiClient.fetchState(),
        this.apiClient.fetchAssets(),
      ]);
      this.worldState = worldState;

      // Generate placeholder textures for all tile keys
      for (const [key, { fill }] of Object.entries(COLORS)) {
        this.makeSquareTexture(key, fill);
      }

      const root = this.worldState.environment_root;

      // Render the full environment tree
      this.renderNode(root, 0);

      // Faint grid overlay
      this.drawGrid(root);

      // Zone / room name labels
      this.addAreaLabels(root);

      // Render agents
      this.renderAgents(this.worldState.agents);

      // Controllable player at center of world
      this.createPlayer(Math.floor(root.x + root.w / 2), Math.floor(root.y + root.h / 2));

      // Camera
      const worldW = root.w * PX;
      const worldH = root.h * PX;
      this.cameras.main.setBounds(root.x * PX, root.y * PX, worldW, worldH);
      this.cameras.main.startFollow(this.player, true, 0.08, 0.08);

      // Input
      this.cursors = this.input.keyboard!.createCursorKeys();
      this.wasd = {
        W: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.W),
        A: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.A),
        S: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.S),
        D: this.input.keyboard!.addKey(Phaser.Input.Keyboard.KeyCodes.D),
      };

      // Scroll-to-zoom
      this.input.on('wheel', (_p: unknown, _gx: unknown, _gy: unknown, _dx: unknown, dy: number) => {
        const cam = this.cameras.main;
        cam.setZoom(Phaser.Math.Clamp(cam.zoom - dy * 0.001, 0.4, 3));
      });

      // HUD
      this.add.text(10, 10, 'WASD / Arrows = move   Scroll = zoom', {
        fontSize: '14px',
        color: '#ffffff',
        backgroundColor: '#000000aa',
        padding: { x: 8, y: 4 },
      }).setScrollFactor(0).setDepth(1000);

      this.add.text(10, 35, `Agents: ${this.worldState.agents.length}`, {
        fontSize: '12px',
        color: '#aaffaa',
        backgroundColor: '#000000aa',
        padding: { x: 6, y: 4 },
      }).setScrollFactor(0).setDepth(1000);

      // WebSocket for live state updates
      this.apiClient.onStateUpdate((state: WorldState) => {
        this.worldState = state;
        this.updateAgentPositions(state.agents);
      });
      this.apiClient.connectWebSocket();

      this.initialized = true;
      loadingText.destroy();
    } catch (error) {
      console.error('Failed to initialize world:', error);
      loadingText.setText('Failed to load world.\nIs the backend running?');
    }
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
      this.player.x += vx;
      this.player.y += vy;
    }

    this.checkEdgeExpansion();
  }

  // ── Edge expansion ──────────────────────────────────────────────────

  private checkEdgeExpansion(): void {
    const now = Date.now();
    if (now - this.lastExpandTime < EXPAND_DEBOUNCE_MS) return;

    const root = this.worldState.environment_root;
    const threshold = EDGE_EXPAND_THRESHOLD * PX;

    const px = this.player.x;
    const py = this.player.y;
    const bx = root.x * PX;
    const by = root.y * PX;
    const bw = root.w * PX;
    const bh = root.h * PX;

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
        Math.floor(this.player.x / PX),
        Math.floor(this.player.y / PX),
      );

      if (result.success && result.new_zone) {
        // Generate any new textures needed
        this.ensureTextures(result.new_zone);
        // Render the new zone
        this.renderNode(result.new_zone, 1);
        this.addAreaLabels(result.new_zone);

        // Update camera bounds
        const root = this.worldState.environment_root;
        this.cameras.main.setBounds(
          root.x * PX, root.y * PX, root.w * PX, root.h * PX
        );
      }
    } catch (e) {
      console.warn('Expansion failed:', e);
    } finally {
      this.expandingDirections.delete(direction);
    }
  }

  private ensureTextures(node: EnvironmentNode): void {
    if (node.tile_key && !this.textures.exists(node.tile_key)) {
      const colorInfo = COLORS[node.tile_key];
      if (colorInfo) {
        this.makeSquareTexture(node.tile_key, colorInfo.fill);
      }
    }
    for (const child of node.children) {
      this.ensureTextures(child);
    }
  }

  // ── Rendering helpers ───────────────────────────────────────────────

  private makeSquareTexture(key: string, fill: number): void {
    if (this.textures.exists(key)) return;
    const gfx = this.make.graphics({ add: false });
    gfx.fillStyle(fill, 1);
    gfx.fillRect(0, 0, TILE, TILE);
    const r = ((fill >> 16) & 0xff) * 0.7;
    const g = ((fill >> 8) & 0xff) * 0.7;
    const b = (fill & 0xff) * 0.7;
    gfx.lineStyle(1, (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b), 0.4);
    gfx.strokeRect(0, 0, TILE, TILE);
    gfx.generateTexture(key, TILE, TILE);
    gfx.destroy();
  }

  private renderNode(node: EnvironmentNode, depth: number): void {
    if (!node.tile_key) return;
    const color = COLORS[node.tile_key];
    if (!color) return;

    const nw = node.w || 1;
    const nh = node.h || 1;
    const isArea = ['world', 'zone', 'room', 'building'].includes(node.node_type || '');

    if (isArea) {
      for (let tx = 0; tx < nw; tx++) {
        for (let ty = 0; ty < nh; ty++) {
          this.add.image((node.x + tx) * PX + PX / 2, (node.y + ty) * PX + PX / 2, node.tile_key)
            .setScale(SCALE).setDepth(depth);
        }
      }
      if (node.node_type !== 'world') {
        const gfx = this.add.graphics();
        gfx.lineStyle(2, color.fill, 0.6);
        gfx.strokeRect(node.x * PX, node.y * PX, nw * PX, nh * PX);
        gfx.setDepth(depth + 50);
      }
    } else {
      for (let tx = 0; tx < nw; tx++) {
        for (let ty = 0; ty < nh; ty++) {
          const cx = (node.x + tx) * PX + PX / 2;
          const cy = (node.y + ty) * PX + PX / 2;
          this.add.image(cx, cy, node.tile_key).setScale(SCALE).setDepth(depth + 10);

          if (tx === 0 && ty === 0 && color.label) {
            this.add.text(cx, cy, color.label, {
              fontSize: '12px',
              fontStyle: 'bold',
              color: '#ffffff',
              stroke: '#000000',
              strokeThickness: 2,
            }).setOrigin(0.5).setDepth(depth + 11);
          }
        }
      }
    }

    for (const child of node.children) {
      this.renderNode(child, depth + 1);
    }
  }

  private drawGrid(root: EnvironmentNode): void {
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x000000, 0.06);
    gfx.setDepth(500);
    for (let x = 0; x <= root.w; x++) { gfx.moveTo((root.x + x) * PX, root.y * PX); gfx.lineTo((root.x + x) * PX, (root.y + root.h) * PX); }
    for (let y = 0; y <= root.h; y++) { gfx.moveTo(root.x * PX, (root.y + y) * PX); gfx.lineTo((root.x + root.w) * PX, (root.y + y) * PX); }
    gfx.strokePath();
  }

  private addAreaLabels(node: EnvironmentNode): void {
    if (node.name && node.node_type !== 'world' && node.node_type !== 'object') {
      this.add.text(node.x * PX + 4, node.y * PX + 2, node.name, {
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 3, y: 1 },
      }).setDepth(900);
    }
    for (const child of node.children) {
      this.addAreaLabels(child);
    }
  }

  // ── Agent rendering ─────────────────────────────────────────────────

  private renderAgents(agents: AgentState[]): void {
    for (const agent of agents) {
      this.createAgentSprite(agent);
    }
  }

  private createAgentSprite(agent: AgentState): void {
    const info = COLORS[agent.sprite_key];
    if (!info) return;
    const cx = agent.x * PX + PX / 2;
    const cy = agent.y * PX + PX / 2;

    const gfx = this.add.graphics();
    gfx.fillStyle(info.fill, 1);
    gfx.fillCircle(0, 0, PX * 0.4);
    gfx.lineStyle(2, 0xffffff, 1);
    gfx.strokeCircle(0, 0, PX * 0.4);

    const nameTag = this.add.text(0, -PX * 0.55, agent.name, {
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1);

    const actionTag = this.add.text(0, PX * 0.55, agent.current_action, {
      fontSize: '9px',
      color: '#cccccc',
      backgroundColor: '#00000088',
      padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 0);
    actionTag.setName('actionLabel');

    const container = this.add.container(cx, cy, [gfx, nameTag, actionTag]);
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
      const px = agent.x * PX + PX / 2;
      const py = agent.y * PX + PX / 2;
      this.tweens.add({
        targets: container,
        x: px,
        y: py,
        duration: 300,
        ease: 'Power2',
      });
      const actionLabel = container.getByName('actionLabel') as Phaser.GameObjects.Text;
      if (actionLabel) {
        actionLabel.setText(agent.current_action);
      }
    }
  }

  // ── Player ──────────────────────────────────────────────────────────

  private createPlayer(tileX: number, tileY: number): void {
    const body = this.add.graphics();
    body.fillStyle(0xffc107, 1);
    body.fillCircle(0, 0, PX * 0.35);
    body.lineStyle(2, 0xff6f00, 1);
    body.strokeCircle(0, 0, PX * 0.35);
    body.fillStyle(0xff6f00, 1);
    body.fillCircle(0, -PX * 0.2, PX * 0.08);

    const tag = this.add.text(0, -PX * 0.5, 'YOU', {
      fontSize: '10px', fontStyle: 'bold', color: '#ffc107',
      backgroundColor: '#000000cc', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1);

    this.player = this.add.container(tileX * PX + PX / 2, tileY * PX + PX / 2, [body, tag]);
    this.player.setDepth(900);
  }
}
