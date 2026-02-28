/**
 * Embedded copy of seed_world.json so the frontend can render
 * the map even when the backend is not running.
 */
export const FALLBACK_SEED_WORLD = {
  expansion_count: 0,
  environment_root: {
    id: 'world', name: 'Willowbrook',
    description: 'A small, quiet town where everyone knows each other.',
    node_type: 'world', tile_key: 'grass',
    x: 0, y: 0, w: 40, h: 30, walkable: true,
    children: [
      {
        id: 'town_square', name: 'Town Square',
        description: 'The central gathering place of Willowbrook.',
        node_type: 'zone', tile_key: 'dirt_path',
        x: 14, y: 10, w: 12, h: 10, walkable: true,
        children: [
          { id: 'fountain_01', name: 'Town Fountain', description: 'A stone fountain.', node_type: 'object', tile_key: 'fountain', x: 18, y: 14, w: 2, h: 2, walkable: false, children: [] },
          { id: 'bench_01', name: 'Park Bench', description: 'A wooden bench.', node_type: 'object', tile_key: 'bench', x: 16, y: 16, w: 1, h: 1, walkable: false, children: [] },
          { id: 'bench_02', name: 'Park Bench', description: 'Another bench.', node_type: 'object', tile_key: 'bench', x: 22, y: 14, w: 1, h: 1, walkable: false, children: [] },
          { id: 'tree_sq_01', name: 'Oak Tree', description: 'A tall oak.', node_type: 'object', tile_key: 'tree_oak', x: 14, y: 10, w: 1, h: 1, walkable: false, children: [] },
          { id: 'tree_sq_02', name: 'Oak Tree', description: 'Another oak.', node_type: 'object', tile_key: 'tree_oak', x: 25, y: 10, w: 1, h: 1, walkable: false, children: [] },
          { id: 'lamp_01', name: 'Street Lamp', description: 'A lamp post.', node_type: 'object', tile_key: 'lamp_post', x: 15, y: 13, w: 1, h: 1, walkable: false, children: [] },
        ],
      },
      {
        id: 'main_road', name: 'Main Street',
        description: 'The road connecting the town square to the residential area.',
        node_type: 'zone', tile_key: 'road',
        x: 8, y: 13, w: 6, h: 3, walkable: true,
        children: [],
      },
      {
        id: 'house_01', name: 'Johnson Residence',
        description: 'A cozy two-room house on the west side of town.',
        node_type: 'building', tile_key: 'house_exterior',
        x: 2, y: 10, w: 6, h: 8, walkable: false,
        children: [
          {
            id: 'house_01_kitchen', name: 'Kitchen',
            description: 'A small kitchen.',
            node_type: 'room', tile_key: 'floor_tile',
            x: 2, y: 10, w: 6, h: 4, walkable: true,
            children: [
              { id: 'kitchen_stove', name: 'Stove', description: 'A gas stove.', node_type: 'object', tile_key: 'stove', x: 2, y: 10, w: 1, h: 1, walkable: false, children: [] },
              { id: 'kitchen_fridge', name: 'Refrigerator', description: 'A fridge.', node_type: 'object', tile_key: 'fridge', x: 3, y: 10, w: 1, h: 1, walkable: false, children: [] },
              { id: 'kitchen_sink', name: 'Sink', description: 'A kitchen sink.', node_type: 'object', tile_key: 'sink', x: 4, y: 10, w: 1, h: 1, walkable: false, children: [] },
              { id: 'kitchen_table', name: 'Kitchen Table', description: 'A small table.', node_type: 'object', tile_key: 'kitchen_table', x: 5, y: 12, w: 1, h: 1, walkable: false, children: [] },
              { id: 'kitchen_chair_01', name: 'Chair', description: 'A wooden chair.', node_type: 'object', tile_key: 'chair', x: 4, y: 12, w: 1, h: 1, walkable: false, children: [] },
              { id: 'kitchen_chair_02', name: 'Chair', description: 'Another chair.', node_type: 'object', tile_key: 'chair', x: 6, y: 12, w: 1, h: 1, walkable: false, children: [] },
            ],
          },
          { id: 'house_01_door', name: 'Front Door', description: 'The front door.', node_type: 'object', tile_key: 'door', x: 5, y: 14, w: 1, h: 1, walkable: true, children: [] },
          {
            id: 'house_01_bedroom', name: 'Bedroom',
            description: 'A cozy bedroom.',
            node_type: 'room', tile_key: 'floor_carpet',
            x: 2, y: 14, w: 6, h: 4, walkable: true,
            children: [
              { id: 'bedroom_bed', name: 'Bed', description: 'A single bed.', node_type: 'object', tile_key: 'bed', x: 2, y: 15, w: 1, h: 2, walkable: false, children: [] },
              { id: 'bedroom_desk', name: 'Desk', description: 'A writing desk.', node_type: 'object', tile_key: 'desk', x: 5, y: 14, w: 1, h: 1, walkable: false, children: [] },
              { id: 'bedroom_bookshelf', name: 'Bookshelf', description: 'A tall bookshelf.', node_type: 'object', tile_key: 'bookshelf', x: 7, y: 14, w: 1, h: 1, walkable: false, children: [] },
            ],
          },
        ],
      },
      {
        id: 'park_area', name: 'Willowbrook Park',
        description: 'A small grassy park north of the square.',
        node_type: 'zone', tile_key: 'grass',
        x: 14, y: 2, w: 12, h: 7, walkable: true,
        children: [
          { id: 'park_tree_01', name: 'Pine Tree', description: 'A tall pine.', node_type: 'object', tile_key: 'tree_pine', x: 15, y: 3, w: 1, h: 1, walkable: false, children: [] },
          { id: 'park_tree_02', name: 'Pine Tree', description: 'Another pine.', node_type: 'object', tile_key: 'tree_pine', x: 20, y: 4, w: 1, h: 1, walkable: false, children: [] },
          { id: 'park_tree_03', name: 'Oak Tree', description: 'A wide oak.', node_type: 'object', tile_key: 'tree_oak', x: 24, y: 3, w: 1, h: 1, walkable: false, children: [] },
          { id: 'park_flowers', name: 'Flower Bed', description: 'Wildflowers.', node_type: 'object', tile_key: 'flower_bed', x: 17, y: 5, w: 1, h: 1, walkable: true, children: [] },
          { id: 'park_bench', name: 'Park Bench', description: 'A bench.', node_type: 'object', tile_key: 'bench', x: 23, y: 4, w: 1, h: 1, walkable: false, children: [] },
          { id: 'park_bush_01', name: 'Bush', description: 'A trimmed hedge.', node_type: 'object', tile_key: 'bush', x: 14, y: 2, w: 1, h: 1, walkable: false, children: [] },
        ],
      },
      { id: 'mailbox_01', name: 'Mailbox', description: 'The Johnson family mailbox.', node_type: 'object', tile_key: 'mailbox', x: 8, y: 12, w: 1, h: 1, walkable: false, children: [] },
    ],
  },
  agents: [
    { id: 'agent_sam', name: 'Sam Johnson', location_id: 'house_01_kitchen', current_action: 'Making morning coffee', x: 4, y: 11, sprite_key: 'character_1', description: '', daily_plan: null, current_plan_step: 0, day_number: 1 },
    { id: 'agent_maya', name: 'Maya Chen', location_id: 'town_square', current_action: 'Sitting on the bench reading', x: 16, y: 16, sprite_key: 'character_2', description: '', daily_plan: null, current_plan_step: 0, day_number: 1 },
  ],
};
