# Runs the bundled stdio MCP server. Pass COMMENTKEYWORD_API_TOKEN at runtime.
FROM node:22-alpine
WORKDIR /app
COPY dist/index.mjs ./index.mjs
ENTRYPOINT ["node", "index.mjs"]
