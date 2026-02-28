import Phaser from 'phaser';

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

// ── Embedded seed world (matches backend/data/seed_world.json) ──────────
const SEED_WORLD = {
  environment_root: {
    id: 'world', name: 'Willowbrook', node_type: 'world',
    tile_key: 'grass', x: 0, y: 0, w: 40, h: 30,
    children: [
      {
        id: 'town_square', name: 'Town Square', node_type: 'zone',
        tile_key: 'dirt_path', x: 14, y: 10, w: 12, h: 10,
        children: [
          { id: 'fountain_01', node_type: 'object', tile_key: 'fountain', x: 18, y: 14, w: 2, h: 2, children: [] },
          { id: 'bench_01', node_type: 'object', tile_key: 'bench', x: 16, y: 16, w: 1, h: 1, children: [] },
          { id: 'bench_02', node_type: 'object', tile_key: 'bench', x: 22, y: 14, w: 1, h: 1, children: [] },
          { id: 'tree_sq_01', node_type: 'object', tile_key: 'tree_oak', x: 14, y: 10, w: 1, h: 1, children: [] },
          { id: 'tree_sq_02', node_type: 'object', tile_key: 'tree_oak', x: 25, y: 10, w: 1, h: 1, children: [] },
          { id: 'lamp_01', node_type: 'object', tile_key: 'lamp_post', x: 15, y: 13, w: 1, h: 1, children: [] },
        ],
      },
      {
        id: 'main_road', name: 'Main Street', node_type: 'zone',
        tile_key: 'road', x: 8, y: 13, w: 6, h: 3,
        children: [],
      },
      {
        id: 'house_01', name: 'Johnson Residence', node_type: 'building',
        tile_key: 'house_exterior', x: 2, y: 10, w: 6, h: 8,
        children: [
          {
            id: 'house_01_kitchen', name: 'Kitchen', node_type: 'room',
            tile_key: 'floor_tile', x: 2, y: 10, w: 6, h: 4,
            children: [
              { id: 'kitchen_stove', node_type: 'object', tile_key: 'stove', x: 2, y: 10, w: 1, h: 1, children: [] },
              { id: 'kitchen_fridge', node_type: 'object', tile_key: 'fridge', x: 3, y: 10, w: 1, h: 1, children: [] },
              { id: 'kitchen_sink', node_type: 'object', tile_key: 'sink', x: 4, y: 10, w: 1, h: 1, children: [] },
              { id: 'kitchen_table', node_type: 'object', tile_key: 'kitchen_table', x: 5, y: 12, w: 1, h: 1, children: [] },
              { id: 'kitchen_chair_01', node_type: 'object', tile_key: 'chair', x: 4, y: 12, w: 1, h: 1, children: [] },
              { id: 'kitchen_chair_02', node_type: 'object', tile_key: 'chair', x: 6, y: 12, w: 1, h: 1, children: [] },
            ],
          },
          { id: 'house_01_door', node_type: 'object', tile_key: 'door', x: 5, y: 14, w: 1, h: 1, children: [] },
          {
            id: 'house_01_bedroom', name: 'Bedroom', node_type: 'room',
            tile_key: 'floor_carpet', x: 2, y: 14, w: 6, h: 4,
            children: [
              { id: 'bedroom_bed', node_type: 'object', tile_key: 'bed', x: 2, y: 15, w: 1, h: 2, children: [] },
              { id: 'bedroom_desk', node_type: 'object', tile_key: 'desk', x: 5, y: 14, w: 1, h: 1, children: [] },
              { id: 'bedroom_bookshelf', node_type: 'object', tile_key: 'bookshelf', x: 7, y: 14, w: 1, h: 1, children: [] },
            ],
          },
        ],
      },
      {
        id: 'park_area', name: 'Willowbrook Park', node_type: 'zone',
        tile_key: 'grass', x: 14, y: 2, w: 12, h: 7,
        children: [
          { id: 'park_tree_01', node_type: 'object', tile_key: 'tree_pine', x: 15, y: 3, w: 1, h: 1, children: [] },
          { id: 'park_tree_02', node_type: 'object', tile_key: 'tree_pine', x: 20, y: 4, w: 1, h: 1, children: [] },
          { id: 'park_tree_03', node_type: 'object', tile_key: 'tree_oak', x: 24, y: 3, w: 1, h: 1, children: [] },
          { id: 'park_flowers', node_type: 'object', tile_key: 'flower_bed', x: 17, y: 5, w: 1, h: 1, children: [] },
          { id: 'park_bench', node_type: 'object', tile_key: 'bench', x: 23, y: 4, w: 1, h: 1, children: [] },
          { id: 'park_bush_01', node_type: 'object', tile_key: 'bush', x: 14, y: 2, w: 1, h: 1, children: [] },
        ],
      },
      { id: 'mailbox_01', node_type: 'object', tile_key: 'mailbox', x: 8, y: 12, w: 1, h: 1, children: [] },
    ],
  },
  agents: [
    { id: 'agent_sam', name: 'Sam Johnson', sprite_key: 'character_1', x: 4, y: 11 },
    { id: 'agent_maya', name: 'Maya Chen', sprite_key: 'character_2', x: 16, y: 16 },
  ],
};

// ── Helper types ────────────────────────────────────────────────────────
interface WorldNode {
  id: string;
  name?: string;
  node_type?: string;
  tile_key: string;
  x: number;
  y: number;
  w: number;
  h: number;
  children: WorldNode[];
}

interface Agent {
  id: string;
  name: string;
  sprite_key: string;
  x: number;
  y: number;
}

