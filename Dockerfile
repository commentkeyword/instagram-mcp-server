# Runs the stdio MCP server (no dependencies). Pass COMMENTKEYWORD_API_TOKEN at runtime.
FROM node:22-alpine
WORKDIR /app
COPY server/ ./server/
ENTRYPOINT ["node", "server/commentkeyword-mcp.mjs"]
