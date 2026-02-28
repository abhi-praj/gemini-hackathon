import { ApiClient, AgentState } from './ApiClient';

/**
 * UIPanel — DOM-based sidebar control panel for interacting with agents.
 */
export class UIPanel {
    private api: ApiClient;
    private root: HTMLElement;
    private agents: AgentState[] = [];
    private selectedAgentId: string = '';

    // DOM refs
    private agentSelect!: HTMLSelectElement;
    private chatInput!: HTMLInputElement;
    private chatLog!: HTMLDivElement;
    private innerVoiceInput!: HTMLInputElement;
    private innerVoiceResult!: HTMLDivElement;
    private tickResult!: HTMLDivElement;
    private planResult!: HTMLDivElement;
    private relResult!: HTMLDivElement;
    private activityLog!: HTMLDivElement;

    // Track all inputs for focus detection
    private allInputs: HTMLElement[] = [];

    constructor(api: ApiClient) {
        this.api = api;
        this.root = document.getElementById('panel')!;
        this.build();
    }

    /** Returns true if any sidebar input is focused (so scene can skip WASD) */
    isInputFocused(): boolean {
        return this.allInputs.some(el => el === document.activeElement);
    }

    /** Update agent list from world state */
    setAgents(agents: AgentState[]): void {
        this.agents = agents;
        const prev = this.selectedAgentId;
        this.agentSelect.innerHTML = '';
        for (const a of agents) {
            const opt = document.createElement('option');
            opt.value = a.id;
            opt.textContent = a.name;
            this.agentSelect.appendChild(opt);
        }
        if (agents.find(a => a.id === prev)) {
            this.agentSelect.value = prev;
        } else if (agents.length > 0) {
            this.agentSelect.value = agents[0].id;
        }
        this.selectedAgentId = this.agentSelect.value;
    }

    // ── Build DOM ──────────────────────────────────────────────────────

    private build(): void {
        this.root.innerHTML = '';

        // Header
        this.el('div', { className: 'panel-header', text: 'Willowbrook Control' }, this.root);

        // Agent selector
        this.buildAgentSelector();
        // Chat
        this.buildChat();
        // Actions (Tick + Inner Voice)
        this.buildActions();
        // Plan
        this.buildPlan();
        // Relationships
        this.buildRelationships();
        // Map expand
        this.buildMapExpand();
        // Activity log
        this.buildActivityLog();
    }

    private buildAgentSelector(): void {
        const sec = this.section('Agent');
        this.agentSelect = document.createElement('select');
        this.agentSelect.addEventListener('change', () => {
            this.selectedAgentId = this.agentSelect.value;
        });
        sec.appendChild(this.agentSelect);
    }

