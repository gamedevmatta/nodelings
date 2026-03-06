import type { MCPServerConfig } from './mcp-hub.js';

export interface MCPIntegrationManifestItem {
  id: string;
  command: string;
  args: string[];
  allowedEnvKeys: string[];
  secretEnvKeys: string[];
  description: string;
}

export const MCP_INTEGRATIONS: Record<string, MCPIntegrationManifestItem> = {
  notion: {
    id: 'notion',
    command: 'npx',
    args: ['-y', '@notionhq/notion-mcp-server'],
    allowedEnvKeys: ['OPENAPI_MCP_HEADERS'],
    secretEnvKeys: ['OPENAPI_MCP_HEADERS'],
    description: 'Notion MCP server',
  },
  filesystem: {
    id: 'filesystem',
    command: 'npx',
    args: ['-y', '@modelcontextprotocol/server-filesystem', '/tmp'],
    allowedEnvKeys: ['MCP_FILESYSTEM_ROOT'],
    secretEnvKeys: [],
    description: 'Filesystem MCP server',
  },
};

export function getIntegrationManifest(id: string): MCPIntegrationManifestItem | null {
  return MCP_INTEGRATIONS[id] || null;
}

export function resolveIntegrationConfig(
  integrationId: string,
  envInput: Record<string, unknown> = {},
): { config: MCPServerConfig; rejectedEnvKeys: string[]; secretEnvKeys: string[] } | null {
  const manifest = getIntegrationManifest(integrationId);
  if (!manifest) return null;

  const env: Record<string, string> = {};
  const rejectedEnvKeys: string[] = [];

  for (const [key, value] of Object.entries(envInput)) {
    if (!manifest.allowedEnvKeys.includes(key)) {
      rejectedEnvKeys.push(key);
      continue;
    }
    if (typeof value === 'string' && value.trim().length > 0) {
      env[key] = value;
    }
  }

  return {
    config: {
      command: manifest.command,
      args: [...manifest.args],
      env,
    },
    rejectedEnvKeys,
    secretEnvKeys: [...manifest.secretEnvKeys],
  };
}
