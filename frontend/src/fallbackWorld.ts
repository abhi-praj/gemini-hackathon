/**
 * Fallback agent data for when the backend is offline.
 * Sprite keys match CHARACTER_NAMES loaded in BootScene.
 * Positions are on the_ville map (140x100 tiles).
 */
import { AgentState } from './ApiClient';

export const FALLBACK_AGENTS: AgentState[] = [
  {
    id: 'agent_sam',
    name: 'Sam Moore',
    location_id: 'town_square',
    current_action: 'Making morning coffee',
    x: 70, y: 50,
    sprite_key: 'Sam_Moore',
    description: 'A friendly neighbor',
    daily_plan: null,
    current_plan_step: 0,
    day_number: 1,
  },
  {
    id: 'agent_mei',
    name: 'Mei Lin',
    location_id: 'park',
    current_action: 'Sitting on the bench reading',
    x: 74, y: 48,
    sprite_key: 'Mei_Lin',
    description: 'A bookworm',
    daily_plan: null,
    current_plan_step: 0,
    day_number: 1,
  },
];
