import Phaser from 'phaser';
import { ApiClient, WorldState, AgentState } from '../ApiClient';
import { WorldRenderer, TILE_SIZE } from '../WorldRenderer';
import { CHARACTER_NAMES } from './BootScene';
import { UIPanel } from '../UIPanel';

const PLAYER_SPEED = 160; // pixels per second (for arcade physics)
const DEFAULT_PLAYER_SPRITE = 'Adam_Smith';

export class MainScene extends Phaser.Scene {
  private apiClient!: ApiClient;
  private worldState: WorldState | null = null;
  private worldRenderer!: WorldRenderer;
  private cursors!: Phaser.Types.Input.Keyboard.CursorKeys;
  private wasd!: Record<string, Phaser.Input.Keyboard.Key>;
  private player!: Phaser.Types.Physics.Arcade.SpriteWithDynamicBody;
  private agentSprites: Map<string, Phaser.GameObjects.Container> = new Map();
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

    // Try fetching agents from backend
    let backendAvailable = false;
    try {
      this.worldState = await this.apiClient.fetchState();
      backendAvailable = true;
      this.renderAgents(this.worldState.agents);
    } catch {
      console.warn('Backend unavailable — no agents loaded');
    }

    // HUD
    const mode = backendAvailable ? '' : ' [OFFLINE]';
    const agentCount = this.worldState?.agents.length ?? 0;
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
    if (this.worldState) {
      this.uiPanel.setAgents(this.worldState.agents);
    }

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

    // Skip movement when typing in sidebar inputs
    if (this.uiPanel?.isInputFocused()) return;

    let vx = 0;
    let vy = 0;
    if (this.cursors.left.isDown || this.wasd.A.isDown) vx = -PLAYER_SPEED;
    else if (this.cursors.right.isDown || this.wasd.D.isDown) vx = PLAYER_SPEED;
    if (this.cursors.up.isDown || this.wasd.W.isDown) vy = -PLAYER_SPEED;
    else if (this.cursors.down.isDown || this.wasd.S.isDown) vy = PLAYER_SPEED;

    this.player.setVelocity(vx, vy);

    // Normalize diagonal speed
    if (vx !== 0 && vy !== 0) {
      this.player.setVelocity(vx * 0.707, vy * 0.707);
    }

    // Play appropriate walking animation
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
      // Set idle frame based on last direction
      const currentAnim = this.player.anims.currentAnim;
      if (currentAnim) {
        const dir = currentAnim.key.includes('left') ? 'left' :
                    currentAnim.key.includes('right') ? 'right' :
                    currentAnim.key.includes('up') ? 'up' : 'down';
        this.player.setFrame(dir);
      }
    }
  }

  // Create walking animations for all character atlases
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

  private createPlayer(map: Phaser.Tilemaps.Tilemap): void {
    // Spawn in the middle of the map
    const spawnX = Math.floor(map.width / 2) * TILE_SIZE + TILE_SIZE / 2;
    const spawnY = Math.floor(map.height / 2) * TILE_SIZE + TILE_SIZE / 2;

    this.player = this.physics.add.sprite(spawnX, spawnY, DEFAULT_PLAYER_SPRITE, 'down');
    this.player.setDepth(4);
    this.player.body.setSize(20, 20);
    this.player.body.setOffset(6, 12);

    // Add collision with the collision layer
    const collisionLayer = this.worldRenderer.getCollisionLayer();
    if (collisionLayer) {
      this.physics.add.collider(this.player, collisionLayer);
    }

    // Add a "YOU" tag above the player
    const tag = this.add.text(0, 0, 'YOU', {
      fontSize: '10px', fontStyle: 'bold', color: '#ffc107',
      backgroundColor: '#000000cc', padding: { x: 4, y: 2 },
    }).setOrigin(0.5, 1).setDepth(1000);

    // Update tag position each frame
    this.events.on('update', () => {
      tag.setPosition(this.player.x, this.player.y - 20);
    });
  }

  // Agent rendering
  private renderAgents(agents: AgentState[]): void {
    for (const agent of agents) {
      this.createAgentSprite(agent);
    }
  }

  private createAgentSprite(agent: AgentState): void {
    const px = agent.x * TILE_SIZE + TILE_SIZE / 2;
    const py = agent.y * TILE_SIZE + TILE_SIZE / 2;

    const children: Phaser.GameObjects.GameObject[] = [];

    // Use character atlas sprite if available, otherwise fallback circle
    const spriteName = agent.sprite_key || agent.name.replace(/ /g, '_');
    if (this.textures.exists(spriteName)) {
      const sprite = this.add.sprite(0, 0, spriteName, 'down');
      sprite.setName('sprite');
      children.push(sprite);
    } else {
      // Fallback colored circle
      const gfx = this.add.graphics();
      const agentColors = [0xff4444, 0x4488ff, 0x44cc44, 0xffaa00, 0xff44ff];
      const colorIdx = Math.abs(agent.id.split('').reduce((a, c) => a + c.charCodeAt(0), 0)) % agentColors.length;
      gfx.fillStyle(agentColors[colorIdx], 1);
      gfx.fillCircle(0, 0, TILE_SIZE * 0.4);
      gfx.lineStyle(2, 0xffffff, 1);
      gfx.strokeCircle(0, 0, TILE_SIZE * 0.4);
      children.push(gfx);
    }

    const nameTag = this.add.text(0, -TILE_SIZE * 0.7, agent.name, {
      fontSize: '10px', color: '#ffffff',
      backgroundColor: '#000000cc', padding: { x: 3, y: 1 },
    }).setOrigin(0.5, 1);
    children.push(nameTag);

    const actionTag = this.add.text(0, TILE_SIZE * 0.6, agent.current_action, {
      fontSize: '9px', color: '#cccccc',
      backgroundColor: '#00000088', padding: { x: 2, y: 1 },
    }).setOrigin(0.5, 0);
    actionTag.setName('actionLabel');
    children.push(actionTag);

    const container = this.add.container(px, py, children);
    container.setDepth(4);
    this.agentSprites.set(agent.id, container);
  }

  private updateAgentPositions(agents: AgentState[]): void {
    for (const agent of agents) {
      const container = this.agentSprites.get(agent.id);
      if (!container) {
        this.createAgentSprite(agent);
        continue;
      }
      const px = agent.x * TILE_SIZE + TILE_SIZE / 2;
      const py = agent.y * TILE_SIZE + TILE_SIZE / 2;

      // Determine direction for walking animation
      const dx = px - container.x;
      const dy = py - container.y;
      const spriteName = agent.sprite_key || agent.name.replace(/ /g, '_');
      const sprite = container.getByName('sprite') as Phaser.GameObjects.Sprite | null;

      if (sprite && this.textures.exists(spriteName) && (Math.abs(dx) > 1 || Math.abs(dy) > 1)) {
        let animKey: string;
        if (Math.abs(dx) > Math.abs(dy)) {
          animKey = dx < 0 ? `${spriteName}_left_walk` : `${spriteName}_right_walk`;
        } else {
          animKey = dy < 0 ? `${spriteName}_up_walk` : `${spriteName}_down_walk`;
        }
        if (this.anims.exists(animKey)) {
          sprite.anims.play(animKey, true);
        }
      }

      this.tweens.add({
        targets: container,
        x: px, y: py,
        duration: 300,
        ease: 'Power2',
        onComplete: () => {
          if (sprite) sprite.anims.stop();
        },
      });

      const actionLabel = container.getByName('actionLabel') as Phaser.GameObjects.Text;
      if (actionLabel) {
        actionLabel.setText(agent.current_action);
      }
    }
  }
}
