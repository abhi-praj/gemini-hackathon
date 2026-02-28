/**
 * Fallback agent data for when the backend is offline.
 * The tilemap itself is always loaded from static assets,
 * so we only need sample agent positions on the ville map.
 */
import { AgentState } from './ApiClient';

export const FALLBACK_AGENTS: AgentState[] = [
  {
    id: 'agent_isabella',
    name: 'Isabella Rodriguez',
    location_id: 'cafe',
    current_action: 'Wiping down the counter',
    x: 72, y: 14,
    sprite_key: 'Isabella_Rodriguez',
    description: 'Cafe owner',
    daily_plan: null,
    current_plan_step: 0,
    day_number: 1,
  },
  {
    id: 'agent_klaus',
    name: 'Klaus Mueller',
    location_id: 'library',
    current_action: 'Reading a research paper',
    x: 100, y: 42,
    sprite_key: 'Klaus_Mueller',
    description: 'Research student',
    daily_plan: null,
    current_plan_step: 0,
    day_number: 1,
  },
];
