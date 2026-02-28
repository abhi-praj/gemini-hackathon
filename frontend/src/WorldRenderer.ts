/**
 * WorldRenderer — renders the environment tree using real sprites
 * with fallback colored rectangles, and builds a tile-based collision grid.
 */

import Phaser from 'phaser';
import { EnvironmentNode, AssetRegistry, AssetEntry } from './ApiClient';

const TILE_SIZE = 16;
const RENDER_SCALE = 3;
const SCALED_TILE = TILE_SIZE * RENDER_SCALE; // 48px

// ── Depth layers ────────────────────────────────────────────────────────
const DEPTH = {
  GROUND: 0,          // terrain tiles (grass, dirt, floors)
  ZONE_BORDER: 5,     // zone/room outline
  STRUCTURE: 10,      // walls, house exterior
  OBJECT: 20,         // furniture, outdoor objects
  OBJECT_LABEL: 21,   // text labels on objects
  GRID: 50,           // debug grid overlay
  AREA_LABEL: 100,    // zone/room name floating labels
};

// ── Fallback colors when textures are missing ───────────────────────────
const FALLBACK_COLORS: Record<string, number> = {
  grass: 0x4a7c3f, dirt_path: 0x8b7355, road: 0x666666, water: 0x3366cc,
  floor_wood: 0x8b6914, floor_tile: 0xcccccc, floor_carpet: 0x6b3a5e,
  wall_horizontal: 0x555555, wall_vertical: 0x555555,
  door: 0x8b4513, window: 0x87ceeb, house_exterior: 0x9b7653,
  tree_oak: 0x2d5a1e, tree_pine: 0x1a4d1a, bush: 0x3a6b2a,
  flower_bed: 0xff69b4, bench: 0x8b6914, fountain: 0x4488cc,
  lamp_post: 0xcccc00, mailbox: 0x4444cc, trash_can: 0x888888,
  stove: 0x444444, fridge: 0xdddddd, kitchen_table: 0x8b6914,
  chair: 0x8b5a2b, bed: 0x6b3a5e, desk: 0x8b6914,
  bookshelf: 0x654321, couch: 0x8b0000, tv: 0x333333, sink: 0xaaaacc,
};

// ── Short labels for fallback rectangles ────────────────────────────────
const FALLBACK_LABELS: Record<string, string> = {
  stove: 'Stv', fridge: 'Fri', kitchen_table: 'Tbl', chair: 'Ch',
  bed: 'Bed', desk: 'Dsk', bookshelf: 'Bks', couch: 'Cch',
  tv: 'TV', sink: 'Snk', tree_oak: 'Oak', tree_pine: 'Pin',
  bush: 'Bu', flower_bed: '*', bench: 'Bnc', fountain: 'Ftn',
  lamp_post: 'L', mailbox: 'M', trash_can: 'Tr',
  door: 'D', window: 'W', house_exterior: 'H',
  wall_horizontal: '=', wall_vertical: '|',
};

export class WorldRenderer {
  private scene: Phaser.Scene;
  private failedKeys: Set<string>;
  private registry: AssetRegistry | null;

  // All game objects created by the renderer, for cleanup on rebuild
  private renderGroup: Phaser.GameObjects.Group;

  // Collision grid: true = blocked
  private collisionGrid: boolean[][] = [];
  private gridW: number = 0;
  private gridH: number = 0;
  private gridOffsetX: number = 0;
  private gridOffsetY: number = 0;

  constructor(scene: Phaser.Scene, registry: AssetRegistry | null, failedKeys: Set<string>) {
    this.scene = scene;
    this.registry = registry;
    this.failedKeys = failedKeys;
    this.renderGroup = scene.add.group();
  }

  // ── Public API ────────────────────────────────────────────────────────

  /** Render the full world from an environment tree root. */
  buildWorld(root: EnvironmentNode): void {
    this.clearAll();
    this.initCollisionGrid(root);
    this.renderNode(root, DEPTH.GROUND);
    this.buildCollisionFromTree(root);
    this.drawGrid(root);
    this.addAreaLabels(root);
  }

  /** Render a new expansion zone onto the existing world. */
  expandWorld(newNode: EnvironmentNode, root: EnvironmentNode): void {
    this.resizeCollisionGrid(root);
    this.renderNode(newNode, DEPTH.GROUND + 1);
    this.buildCollisionFromTree(newNode);
    this.addAreaLabels(newNode);
  }

  /** Check if a tile coordinate is blocked. */
  isBlocked(tileX: number, tileY: number): boolean {
    const gx = tileX - this.gridOffsetX;
    const gy = tileY - this.gridOffsetY;
    if (gx < 0 || gy < 0 || gx >= this.gridW || gy >= this.gridH) return true;
    return this.collisionGrid[gy][gx];
  }

