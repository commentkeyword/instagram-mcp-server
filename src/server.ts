import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { CommentKeywordApiError, CommentKeywordClient } from './client.js';

export const SERVER_VERSION = '0.1.0';

const INSTRUCTIONS = `CommentKeyword sends an automatic Instagram DM to people who comment a keyword on a post or reel ("Comment GUIDE and I'll send you the link").
Use these tools to create and manage those keyword automations.
- For a video that is not published yet, create the keyword with target "next_post": it attaches itself to the next post or reel the account publishes.
- Creating or activating a keyword makes CommentKeyword message real people. Confirm the keyword, the DM text and the target with the user before calling create_keyword or update_keyword.
- Placeholders in DMs and public replies: {{handle}}, {{name}}, {{namefirst}}.`;

const target = z
  .enum(['next_post', 'all_posts', 'specific_posts'])
  .describe(
    'Which posts trigger the DM. next_post: the next post or reel published on the connected Instagram account (best for a video that is not live yet). all_posts: every post, current and future. specific_posts: only the Instagram media IDs in mediaIds.',
  );

const keywordFields = {
  keyword: z
    .string()
    .min(1)
    .max(100)
    .describe('The word people comment, e.g. "GUIDE". Matching is case-insensitive. Prefer one distinctive word.'),
  dmMessages: z
    .array(z.string().min(1))
    .min(1)
    .max(10)
    .describe(
      'DM variants (1-10); one is picked at random per commenter, so 2-3 wordings of the same message feel less robotic. Each must deliver the promised link. Max 1,000 characters each. Supports {{handle}}, {{name}}, {{namefirst}}.',
    ),
  matchMode: z
    .enum(['contains', 'exact'])
    .describe('contains (default): the comment only has to include the keyword, e.g. "GUIDE please!". exact: the whole comment must be the keyword.'),
  matchWithoutAccents: z
    .boolean()
    .describe('Only for keywords with Latin accents: also match the unaccented spelling (e.g. "guía" also matches "guia").'),
  mediaIds: z
    .array(z.string().min(1))
    .describe('Instagram media IDs. Required for target "specific_posts"; with "next_post" they are matched too.'),
  commentReplies: z
    .array(z.string().min(1))
    .max(10)
    .describe('Optional public reply variants (up to 10), one picked at random per comment, e.g. "Sent! Check your DMs {{namefirst}}". Max 500 characters each.'),
  publicReplyEnabled: z.boolean().describe('Post one of commentReplies publicly. Defaults to true when commentReplies is not empty.'),
  trackLinks: z.boolean().describe('Replace links in the DM with tracked links to count clicks.'),
  isActive: z.boolean().describe('Create it active (default) or paused. Only active keywords count toward the plan limit.'),
  aiAgentId: z
    .string()
    .uuid()
    .nullable()
    .describe(
      'Optional publicId of an existing Live AI agent (from list_agents) that takes over the conversation when the person replies to the DM. Its conversation hook is appended to the DM. Only works on paid plans; on Free the agent is ignored. null detaches it.',
    ),
};

function scopeFor(t: z.infer<typeof target>, mediaIds: string[] | undefined) {
  switch (t) {
    case 'next_post':
      return { scope: 'post_specific', includeNextPost: true, ...(mediaIds?.length ? { mediaIds } : {}) };
    case 'all_posts':
      return { scope: 'global' };
    case 'specific_posts':
      if (!mediaIds?.length) throw new Error('target "specific_posts" needs at least one media ID in mediaIds.');
      return { scope: 'post_specific', includeNextPost: false, mediaIds };
  }
}

function stripUndefined(input: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(input).filter(([, value]) => value !== undefined));
}

type ToolResult = { content: { type: 'text'; text: string }[]; isError?: boolean };

async function run(action: () => Promise<unknown>, summarize?: (result: unknown) => string): Promise<ToolResult> {
  try {
    const result = await action();
    const json = JSON.stringify(result, null, 2);
    return { content: [{ type: 'text', text: summarize ? `${summarize(result)}\n\n${json}` : json }] };
  } catch (error) {
    if (error instanceof CommentKeywordApiError) {
      const details = error.body && typeof error.body === 'object' ? `\n\n${JSON.stringify(error.body, null, 2)}` : '';
      return { content: [{ type: 'text', text: `${error.message}${details}` }], isError: true };
    }
    return { content: [{ type: 'text', text: error instanceof Error ? error.message : String(error) }], isError: true };
  }
}

function summarizeKeyword(result: unknown): string {
  const data = (result as { data?: Record<string, unknown> })?.data;
  if (!data) return 'Done.';
  const parts = [`Keyword "${data.keyword}" (${data.publicId}) is ${data.isActive ? 'active' : 'paused'}.`];
  if (data.scope === 'global') parts.push('It triggers on every post.');
  if (data.nextPostStatus === 'waiting') parts.push('It is waiting for the next post or reel; it attaches itself once that post gets its first comments.');
  if (data.nextPostStatus === 'attached') parts.push(`It caught the next post (media ${data.nextPostMediaId}).`);
  if (data.nextPostStatus === 'reconnect_required') parts.push('Instagram needs to be reconnected in CommentKeyword before it can catch the next post.');
  if (data.nextPostStatus === 'failed') parts.push(`The last next-post lookup failed: ${data.nextPostLastError}.`);
  return parts.join(' ');
}

