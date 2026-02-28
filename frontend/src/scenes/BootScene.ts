import Phaser from 'phaser';
import { AssetRegistry, AssetEntry } from '../ApiClient';

/**
 * BootScene — loads sprite PNGs, then starts MainScene.
 *
 * Tries to fetch the asset registry from the backend. If the backend is
 * unavailable, falls back to a hardcoded list of known sprite paths.
 * Sprites that fail to load (e.g. empty 0-byte files) are tracked so
 * WorldRenderer can fall back to colored rectangles for those keys.
 */

// Known sprites matching asset_registry.json — used when backend is offline
const KNOWN_SPRITES: Record<string, string> = {
  grass: 'assets/terrain/grass.png',
  dirt_path: 'assets/terrain/dirt_path.png',
  road: 'assets/terrain/road.png',
  water: 'assets/terrain/water.png',
  floor_wood: 'assets/terrain/floor_wood.png',
  floor_tile: 'assets/terrain/floor_tile.png',
  floor_carpet: 'assets/terrain/floor_carpet.png',
  wall_horizontal: 'assets/structures/wall_h.png',
  wall_vertical: 'assets/structures/wall_v.png',
  door: 'assets/structures/door.png',
  window: 'assets/structures/window.png',
  house_exterior: 'assets/structures/house.png',
  stove: 'assets/furniture/stove.png',
  fridge: 'assets/furniture/fridge.png',
  kitchen_table: 'assets/furniture/kitchen_table.png',
  chair: 'assets/furniture/chair.png',
  bed: 'assets/furniture/bed.png',
  desk: 'assets/furniture/desk.png',
  bookshelf: 'assets/furniture/bookshelf.png',
  couch: 'assets/furniture/couch.png',
  tv: 'assets/furniture/tv.png',
  sink: 'assets/furniture/sink.png',
  tree_oak: 'assets/outdoor/tree_oak.png',
  tree_pine: 'assets/outdoor/tree_pine.png',
  bush: 'assets/outdoor/bush.png',
  flower_bed: 'assets/outdoor/flower_bed.png',
  bench: 'assets/outdoor/bench.png',
  fountain: 'assets/outdoor/fountain.png',
  lamp_post: 'assets/outdoor/lamp_post.png',
  mailbox: 'assets/outdoor/mailbox.png',
  trash_can: 'assets/outdoor/trash_can.png',
  character_1: 'assets/characters/char_1.png',
  character_2: 'assets/characters/char_2.png',
  character_3: 'assets/characters/char_3.png',
};

export class BootScene extends Phaser.Scene {
  private failedKeys: Set<string> = new Set();

  constructor() {
    super({ key: 'BootScene' });
  }

  async create(): Promise<void> {
    const { width, height } = this.scale;

    // ── Loading UI ──────────────────────────────────────────────
    const title = this.add.text(width / 2, height / 2 - 40, 'Loading assets...', {
      fontSize: '20px', color: '#ffffff',
    }).setOrigin(0.5);

    this.add.rectangle(width / 2, height / 2, 320, 20, 0x333333);
    const barFill = this.add.rectangle(width / 2 - 158, height / 2, 0, 16, 0x4caf50)
      .setOrigin(0, 0.5);

    const statusText = this.add.text(width / 2, height / 2 + 30, '', {
      fontSize: '12px', color: '#aaaaaa',
    }).setOrigin(0.5);

    // ── Build sprite load list ──────────────────────────────────
    let registry: AssetRegistry | null = null;
    let loadList: { key: string; path: string }[] = [];

    try {
      // Fetch from backend with a short timeout
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 3000);
      const res = await fetch('/api/assets', { signal: controller.signal });
      clearTimeout(timeout);
      registry = await res.json();

      // Build load list from registry
      for (const [category, items] of Object.entries(registry!)) {
        if (category === '_meta') continue;
        if (typeof items !== 'object') continue;
        for (const [tileKey, entry] of Object.entries(items as Record<string, AssetEntry>)) {
          if (entry.sprite) {
            loadList.push({ key: tileKey, path: `assets/${entry.sprite}` });
          }
        }
      }
    } catch {
      // Backend unavailable — use hardcoded sprite list
      console.warn('Backend unavailable — loading sprites from known paths');
      statusText.setText('Backend offline — loading local sprites');
      loadList = Object.entries(KNOWN_SPRITES).map(([key, path]) => ({ key, path }));
    }

    if (loadList.length === 0) {
      title.setText('No assets found.');
      await this.delay(800);
      this.scene.start('MainScene', { registry, failedKeys: new Set() });
      return;
    }

    // ── Track load failures ─────────────────────────────────────
    this.load.on('loaderror', (file: Phaser.Loader.File) => {
      this.failedKeys.add(file.key);
    });

    // ── Queue all sprites ───────────────────────────────────────
    for (const { key, path } of loadList) {
      this.load.image(key, path);
    }

    // ── Progress callback ───────────────────────────────────────
    let loaded = 0;
    this.load.on('filecomplete', () => {
      loaded++;
      barFill.width = 316 * (loaded / loadList.length);
      statusText.setText(`${loaded} / ${loadList.length}`);
    });

    // ── Start loading and wait for completion ───────────────────
    this.load.start();

    await new Promise<void>((resolve) => {
      this.load.on('complete', () => resolve());
    });

    // ── Report results ──────────────────────────────────────────
    const ok = loadList.length - this.failedKeys.size;
    title.setText(`Loaded ${ok} sprites`);
    if (this.failedKeys.size > 0) {
      statusText.setText(`${this.failedKeys.size} missing (using fallback colors)`);
    } else {
      statusText.setText('All assets loaded!');
    }

    await this.delay(600);

    // ── Start the game ──────────────────────────────────────────
    this.scene.start('MainScene', { registry, failedKeys: this.failedKeys });
  }

  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => this.time.delayedCall(ms, resolve));
  }
}