  /** Check if a pixel position is blocked. */
  isBlockedAtPixel(px: number, py: number): boolean {
    return this.isBlocked(Math.floor(px / SCALED_TILE), Math.floor(py / SCALED_TILE));
  }

  /** Destroy all rendered objects. */
  clearAll(): void {
    this.renderGroup.clear(true, true);
  }

  /** Get the asset entry for a tile key. */
  getAssetEntry(tileKey: string): AssetEntry | null {
    if (!this.registry) return null;
    for (const [cat, items] of Object.entries(this.registry)) {
      if (cat === '_meta') continue;
      if (typeof items === 'object' && tileKey in items) {
        return (items as Record<string, AssetEntry>)[tileKey];
      }
    }
    return null;
  }

  // ── Collision Grid ────────────────────────────────────────────────────

  private initCollisionGrid(root: EnvironmentNode): void {
    this.gridOffsetX = root.x;
    this.gridOffsetY = root.y;
    this.gridW = root.w;
    this.gridH = root.h;
    // Start with everything blocked (outside-world is blocked)
    this.collisionGrid = Array.from({ length: this.gridH },
      () => Array(this.gridW).fill(true));
  }

  private resizeCollisionGrid(root: EnvironmentNode): void {
    const newW = root.w;
    const newH = root.h;
    const newOffX = root.x;
    const newOffY = root.y;

    const newGrid: boolean[][] = Array.from({ length: newH },
      () => Array(newW).fill(true));

    // Copy old data into new grid
    for (let y = 0; y < this.gridH; y++) {
      for (let x = 0; x < this.gridW; x++) {
        const nx = (x + this.gridOffsetX) - newOffX;
        const ny = (y + this.gridOffsetY) - newOffY;
        if (nx >= 0 && nx < newW && ny >= 0 && ny < newH) {
          newGrid[ny][nx] = this.collisionGrid[y][x];
        }
      }
    }

    this.collisionGrid = newGrid;
    this.gridOffsetX = newOffX;
    this.gridOffsetY = newOffY;
    this.gridW = newW;
    this.gridH = newH;
  }

  private buildCollisionFromTree(node: EnvironmentNode): void {
    const isArea = ['world', 'zone', 'room', 'building'].includes(node.node_type);

    if (isArea && node.walkable) {
      // Area nodes with walkable=true: mark their region as passable
      for (let ty = node.y; ty < node.y + node.h; ty++) {
        for (let tx = node.x; tx < node.x + node.w; tx++) {
          this.setCollision(tx, ty, false);
        }
      }
    }

    if (!isArea && !node.walkable) {
      // Object nodes with walkable=false: block their tiles
      const nw = node.w || 1;
      const nh = node.h || 1;
      for (let ty = node.y; ty < node.y + nh; ty++) {
        for (let tx = node.x; tx < node.x + nw; tx++) {
          this.setCollision(tx, ty, true);
        }
      }
    }

    if (!isArea && node.walkable) {
      // Walkable objects (doors, flower beds): mark as passable
      const nw = node.w || 1;
      const nh = node.h || 1;
      for (let ty = node.y; ty < node.y + nh; ty++) {
        for (let tx = node.x; tx < node.x + nw; tx++) {
          this.setCollision(tx, ty, false);
        }
      }
    }

    for (const child of node.children) {
      this.buildCollisionFromTree(child);
    }
  }

  private setCollision(tileX: number, tileY: number, blocked: boolean): void {
    const gx = tileX - this.gridOffsetX;
    const gy = tileY - this.gridOffsetY;
    if (gx >= 0 && gy >= 0 && gx < this.gridW && gy < this.gridH) {
      this.collisionGrid[gy][gx] = blocked;
    }
  }

  // ── Rendering ─────────────────────────────────────────────────────────

  private renderNode(node: EnvironmentNode, baseDepth: number): void {
    if (!node.tile_key) {
      for (const child of node.children) {
        this.renderNode(child, baseDepth);
      }
      return;
    }

    const tileKey = node.tile_key;
    const nw = node.w || 1;
    const nh = node.h || 1;
    const isArea = ['world', 'zone', 'room', 'building'].includes(node.node_type);
    const hasTexture = this.scene.textures.exists(tileKey) && !this.failedKeys.has(tileKey);

    if (isArea) {
      this.renderAreaTiles(node, tileKey, nw, nh, baseDepth, hasTexture);
      // Zone/room border
      if (node.node_type !== 'world') {
        const color = FALLBACK_COLORS[tileKey] || 0x888888;
        const gfx = this.scene.add.graphics();
        gfx.lineStyle(2, color, 0.5);
        gfx.strokeRect(node.x * SCALED_TILE, node.y * SCALED_TILE, nw * SCALED_TILE, nh * SCALED_TILE);
        gfx.setDepth(DEPTH.ZONE_BORDER);
        this.renderGroup.add(gfx);
      }
    } else {
      this.renderObject(node, tileKey, nw, nh, baseDepth, hasTexture);
    }

    for (const child of node.children) {
      this.renderNode(child, baseDepth + 1);
    }
  }

