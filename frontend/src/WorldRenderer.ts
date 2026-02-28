/**
 * WorldRenderer — builds and updates the Phaser tile grid from EnvironmentNodes.
 */

import Phaser from 'phaser';
import { EnvironmentNode, AgentState, AssetRegistry, AssetEntry } from './ApiClient';

const TILE_SIZE = 16;
const RENDER_SCALE = 3;
const SCALED_TILE = TILE_SIZE * RENDER_SCALE;

/** Color palette for fallback rectangles when sprites are missing */
const FALLBACK_COLORS: Record<string, number> = {
    grass: 0x4a7c3f,
    dirt_path: 0x8b7355,
    road: 0x666666,
    water: 0x3366cc,
    floor_wood: 0x8b6914,
    floor_tile: 0xcccccc,
    floor_carpet: 0x6b3a5e,
    wall_horizontal: 0x555555,
    wall_vertical: 0x555555,
    door: 0x8b4513,
    window: 0x87ceeb,
    house_exterior: 0x9b7653,
    tree_oak: 0x2d5a1e,
    tree_pine: 0x1a4d1a,
    bush: 0x3a6b2a,
    flower_bed: 0xff69b4,
    bench: 0x8b6914,
    fountain: 0x4488cc,
    lamp_post: 0xcccc00,
    mailbox: 0x4444cc,
    trash_can: 0x888888,
    stove: 0x444444,
    fridge: 0xdddddd,
    kitchen_table: 0x8b6914,
    chair: 0x8b5a2b,
    bed: 0x6b3a5e,
    desk: 0x8b6914,
    bookshelf: 0x654321,
    couch: 0x8b0000,
    tv: 0x333333,
    sink: 0xaaaacc,
};

export class WorldRenderer {
    private scene: Phaser.Scene;
    private tileSprites: Map<string, Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle> = new Map();
    private agentSprites: Map<string, Phaser.GameObjects.Container> = new Map();
    private assetRegistry: AssetRegistry;
    private loadedTextures: Set<string> = new Set();

    constructor(scene: Phaser.Scene, assetRegistry: AssetRegistry) {
        this.scene = scene;
        this.assetRegistry = assetRegistry;
    }

    /**
     * Look up an asset entry by tile_key across all categories.
     */
    private getAssetEntry(tileKey: string): AssetEntry | null {
        for (const [cat, items] of Object.entries(this.assetRegistry)) {
            if (cat === '_meta') continue;
            if (typeof items === 'object' && tileKey in items) {
                return items[tileKey];
            }
        }
        return null;
    }

    /**
     * Build the full world from an EnvironmentNode tree.
     */
    buildWorld(root: EnvironmentNode): void {
        this.renderNode(root);
    }

    /**
     * Recursively render a node and its children.
     */
    private renderNode(node: EnvironmentNode): void {
        if (!node.tile_key) {
            // No visual for this node, just recurse children
            for (const child of node.children) {
                this.renderNode(child);
            }
            return;
        }

        const tileKey = node.tile_key;
        const asset = this.getAssetEntry(tileKey);
        const isZoneOrWorld = node.node_type === 'world' || node.node_type === 'zone' || node.node_type === 'room';

        if (isZoneOrWorld) {
            // Fill area with terrain tiles
            for (let tx = node.x; tx < node.x + node.w; tx++) {
                for (let ty = node.y; ty < node.y + node.h; ty++) {
                    const key = `tile_${tx}_${ty}`;
                    if (!this.tileSprites.has(key)) {
                        this.createTileAt(tx, ty, tileKey, asset);
                        this.tileSprites.set(key, this.createTileAt(tx, ty, tileKey, asset));
                    }
                }
            }
        } else {
            // Object or building: single sprite/rect
            const objKey = `obj_${node.id}`;
            if (!this.tileSprites.has(objKey)) {
                const sprite = this.createObjectAt(node.x, node.y, node.w, node.h, tileKey, asset);
                this.tileSprites.set(objKey, sprite);
            }
        }

        // Render children
        for (const child of node.children) {
            this.renderNode(child);
        }
    }

