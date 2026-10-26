#!/usr/bin/env node
// CommentKeyword MCP server (stdio entry point). See core.mjs for the tools and protocol handling.

import { createInterface } from 'node:readline';
import { createClient, createHandlers, DEFAULT_BASE_URL, handleMessage, MISSING_TOKEN } from './core.mjs';

const token = process.env.COMMENTKEYWORD_API_TOKEN?.trim();
// Start without a token so clients and registries can list the tools; each tool call reports it.
if (!token) console.error(MISSING_TOKEN);
const handlers = createHandlers(createClient({ token, baseUrl: process.env.COMMENTKEYWORD_API_URL?.trim() || DEFAULT_BASE_URL }));

const send = (response) => {
  if (response) process.stdout.write(`${JSON.stringify(response)}
`);
};

createInterface({ input: process.stdin, crlfDelay: Infinity }).on('line', (line) => {
  if (!line.trim()) return;
  let message;
  try {
    message = JSON.parse(line);
  } catch {
    send({ jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error' } });
    return;
  }
  handleMessage(handlers, message).then(send, (error) => {
    console.error(error);
    if (message?.id !== undefined) send({ jsonrpc: '2.0', id: message.id, error: { code: -32603, message: 'Internal error' } });
  });
});