export function createServer(client: CommentKeywordClient): McpServer {
  const server = new McpServer({ name: 'commentkeyword', version: SERVER_VERSION }, { instructions: INSTRUCTIONS });

  server.registerTool(
    'list_keywords',
    {
      title: 'List keyword automations',
      description: 'List the comment-keyword automations in the workspace, newest first. Use it to check whether a keyword already exists before creating one.',
      inputSchema: {
        search: z.string().optional().describe('Case-insensitive search in the keyword text.'),
        status: z.enum(['active', 'inactive']).optional(),
        limit: z.number().int().min(1).max(100).optional().describe('Page size, default 50.'),
        offset: z.number().int().min(0).optional(),
      },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    (args) => run(() => client.listKeywords(args)),
  );

  server.registerTool(
    'get_keyword',
    {
      title: 'Get a keyword automation',
      description: 'Get one keyword automation by its publicId, including whether it is still waiting for the next post (nextPostStatus).',
      inputSchema: { id: z.string().uuid().describe('The keyword publicId.') },
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    ({ id }) => run(() => client.getKeyword(id), summarizeKeyword),
  );

  server.registerTool(
    'create_keyword',
    {
      title: 'Create a keyword automation',
      description:
        'Create a comment-to-DM automation: when someone comments the keyword, CommentKeyword sends them the DM (and optionally replies publicly). Confirm the details with the user first, because it messages real people. Fails with 409 if the keyword already exists for the same posts, or with keyword_limit_exceeded when the plan has no free active-keyword slot.',
      inputSchema: {
        target,
        ...keywordFields,
        matchMode: keywordFields.matchMode.optional(),
        matchWithoutAccents: keywordFields.matchWithoutAccents.optional(),
        mediaIds: keywordFields.mediaIds.optional(),
        commentReplies: keywordFields.commentReplies.optional(),
        publicReplyEnabled: keywordFields.publicReplyEnabled.optional(),
        trackLinks: keywordFields.trackLinks.optional(),
        isActive: keywordFields.isActive.optional(),
        aiAgentId: keywordFields.aiAgentId.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: true },
    },
    ({ target: t, mediaIds, ...rest }) =>
      run(() => client.createKeyword(stripUndefined({ ...rest, ...scopeFor(t, mediaIds) })), summarizeKeyword),
  );

  server.registerTool(
    'update_keyword',
    {
      title: 'Update a keyword automation',
      description:
        'Change a keyword automation. Only the fields you pass change. Passing target re-targets it (e.g. next_post to wait for the next upload again). dmMessages and commentReplies replace all existing variants. Set isActive false to pause it.',
      inputSchema: {
        id: z.string().uuid().describe('The keyword publicId.'),
        target: target.optional(),
        keyword: keywordFields.keyword.optional(),
        dmMessages: keywordFields.dmMessages.optional(),
        matchMode: keywordFields.matchMode.optional(),
        matchWithoutAccents: keywordFields.matchWithoutAccents.optional(),
        mediaIds: keywordFields.mediaIds.optional(),
        commentReplies: z.array(z.string().min(1)).max(10).optional().describe('Replaces all public reply variants (up to 10). Pass [] with publicReplyEnabled false to stop public replies.'),
        publicReplyEnabled: keywordFields.publicReplyEnabled.optional(),
        trackLinks: keywordFields.trackLinks.optional(),
        isActive: keywordFields.isActive.optional(),
        aiAgentId: keywordFields.aiAgentId.optional(),
      },
      annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    },
    ({ id, target: t, mediaIds, ...rest }) =>
      run(
        () => client.updateKeyword(id, stripUndefined({ ...rest, ...(t ? scopeFor(t, mediaIds) : mediaIds ? { mediaIds } : {}) })),
        summarizeKeyword,
      ),
  );

  server.registerTool(
    'delete_keyword',
    {
      title: 'Delete a keyword automation',
      description:
        'Permanently delete a keyword automation. Prefer update_keyword with isActive false to pause it instead. If the keyword has an AI agent, the first call returns DELETE_CONFIRMATION_REQUIRED with an impact summary; show it to the user and call again with confirm true only if they agree.',
      inputSchema: {
        id: z.string().uuid().describe('The keyword publicId.'),
        confirm: z.boolean().optional().describe('Set true only after the user has reviewed a DELETE_CONFIRMATION_REQUIRED response.'),
      },
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    },
    ({ id, confirm }) => run(() => client.deleteKeyword(id, confirm === true)),
  );

  server.registerTool(
    'list_agents',
    {
      title: 'List AI agents',
      description: 'List the AI agents already set up in the workspace (agents are created and edited in the CommentKeyword dashboard). Pass the publicId of a Live agent as aiAgentId to create_keyword or update_keyword so it keeps chatting after the first DM.',
      inputSchema: {},
      annotations: { readOnlyHint: true, openWorldHint: true },
    },
    () => run(() => client.listAgents()),
  );

  return server;
}
