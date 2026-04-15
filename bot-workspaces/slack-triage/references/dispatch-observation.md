# Dispatch: OBSERVATION

**Goal:** Acknowledge without creating noise.

## Steps

1. **React with an emoji** -- pick one that matches the sentiment:
   - Positive ("just had a great session"): `:heart:`, `:star-struck:`, `:raised_hands:`
   - Neutral ("tried the new flow"): `:eyes:`, `:thumbsup:`
   - Reflective ("thinking about X"): `:thought_balloon:`, `:100:`

2. **Do NOT:**
   - Create issues
   - Reply in thread
   - Take any other action

React via MCP: `mcp__slack__conversations_add_message` is not needed -- use the Slack API reaction endpoint or simply skip if reaction support is not available. In that case, do nothing for observations.
