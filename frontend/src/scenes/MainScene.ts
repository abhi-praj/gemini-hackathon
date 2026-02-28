import Phaser from 'phaser';

export class MainScene extends Phaser.Scene {
    constructor() {
        super({ key: 'MainScene' });
    }

    preload() {
        // Preload assets here
    }

    create() {
        this.add.text(400, 300, 'Welcome to the AI World', {
            fontSize: '32px',
            color: '#ffffff'
        }).setOrigin(0.5);

        // Simple rectangle representation of an agent
        const graphics = this.add.graphics();
        graphics.fillStyle(0x00ff00, 1.0);
        graphics.fillRect(380, 200, 40, 40);

        // Placeholder for WebSocket connection logic
        this.connectWebSocket();
    }

    update(time: number, delta: number) {
        // Game loop updates here
    }

    connectWebSocket() {
        // Simple websocket setup
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        // Connect to the proxy we set up in vite.config.ts, or directly to backend if not using vite dev proxy
        let wsUrl = `${protocol}//${window.location.host}/ws`;
        
        try {
            const socket = new WebSocket(wsUrl);
            socket.onopen = () => {
                console.log('Connected to backend simulation server');
                // Could send initial message here
                socket.send("Hello from Phaser!");
            };
            socket.onmessage = (event) => {
                console.log('Message from server:', event.data);
            };
            socket.onerror = (error) => {
                console.warn('WebSocket error. (Is the backend running?):', error);
            };
            socket.onclose = () => {
                console.log('WebSocket disconnected');
            }
        } catch (e) {
            console.error("Failed to connect WebSocket", e);
        }
    }
}