    private buildChat(): void {
        const sec = this.section('Chat');
        const row = this.el('div', { className: 'input-row' }, sec);
        this.chatInput = document.createElement('input');
        this.chatInput.type = 'text';
        this.chatInput.placeholder = 'Type message...';
        this.chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.onChat();
        });
        row.appendChild(this.chatInput);
        this.allInputs.push(this.chatInput);

        const btn = this.el('button', { className: 'primary', text: 'Send' }, row) as HTMLButtonElement;
        btn.addEventListener('click', () => this.onChat());

        this.chatLog = this.el('div', { className: 'response-box' }, sec) as HTMLDivElement;
    }

    private buildActions(): void {
        const sec = this.section('Actions');

        // Tick buttons
        const tickRow = this.el('div', { className: 'btn-row' }, sec);
        const tickOne = this.el('button', { text: 'Tick Agent' }, tickRow) as HTMLButtonElement;
        tickOne.addEventListener('click', () => this.onTick(false));
        const tickAll = this.el('button', { text: 'Tick All' }, tickRow) as HTMLButtonElement;
        tickAll.addEventListener('click', () => this.onTick(true));

        this.tickResult = this.el('div', { className: 'response-box' }, sec) as HTMLDivElement;

        // Inner voice
        const voiceRow = this.el('div', { className: 'input-row' }, sec);
        this.innerVoiceInput = document.createElement('input');
        this.innerVoiceInput.type = 'text';
        this.innerVoiceInput.placeholder = 'Inner voice command...';
        this.innerVoiceInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') this.onInnerVoice();
        });
        voiceRow.appendChild(this.innerVoiceInput);
        this.allInputs.push(this.innerVoiceInput);

        const voiceBtn = this.el('button', { text: 'Send' }, voiceRow) as HTMLButtonElement;
        voiceBtn.addEventListener('click', () => this.onInnerVoice());

        this.innerVoiceResult = this.el('div', { className: 'response-box' }, sec) as HTMLDivElement;
    }

    private buildPlan(): void {
        const sec = this.section('Plan');
        const row = this.el('div', { className: 'btn-row' }, sec);
        const viewBtn = this.el('button', { text: 'View Plan' }, row) as HTMLButtonElement;
        viewBtn.addEventListener('click', () => this.onViewPlan());
        const regenBtn = this.el('button', { text: 'Regenerate' }, row) as HTMLButtonElement;
        regenBtn.addEventListener('click', () => this.onRegeneratePlan());

        this.planResult = this.el('div', { className: 'response-box' }, sec) as HTMLDivElement;
    }

    private buildRelationships(): void {
        const sec = this.section('Relationships');
        const row = this.el('div', { className: 'btn-row' }, sec);
        const btn = this.el('button', { text: 'View Relationships' }, row) as HTMLButtonElement;
        btn.addEventListener('click', () => this.onViewRelationships());

        this.relResult = this.el('div', { className: 'response-box' }, sec) as HTMLDivElement;
    }

    private buildMapExpand(): void {
        const sec = this.section('Expand Map');
        const grid = this.el('div', { className: 'dir-grid' }, sec);

        // Row 1: _ N _
        this.el('div', {}, grid);
        const n = this.el('button', { text: 'N' }, grid) as HTMLButtonElement;
        n.addEventListener('click', () => this.onExpand('north'));
        this.el('div', {}, grid);

        // Row 2: W _ E
        const w = this.el('button', { text: 'W' }, grid) as HTMLButtonElement;
        w.addEventListener('click', () => this.onExpand('west'));
        this.el('div', {}, grid);
        const e = this.el('button', { text: 'E' }, grid) as HTMLButtonElement;
        e.addEventListener('click', () => this.onExpand('east'));

        // Row 3: _ S _
        this.el('div', {}, grid);
        const s = this.el('button', { text: 'S' }, grid) as HTMLButtonElement;
        s.addEventListener('click', () => this.onExpand('south'));
        this.el('div', {}, grid);
    }

    private buildActivityLog(): void {
        const sec = this.section('Activity Log');
        this.activityLog = this.el('div', { className: 'activity-log' }, sec) as HTMLDivElement;
    }

    // ── Event handlers ─────────────────────────────────────────────────

    private async onChat(): Promise<void> {
        const msg = this.chatInput.value.trim();
        if (!msg || !this.selectedAgentId) return;
        this.chatInput.value = '';

        const agentName = this.getAgentName();
        this.appendChat(`You → ${agentName}: ${msg}`, '#c9d1d9');
        this.log('chat', `Sending to ${agentName}...`);

        try {
            const res = await this.api.chat(this.selectedAgentId, msg);
            this.appendChat(`${agentName}: ${res.reply}`, '#58a6ff');
            this.log('chat', `${agentName} replied`);
        } catch (e: any) {
            this.appendChat(`Error: ${e.message}`, '#f85149');
            this.log('error', e.message);
        }
    }

    private async onInnerVoice(): Promise<void> {
        const cmd = this.innerVoiceInput.value.trim();
        if (!cmd || !this.selectedAgentId) return;
        this.innerVoiceInput.value = '';

        const agentName = this.getAgentName();
        this.log('inner-voice', `Command to ${agentName}: ${cmd}`);

        try {
            const res = await this.api.innerVoice(this.selectedAgentId, cmd);
            this.innerVoiceResult.textContent = res.result;
            this.log('inner-voice', `${agentName}: ${res.result.slice(0, 60)}...`);
        } catch (e: any) {
            this.innerVoiceResult.textContent = `Error: ${e.message}`;
            this.log('error', e.message);
        }
    }

    private async onTick(all: boolean): Promise<void> {
        const agentName = all ? 'all agents' : this.getAgentName();
        this.log('tick', `Ticking ${agentName}...`);
        this.tickResult.innerHTML = '<span class="spinner"></span> Ticking...';

        try {
            const res = await this.api.tick(all ? undefined : this.selectedAgentId);
            let html = '';
            for (const r of res.results) {
                const name = this.agents.find(a => a.id === r.agent_id)?.name ?? r.agent_id;
                const icon = r.success ? '✓' : '✗';
                html += `<div><strong>${icon} ${name}</strong>: ${r.action}</div>`;
                if (r.detail) html += `<div style="color:#8b949e;margin-left:12px">${r.detail}</div>`;
            }
            this.tickResult.innerHTML = html || 'No results';
            this.log('tick', `Completed — ${res.results.length} result(s)`);
        } catch (e: any) {
            this.tickResult.innerHTML = `<span style="color:#f85149">Error: ${e.message}</span>`;
            this.log('error', e.message);
        }
    }

    private async onViewPlan(): Promise<void> {
        if (!this.selectedAgentId) return;
        const agentName = this.getAgentName();
        this.log('plan', `Fetching plan for ${agentName}...`);
        this.planResult.innerHTML = '<span class="spinner"></span> Loading...';

        try {
            const res = await this.api.getPlan(this.selectedAgentId);
            this.renderPlan(res);
            this.log('plan', `Plan loaded for ${agentName}`);
        } catch (e: any) {
            this.planResult.innerHTML = `<span style="color:#f85149">Error: ${e.message}</span>`;
            this.log('error', e.message);
        }
    }

    private async onRegeneratePlan(): Promise<void> {
        if (!this.selectedAgentId) return;
        const agentName = this.getAgentName();
        this.log('plan', `Regenerating plan for ${agentName}...`);
        this.planResult.innerHTML = '<span class="spinner"></span> Regenerating...';

        try {
            const res = await this.api.regeneratePlan(this.selectedAgentId);
            this.renderPlan(res);
            this.log('plan', `Plan regenerated for ${agentName}`);
        } catch (e: any) {
            this.planResult.innerHTML = `<span style="color:#f85149">Error: ${e.message}</span>`;
            this.log('error', e.message);
        }
    }

    private async onViewRelationships(): Promise<void> {
        if (!this.selectedAgentId) return;
        const agentName = this.getAgentName();
        this.log('social', `Fetching relationships for ${agentName}...`);
        this.relResult.innerHTML = '<span class="spinner"></span> Loading...';

        try {
            const res = await this.api.getRelationships(this.selectedAgentId);
            if (!res.relationships || res.relationships.length === 0) {
                this.relResult.innerHTML = '<span style="color:#8b949e">No relationships yet</span>';
            } else {
                let html = '';
                for (const r of res.relationships) {
                    html += `<div class="rel-card">`;
                    html += `<span class="rel-name">${r.target_name ?? r.target_id ?? 'Unknown'}</span> `;
                    html += `<span class="rel-type">${r.relationship_type ?? r.type ?? ''}</span>`;
                    if (r.closeness != null) html += `<span class="rel-type"> · closeness: ${r.closeness}</span>`;
                    if (r.description) html += `<div style="color:#8b949e;margin-top:2px">${r.description}</div>`;
                    html += `</div>`;
                }
                this.relResult.innerHTML = html;
            }
            this.log('social', `Loaded ${res.relationships?.length ?? 0} relationships`);
        } catch (e: any) {
            this.relResult.innerHTML = `<span style="color:#f85149">Error: ${e.message}</span>`;
            this.log('error', e.message);
        }
    }

    private async onExpand(direction: string): Promise<void> {
        this.log('expand', `Expanding ${direction}...`);
        try {
            const res = await this.api.expandWorld(direction, 0, 0);
            if (res.success) {
                this.log('expand', `Expanded ${direction} — new zone added`);
            } else {
                this.log('expand', `Expansion ${direction} — ${res.detail ?? 'no change'}`);
            }
        } catch (e: any) {
            this.log('error', `Expand ${direction}: ${e.message}`);
        }
    }

    // ── Render helpers ─────────────────────────────────────────────────

    private renderPlan(data: any): void {
        const plan: string[] = data.daily_plan ?? data.plan ?? data.steps ?? [];
        const currentStep: number = data.current_plan_step ?? data.current_step ?? -1;

        if (!plan || plan.length === 0) {
            this.planResult.innerHTML = '<span style="color:#8b949e">No plan available</span>';
            return;
        }

        let html = '';
        for (let i = 0; i < plan.length; i++) {
            const isCurrent = i === currentStep;
            html += `<div class="plan-step${isCurrent ? ' current' : ''}">${i + 1}. ${plan[i]}${isCurrent ? ' ◄' : ''}</div>`;
        }
        this.planResult.innerHTML = html;
    }

    private appendChat(text: string, color: string): void {
        const line = document.createElement('div');
        line.style.color = color;
        line.style.marginBottom = '4px';
        line.textContent = text;
        this.chatLog.appendChild(line);
        this.chatLog.style.display = 'block';
        this.chatLog.scrollTop = this.chatLog.scrollHeight;
    }

    private log(action: string, message: string): void {
        const time = new Date().toLocaleTimeString('en-US', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
        const entry = document.createElement('div');
        entry.className = 'log-entry';
        const isError = action === 'error';
        entry.innerHTML = `<span class="log-time">${time}</span> <span class="${isError ? 'log-error' : 'log-action'}">[${action}]</span> <span class="${isError ? 'log-error' : 'log-result'}">${this.escapeHtml(message)}</span>`;
        this.activityLog.appendChild(entry);
        this.activityLog.scrollTop = this.activityLog.scrollHeight;
    }

    private getAgentName(): string {
        return this.agents.find(a => a.id === this.selectedAgentId)?.name ?? this.selectedAgentId;
    }

    // ── DOM utilities ──────────────────────────────────────────────────

    private section(title: string): HTMLDivElement {
        const sec = document.createElement('div');
        sec.className = 'section';
        const h = document.createElement('div');
        h.className = 'section-title';
        h.textContent = title;
        sec.appendChild(h);
        this.root.appendChild(sec);
        return sec;
    }

    private el(tag: string, opts: { className?: string; text?: string }, parent: HTMLElement): HTMLElement {
        const el = document.createElement(tag);
        if (opts.className) el.className = opts.className;
        if (opts.text) el.textContent = opts.text;
        parent.appendChild(el);
        return el;
    }

    private escapeHtml(s: string): string {
        return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}
