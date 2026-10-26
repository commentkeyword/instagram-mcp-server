import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CommentKeywordClient, DEFAULT_BASE_URL } from './client.js';
import { createServer, SERVER_VERSION } from './server.js';

const MISSING_TOKEN =
  'COMMENTKEYWORD_API_TOKEN is not set. Create a token in CommentKeyword (Settings → API, https://commentkeyword.com/settings?tab=api) and pass it to this server as an environment variable.';

// Start without a token so clients can list the tools; each tool call reports the missing token.
const token = process.env.COMMENTKEYWORD_API_TOKEN?.trim();
if (!token) console.error(MISSING_TOKEN);

const client = new CommentKeywordClient({
  token: token ?? '',
  baseUrl: process.env.COMMENTKEYWORD_API_URL?.trim() || DEFAULT_BASE_URL,
  userAgent: `commentkeyword-mcp/${SERVER_VERSION}`,
  missingTokenMessage: token ? undefined : MISSING_TOKEN,
});

await createServer(client).connect(new StdioServerTransport());
