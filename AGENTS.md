## 1. What We Are Building
We are building a dynamic, AI-driven sandbox game (reminiscent of *The Sims*) where users can prompt entire functional worlds into existence. Instead of hard-coding character paths and town maps, our engine will leverage large language models (LLMs) to populate a living, breathing community. 

**Core Features for the Hackathon:**
*   **Prompt-to-World Generation:** The user provides a text prompt defining the environment and character types. The system maps this prompt to pre-existing visual assets (tilesets/sprites) and initializes a set of agents with natural language seed personas.
*   **Procedural Map Expansion:** As the user walks past the edge of the current map, the system dynamically generates new environment components and agents based on the existing world context.
*   **Interactive Simulacra:** Agents will plan their days, form relationships, and react to their environment. 
*   **Direct User Interaction:** The user can embody an avatar to chat with agents, act as an agent's "inner voice" to command them, or alter the state of objects in the world.

---

## 2. How to Best Build This: The Architecture

### A. Game Engine and Environment State
`we will use the **Phaser web game development framework** to render sprite-based avatars and maps. 

*   **The Server Loop:** Build a server that maintains a universal JSON data structure representing the world. At each time step, the server parses the JSON for agent actions, moves the agents, updates object states (e.g., a coffee machine turning from "idle" to "brewing"), and sends local visual range data back to the agents.
*   **Tree-Based Environment Representation:** To allow the LLM to understand the 2D map, represent the **fixed, static parts** of the environment (e.g., landmarks, trees, buildings, and their permanent fixtures) as a **nested JSON tree**. Dynamic objects and agents are tracked separately.
    *   *Example:*
        ```json
        {
          "World": {
            "House": {
              "Kitchen": {
                "children": ["Stove", "Refrigerator", "Sink"]
              },
              "Bedroom": {
                "children": ["Bed", "Desk"]
              }
            },
            "Park": {
              "children": ["Oak Tree", "Bench", "Fountain"]
            }
          }
        }
        ```
    *   This JSON tree is passed directly to the LLM as-is, allowing it to parse the structured environment data natively.
*   **Procedural Edge Generation (Hackathon Extension):** When the user walks to the map's edge, prompt the LLM to generate new nodes to append to the root environment tree, constrained to your pre-existing asset list. Then, render those new JSON nodes using Phaser. Agents build their own spatial memory subgraphs as they explore these new areas.

### B. The Generative Agent Cognitive Architecture
To make the agents believable rather than reactive chatbots, you must implement a three-part cognitive architecture: **Memory, Reflection, and Planning**.

#### 1. Memory Stream and Retrieval
The agent cannot process its entire history at once. You must build a **Memory Stream**: a chronological database of every observation and event the agent experiences, stored in natural language with timestamps.
When an agent needs to act, query this database using a retrieval function that scores memories based on three factors (normalized to a scale):
*   **Recency:** Use an exponential decay function so recent events are prioritized.
*   **Importance:** Ask the LLM to rate the poignancy of an event on a scale of 1-10 (e.g., eating breakfast = 2, a breakup = 8).
*   **Relevance:** Calculate the cosine similarity between the embedding vector of the current situation and the embedding vectors of stored memories.

#### 2. Reflection (Higher-Level Synthesis)
To prevent agents from making shallow decisions, they must synthesize raw observations into insights.
*   Implement a background process that triggers when the sum of recent "Importance" scores hits a threshold (e.g., 150).
*   Prompt the LLM with the agent's 100 most recent records and ask it to generate the 3 most salient high-level questions about the data.
*   Use those questions to retrieve memories, prompt the LLM to extract insights, and save these new "Reflections" back into the memory stream as their own memories. 

#### 3. Planning and Reacting
Agents must act consistently over time. 
*   **Top-Down Planning:** Prompt the LLM with the agent's seed persona and a summary of the previous day to sketch out a 5-8 step daily agenda. 
*   Recursively ask the LLM to break those large chunks into 1-hour blocks, and then into 5-15 minute actionable increments. Save these plans into the memory stream.
*   **Reacting:** On every server tick, feed the agent's current observations to the LLM. Ask the LLM: *Should the agent continue with its existing plan, or react?*. If they react, regenerate the plan from that moment forward.

### C. Implementing User Interaction
We require users to be able to interact with the world seamlessly. You will implement three interaction vectors:
1.  **Conversational Avatars:** The user controls a sprite in the world. When approaching an agent, the user types in natural language. The agent retrieves context about the user from its memory stream and generates a dialogue response.
2.  **The "Inner Voice" Command:** To force an agent to adopt a new goal, the user can prompt them using the persona of the agent's "inner voice" (e.g., "You are going to run for mayor"). The agent will treat this as a directive and alter their plans.
3.  **Object State Manipulation:** Allow users to rewrite the state of the world in natural language. For instance, a user inputs `<kitchen: stove> is burning`. The server updates the JSON tree, the agent observes the change on the next tick, and dynamically replans to put out the fire. 

---

## 3. Next Steps
1.  **Phase 1 (Basic World & Avatar):** Set up the Phaser engine, the JSON state server, and map simple assets to a basic environment tree. 
2.  **Phase 2 (Agent Brains):** Build the Python backend that connects to the LLM. Implement the basic Memory Stream and Top-Down Planning.
3.  **Phase 3 (Retrieval & Reflection):** Add the vector database for relevance embeddings and the periodic reflection loop to make the agents smart.
4.  **Phase 4 (Procedural Generation & Interaction):** Implement the map-edge trigger that prompts the LLM to expand the environment tree and instantiate new agents. Add the user chat interface.