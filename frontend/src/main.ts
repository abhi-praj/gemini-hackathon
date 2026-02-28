import Phaser from 'phaser';
import { MainScene } from './scenes/MainScene';

const config: Phaser.Types.Core.GameConfig = {
    type: Phaser.AUTO,
    parent: 'app',
    width: 800,
    height: 600,
    physics: {
        default: 'arcade',
        arcade: {
            gravity: { y: 0, x: 0 },
            debug: false
        }
    },
    scene: [MainScene]
};

const game = new Phaser.Game(config);
