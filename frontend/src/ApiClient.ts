/**
 * ApiClient — REST + WebSocket client for the backend.
 */

export interface EnvironmentNode {
    id: string;
    name: string;
    description: string;
    node_type: string;
    tile_key: string | null;
    x: number;
    y: number;
    w: number;
    h: number;
    walkable: boolean;
    children: EnvironmentNode[];
}

export interface AgentState {
    id: string;
    name: string;
    location_id: string;
    current_action: string;
    x: number;
    y: number;
    sprite_key: string;
    description: string;
    daily_plan: string[] | null;
    current_plan_step: number;
    day_number: number;
}

export interface WorldState {
    environment_root: EnvironmentNode;
    agents: AgentState[];
    expansion_count: number;
}

export interface AssetEntry {
    sprite: string;
    category: string;
    walkable?: boolean;
    description?: string;
    interactable?: boolean;
    w?: number;
    h?: number;
}

export interface AssetRegistry {
    _meta: { tile_size: number; render_scale: number; description: string };
    [category: string]: { [key: string]: AssetEntry } | any;
}

export type StateUpdateCallback = (state: WorldState) => void;

export class ApiClient {
    private ws: WebSocket | null = null;
    private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
    private stateCallbacks: StateUpdateCallback[] = [];

    async fetchState(): Promise<WorldState> {
        const res = await fetch('/state');
        return res.json();
    }

    async fetchAssets(): Promise<AssetRegistry> {
        const res = await fetch('/api/assets');
        return res.json();
    }

    async expandWorld(direction: string, x: number, y: number): Promise<any> {
        const res = await fetch('/world/expand', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ direction, trigger_x: x, trigger_y: y }),
        });
        return res.json();
    }

    onStateUpdate(callback: StateUpdateCallback): void {
        this.stateCallbacks.push(callback);
    }

    connectWebSocket(): void {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}/ws`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
            };

            this.ws.onmessage = (event) => {
                try {
                    const data = JSON.parse(event.data);
                    if (data.action === 'state_update' && data.state) {
                        for (const cb of this.stateCallbacks) {
                            cb(data.state);
                        }
                    }
                } catch (e) {
                    console.warn('Failed to parse WS message:', e);
                }
            };

            this.ws.onerror = (error) => {
                console.warn('WebSocket error:', error);
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected, reconnecting in 3s...');
                this.scheduleReconnect();
            };
        } catch (e) {
            console.error('Failed to connect WebSocket:', e);
            this.scheduleReconnect();
        }
    }

    private scheduleReconnect(): void {
        if (this.reconnectTimer) return;
        this.reconnectTimer = setTimeout(() => {
            this.reconnectTimer = null;
            this.connectWebSocket();
        }, 3000);
    }

    sendWs(data: Record<string, any>): void {
        if (this.ws && this.ws.readyState === WebSocket.OPEN) {
            this.ws.send(JSON.stringify(data));
        }
    }
}