    private createTileAt(
        tx: number, ty: number, tileKey: string, asset: AssetEntry | null
    ): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
        const px = tx * SCALED_TILE + SCALED_TILE / 2;
        const py = ty * SCALED_TILE + SCALED_TILE / 2;

        if (asset && this.loadedTextures.has(tileKey)) {
            const img = this.scene.add.image(px, py, tileKey);
            img.setScale(RENDER_SCALE);
            img.setDepth(0);
            return img;
        }

        // Fallback colored rectangle
        const color = FALLBACK_COLORS[tileKey] || 0x888888;
        const rect = this.scene.add.rectangle(px, py, SCALED_TILE, SCALED_TILE, color);
        rect.setDepth(0);
        return rect;
    }

    private createObjectAt(
        x: number, y: number, w: number, h: number,
        tileKey: string, asset: AssetEntry | null
    ): Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle {
        const px = x * SCALED_TILE + (w * SCALED_TILE) / 2;
        const py = y * SCALED_TILE + (h * SCALED_TILE) / 2;

        if (asset && this.loadedTextures.has(tileKey)) {
            const img = this.scene.add.image(px, py, tileKey);
            img.setScale(RENDER_SCALE);
            img.setDepth(1);
            return img;
        }

        const color = FALLBACK_COLORS[tileKey] || 0xaa5500;
        const rect = this.scene.add.rectangle(
            px, py, w * SCALED_TILE, h * SCALED_TILE, color
        );
        rect.setStrokeStyle(1, 0x000000);
        rect.setDepth(1);
        return rect;
    }

    /**
     * Expand the world with new nodes from an expansion.
     */
    expandWorld(newNode: EnvironmentNode): void {
        this.renderNode(newNode);
    }

    /**
     * Create or update agent sprites.
     */
    updateAgents(agents: AgentState[]): void {
        for (const agent of agents) {
            const px = agent.x * SCALED_TILE + SCALED_TILE / 2;
            const py = agent.y * SCALED_TILE + SCALED_TILE / 2;

            let container = this.agentSprites.get(agent.id);

            if (!container) {
                // Create agent sprite as a colored circle + name label
                container = this.scene.add.container(px, py);
                container.setDepth(10);

                const colors = [0xff4444, 0x4488ff, 0x44cc44, 0xffaa00];
                const colorIndex = agents.indexOf(agent) % colors.length;

                const circle = this.scene.add.circle(0, 0, SCALED_TILE * 0.4, colors[colorIndex]);
                circle.setStrokeStyle(2, 0xffffff);

                const label = this.scene.add.text(0, -SCALED_TILE * 0.7, agent.name, {
                    fontSize: '11px',
                    color: '#ffffff',
                    backgroundColor: '#000000aa',
                    padding: { x: 3, y: 1 },
                }).setOrigin(0.5);

                const actionLabel = this.scene.add.text(0, SCALED_TILE * 0.6, agent.current_action, {
                    fontSize: '9px',
                    color: '#cccccc',
                    backgroundColor: '#00000088',
                    padding: { x: 2, y: 1 },
                }).setOrigin(0.5);
                actionLabel.setName('actionLabel');

                container.add([circle, label, actionLabel]);
                this.agentSprites.set(agent.id, container);
            } else {
                // Update position with smooth tween
                this.scene.tweens.add({
                    targets: container,
                    x: px,
                    y: py,
                    duration: 300,
                    ease: 'Power2',
                });

                // Update action label
                const actionLabel = container.getByName('actionLabel') as Phaser.GameObjects.Text;
                if (actionLabel) {
                    actionLabel.setText(agent.current_action);
                }
            }
        }
    }

    /**
     * Mark textures as loaded so we can use sprites instead of rectangles.
     */
    markTextureLoaded(tileKey: string): void {
        this.loadedTextures.add(tileKey);
    }

    /**
     * Get the pixel dimensions of the world.
     */
    getWorldBounds(root: EnvironmentNode): { x: number; y: number; width: number; height: number } {
        return {
            x: root.x * SCALED_TILE,
            y: root.y * SCALED_TILE,
            width: root.w * SCALED_TILE,
            height: root.h * SCALED_TILE,
        };
    }
}

export { TILE_SIZE, RENDER_SCALE, SCALED_TILE };