  /** Tile terrain sprites across an area. */
  private renderAreaTiles(
    node: EnvironmentNode, tileKey: string,
    nw: number, nh: number, depth: number, hasTexture: boolean
  ): void {
    for (let tx = 0; tx < nw; tx++) {
      for (let ty = 0; ty < nh; ty++) {
        const px = (node.x + tx) * SCALED_TILE + SCALED_TILE / 2;
        const py = (node.y + ty) * SCALED_TILE + SCALED_TILE / 2;

        if (hasTexture) {
          const img = this.scene.add.image(px, py, tileKey);
          img.setDisplaySize(SCALED_TILE, SCALED_TILE);
          img.setDepth(depth);
          this.renderGroup.add(img);
        } else {
          const color = FALLBACK_COLORS[tileKey] || 0x888888;
          const rect = this.scene.add.rectangle(px, py, SCALED_TILE, SCALED_TILE, color);
          rect.setDepth(depth);
          this.renderGroup.add(rect);
        }
      }
    }
  }

  /** Render a single object (furniture, tree, etc.) at its tile position. */
  private renderObject(
    node: EnvironmentNode, tileKey: string,
    nw: number, nh: number, depth: number, hasTexture: boolean
  ): void {
    const objDepth = depth + DEPTH.OBJECT;
    // Center of the object's footprint
    const cx = node.x * SCALED_TILE + (nw * SCALED_TILE) / 2;
    const cy = node.y * SCALED_TILE + (nh * SCALED_TILE) / 2;

    if (hasTexture) {
      const img = this.scene.add.image(cx, cy, tileKey);
      // Scale to fit the tile footprint while preserving aspect ratio
      const targetW = nw * SCALED_TILE;
      const targetH = nh * SCALED_TILE;
      const srcW = img.width;
      const srcH = img.height;
      const scale = Math.min(targetW / srcW, targetH / srcH);
      img.setScale(scale);
      img.setDepth(objDepth);
      this.renderGroup.add(img);
    } else {
      // Fallback: colored rectangle with label
      const color = FALLBACK_COLORS[tileKey] || 0xaa5500;
      const rect = this.scene.add.rectangle(
        cx, cy, nw * SCALED_TILE, nh * SCALED_TILE, color
      );
      rect.setStrokeStyle(1, 0x000000, 0.3);
      rect.setDepth(objDepth);
      this.renderGroup.add(rect);

      const label = FALLBACK_LABELS[tileKey];
      if (label) {
        const txt = this.scene.add.text(cx, cy, label, {
          fontSize: '12px', fontStyle: 'bold', color: '#ffffff',
          stroke: '#000000', strokeThickness: 2,
        }).setOrigin(0.5).setDepth(objDepth + 1);
        this.renderGroup.add(txt);
      }
    }
  }

  // ── Grid overlay ──────────────────────────────────────────────────────

  private drawGrid(root: EnvironmentNode): void {
    const gfx = this.scene.add.graphics();
    gfx.lineStyle(1, 0x000000, 0.06);
    gfx.setDepth(DEPTH.GRID);
    const ox = root.x * SCALED_TILE;
    const oy = root.y * SCALED_TILE;
    for (let x = 0; x <= root.w; x++) {
      gfx.moveTo(ox + x * SCALED_TILE, oy);
      gfx.lineTo(ox + x * SCALED_TILE, oy + root.h * SCALED_TILE);
    }
    for (let y = 0; y <= root.h; y++) {
      gfx.moveTo(ox, oy + y * SCALED_TILE);
      gfx.lineTo(ox + root.w * SCALED_TILE, oy + y * SCALED_TILE);
    }
    gfx.strokePath();
    this.renderGroup.add(gfx);
  }

  // ── Area name labels ──────────────────────────────────────────────────

  private addAreaLabels(node: EnvironmentNode): void {
    if (node.name && node.node_type !== 'world' && node.node_type !== 'object') {
      const txt = this.scene.add.text(
        node.x * SCALED_TILE + 4,
        node.y * SCALED_TILE + 2,
        node.name,
        {
          fontSize: '11px', color: '#ffffff',
          backgroundColor: '#00000088', padding: { x: 3, y: 1 },
        }
      ).setDepth(DEPTH.AREA_LABEL);
      this.renderGroup.add(txt);
    }
    for (const child of node.children) {
      this.addAreaLabels(child);
    }
  }
}

export { TILE_SIZE, RENDER_SCALE, SCALED_TILE, DEPTH, FALLBACK_COLORS };
