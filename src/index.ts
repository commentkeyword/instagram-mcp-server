import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CommentKeywordClient, DEFAULT_BASE_URL } from './client.js';
import { createServer, SERVER_VERSION } from './server.js';

const token = process.env.COMMENTKEYWORD_API_TOKEN?.trim();
if (!token) {
  console.error(
    'COMMENTKEYWORD_API_TOKEN is not set. Create a token in CommentKeyword (Settings → API, https://commentkeyword.com/settings?tab=api) and pass it to this server as an environment variable.',
  );
  process.exit(1);
}

const client = new CommentKeywordClient({
  token,
  baseUrl: process.env.COMMENTKEYWORD_API_URL?.trim() || DEFAULT_BASE_URL,
  userAgent: `commentkeyword-mcp/${SERVER_VERSION}`,
});

await createServer(client).connect(new StdioServerTransport());
