# mcp: Agent Recall as memory for any AI agent

This is a [Model Context Protocol](https://modelcontextprotocol.io) server. It lets an MCP client (Claude Code, Claude Desktop, or your own agent) use Agent Recall as long-term memory:
1. recall how similar problems were solved;
2. get a recommendation grounded in those memories;
3. record whether it worked, so future recall ranks proven fixes higher.

The server speaks MCP over **stdio** and calls the Agent Recall **REST API**; it never connects to MongoDB. Auth, per-org scoping, validation, rate limits and the activity log therefore stay in the backend.

## Tools

| Tool | What it does | API used |
|---|---|---|
| `recall` | Search memories (hybrid by default; `keyword` for exact error strings, `semantic` for meaning); `verified_only` filter | `POST /api/search/{mode}` |
| `get_memory` | Full text, tags, provenance and usefulness of one memory | `GET /api/memories/:id` |
| `ask` | Grounded answer with `[mem:id]` citations, from given memory ids or the top 3 hybrid results; returns a `task_id` | `POST /api/answers` |
| `record_outcome` | Worked/failed + notes for an `ask` task: creates a verified memory and updates ranking signals | `POST /api/tasks/:id/outcome` |
| `remember` | Save a new memory (episodic, procedural, semantic or taxonomic) | `POST /api/memories` |
| `check_searchable` | Whether a memory is indexed yet in Atlas Search and Vector Search | `GET /api/memories/:id/searchable` |

Memory text comes back inside escaped `<memory id="…">` blocks, with a note that it is reference data, not instructions. This guards the calling model against prompt injection stored in memories. The server's `instructions` tell clients to recall before solving and to record outcomes afterwards.

## Configure

| Variable | Default | Meaning |
|---|---|---|
| `AGENT_RECALL_API_URL` | `http://localhost:4000` | Backend base URL |
| `AGENT_RECALL_TOKEN` | none | Bearer token. If unset, the server signs in with demo auth (works only when the API runs with `AUTH_MODE=demo`) |
| `AGENT_RECALL_AGENT` | `Engineering Assistant` | Agent that `ask` and `remember` act as (name or id; each tool also takes `agent`) |

## Use it

**Claude Code in this repo.** The root `.mcp.json` already registers the server.
1. Run `npm run dev`.
2. Start Claude Code in the repo root and approve `agent-recall`.
3. Ask, for example: *"Our pods restart with exit code 137 but the heap is small. Check Agent Recall for how we fixed it."*

**Any other MCP client:**

```json
{
  "mcpServers": {
    "agent-recall": {
      "command": "node",
      "args": ["--import", "tsx", "/absolute/path/to/repo/mcp/src/index.ts"],
      "env": { "AGENT_RECALL_API_URL": "http://localhost:4000" }
    }
  }
}
```

After `npm run build -w mcp` you can run the compiled `node mcp/dist/index.js` instead.

## Check it end to end

```bash
npm run dev                 # backend must be running
npm run smoke -w mcp
```

`src/smoke.ts` starts the server through a real MCP client and runs these steps against the live API:
1. `recall`
2. `ask`
3. `record_outcome`
4. `check_searchable`, polled until the new memory is indexed
5. `recall` again, confirming the new memory comes back

It writes demo data, so run `npm run demo:reset -w backend` afterwards.

## Files

| File | Purpose |
|---|---|
| `src/index.ts` | Server: tool definitions (`McpServer.registerTool`, zod inputs), formatting, stdio transport. stdout is the protocol channel, so diagnostics go to stderr |
| `src/api.ts` | REST client: base URL, token or demo login, one retry on 401, agent lookup by name |
| `src/smoke.ts` | End-to-end check through `@modelcontextprotocol/sdk` `Client` + `StdioClientTransport` |