export class MainScene extends Phaser.Scene {
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private player!: Phaser.GameObjects.Container;

  constructor() {
    super({ key: 'MainScene' });
  }

  create(): void {
    // Generate a placeholder texture for every tile key
    for (const [key, { fill }] of Object.entries(COLORS)) {
      this.makeSquareTexture(key, fill);
    }

    // Render the full environment tree
    this.renderNode(SEED_WORLD.environment_root as WorldNode, 0);

    // Faint grid overlay so you can count tiles
    this.drawGrid(SEED_WORLD.environment_root as WorldNode);

    // Zone / room name labels
    this.addAreaLabels(SEED_WORLD.environment_root as WorldNode);

    // Agents
    for (const agent of SEED_WORLD.agents) {
      this.renderAgent(agent);
    }

    // Controllable player
    this.createPlayer(10, 14);

    // Camera follows player
    const worldW = 40 * PX;
    const worldH = 30 * PX;
    this.cameras.main.setBounds(0, 0, worldW, worldH);
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
  }

  update(): void {
    const speed = 4;
    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -speed;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = speed;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -speed;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = speed;

    this.player.x = Phaser.Math.Clamp(this.player.x + vx, 0, 40 * PX);
    this.player.y = Phaser.Math.Clamp(this.player.y + vy, 0, 30 * PX);
  }

  // ── Helpers ───────────────────────────────────────────────────────

  /** Create a solid-color 1-tile texture with a subtle border. */
  private makeSquareTexture(key: string, fill: number): void {
    const gfx = this.make.graphics({ add: false });
    gfx.fillStyle(fill, 1);
    gfx.fillRect(0, 0, TILE, TILE);
    // darker border
    const r = ((fill >> 16) & 0xff) * 0.7;
    const g = ((fill >> 8) & 0xff) * 0.7;
    const b = (fill & 0xff) * 0.7;
    gfx.lineStyle(1, (Math.floor(r) << 16) | (Math.floor(g) << 8) | Math.floor(b), 0.4);
    gfx.strokeRect(0, 0, TILE, TILE);
    gfx.generateTexture(key, TILE, TILE);
    gfx.destroy();
  }

  /** Recursively paint the environment tree. */
  private renderNode(node: WorldNode, depth: number): void {
    const color = COLORS[node.tile_key];
    if (!color) return;

    const nw = node.w || 1;
    const nh = node.h || 1;
    const isArea = ['world', 'zone', 'room', 'building'].includes(node.node_type || '');

    if (isArea) {
      // Tile the ground across the full area
      for (let tx = 0; tx < nw; tx++) {
        for (let ty = 0; ty < nh; ty++) {
          this.add.image((node.x + tx) * PX + PX / 2, (node.y + ty) * PX + PX / 2, node.tile_key)
            .setScale(SCALE).setDepth(depth);
        }
      }
      // Draw a colored border around zones/rooms so they stand out
      if (node.node_type !== 'world') {
        const gfx = this.add.graphics();
        gfx.lineStyle(2, color.fill, 0.6);
        gfx.strokeRect(node.x * PX, node.y * PX, nw * PX, nh * PX);
        gfx.setDepth(depth + 50);
      }
    } else {
      // Object — draw each tile of the object with a label inside
      for (let tx = 0; tx < nw; tx++) {
        for (let ty = 0; ty < nh; ty++) {
          const cx = (node.x + tx) * PX + PX / 2;
          const cy = (node.y + ty) * PX + PX / 2;
          this.add.image(cx, cy, node.tile_key).setScale(SCALE).setDepth(depth + 10);

          // Draw label text on the first tile of the object
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
      this.renderNode(child as WorldNode, depth + 1);
    }
  }

  /** Faint tile-grid lines. */
  private drawGrid(root: WorldNode): void {
    const gfx = this.add.graphics();
    gfx.lineStyle(1, 0x000000, 0.06);
    gfx.setDepth(500);
    for (let x = 0; x <= root.w; x++) { gfx.moveTo(x * PX, 0); gfx.lineTo(x * PX, root.h * PX); }
    for (let y = 0; y <= root.h; y++) { gfx.moveTo(0, y * PX); gfx.lineTo(root.w * PX, y * PX); }
    gfx.strokePath();
  }

  /** Floating name tags for zones, buildings, rooms. */
  private addAreaLabels(node: WorldNode): void {
    if (node.name && node.node_type !== 'world' && node.node_type !== 'object') {
      this.add.text(node.x * PX + 4, node.y * PX + 2, node.name, {
        fontSize: '11px',
        color: '#ffffff',
        backgroundColor: '#00000088',
        padding: { x: 3, y: 1 },
      }).setDepth(900);
    }
    for (const child of node.children) {
      this.addAreaLabels(child as WorldNode);
    }
  }

  /** Draw an agent as a colored circle with a name tag. */
  private renderAgent(agent: Agent): void {
    const info = COLORS[agent.sprite_key];
    if (!info) return;
    const cx = agent.x * PX + PX / 2;
    const cy = agent.y * PX + PX / 2;

    const gfx = this.add.graphics();
    gfx.fillStyle(info.fill, 1);
    gfx.fillCircle(cx, cy, PX * 0.4);
    gfx.lineStyle(2, 0xffffff, 1);
    gfx.strokeCircle(cx, cy, PX * 0.4);
    gfx.setDepth(800);

    this.add.text(cx, cy - PX * 0.55, agent.name, {
      fontSize: '10px',
      color: '#ffffff',
      backgroundColor: '#000000cc',
      padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1).setDepth(801);
  }

  /** Player circle with camera follow. */
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
