import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
import type Anthropic from '@anthropic-ai/sdk';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { resolve } from 'path';

export interface MCPServerConfig {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

export interface MCPToolInfo {
  name: string;
  description: string;
  inputSchema: any;
  serverName: string;
}

export interface MCPServerStatus {
  name: string;
  connected: boolean;
  toolCount: number;
  tools: MCPToolInfo[];
  config: MCPServerConfig;
}

const CONFIG_PATH = resolve(process.cwd(), 'mcp-servers.json');
const IS_WINDOWS = process.platform === 'win32';

export class MCPHub {
  private clients = new Map<string, Client>();
  private transports = new Map<string, StdioClientTransport>();
  private toolCache = new Map<string, MCPToolInfo[]>();
  private configs = new Map<string, MCPServerConfig>();

  constructor() {
    this.loadConfig();
  }

  /** Load saved server configurations from disk */
  private loadConfig() {
    if (!existsSync(CONFIG_PATH)) return;
    try {
      const raw = readFileSync(CONFIG_PATH, 'utf-8');
      const data = JSON.parse(raw);
      if (data.servers) {
        for (const [name, config] of Object.entries(data.servers)) {
          this.configs.set(name, config as MCPServerConfig);
        }
      }
    } catch (err) {
      console.error('[MCPHub] Failed to load config:', err);
    }
  }

  /** Persist server configurations to disk */
  private saveConfig() {
    const servers: Record<string, MCPServerConfig> = {};
    for (const [name, config] of this.configs) {
      servers[name] = config;
    }
    try {
      writeFileSync(CONFIG_PATH, JSON.stringify({ servers }, null, 2));
    } catch (err) {
      console.error('[MCPHub] Failed to save config:', err);
    }
  }

  /** Auto-connect all saved servers on startup */
  async autoConnect() {
    if (this.configs.size === 0) {
      console.log('[MCPHub] No servers configured in mcp-servers.json');
      return;
    }
    for (const [name, config] of this.configs) {
      if (!this.clients.has(name)) {
        try {
          console.log(`[MCPHub] Auto-connecting "${name}" (${config.command} ${(config.args || []).join(' ')})...`);
          await this.connect(name, config);
        } catch (err: any) {
          console.error(`[MCPHub] Failed to auto-connect "${name}":`, err?.message ?? err);
        }
      }
    }
  }

  /** Connect to an MCP server */
  async connect(name: string, config: MCPServerConfig): Promise<{ tools: MCPToolInfo[] }> {
    // Disconnect existing if reconnecting
    if (this.clients.has(name)) {
      await this.disconnect(name);
    }

    // On Windows, npx needs .cmd extension for spawn
    let command = config.command;
    if (IS_WINDOWS && (command === 'npx' || command === 'npm' || command === 'node')) {
      command = `${command}.cmd`;
    }

    const transport = new StdioClientTransport({
      command,
      args: config.args,
      env: { ...process.env, ...(config.env || {}) } as Record<string, string>,
    });

    const client = new Client({
      name: `nodelings-${name}`,
      version: '1.0.0',
    });

    await client.connect(transport);

    // Fetch and cache tools
    const { tools } = await client.listTools();
    const toolInfos: MCPToolInfo[] = (tools || []).map(t => ({
      name: t.name,
      description: t.description || '',
      inputSchema: t.inputSchema,
      serverName: name,
    }));

    this.clients.set(name, client);
    this.transports.set(name, transport);
    this.toolCache.set(name, toolInfos);
    this.configs.set(name, config);
    this.saveConfig();

    console.log(`[MCPHub] Connected "${name}" — ${toolInfos.length} tools available`);
    return { tools: toolInfos };
  }

  /** Disconnect from an MCP server (keeps config for reconnection) */
  async disconnect(name: string): Promise<void> {
    const client = this.clients.get(name);
    const transport = this.transports.get(name);
    if (client) {
      try { await client.close(); } catch {}
    }
    if (transport) {
      try { await transport.close(); } catch {}
    }
    this.clients.delete(name);
    this.transports.delete(name);
    this.toolCache.delete(name);
    console.log(`[MCPHub] Disconnected "${name}"`);
  }

  /** Remove a server entirely (disconnect + delete config) */
  async removeServer(name: string): Promise<void> {
    await this.disconnect(name);
    this.configs.delete(name);
    this.saveConfig();
  }

  /** Call a tool on a specific MCP server */
  async callTool(serverName: string, toolName: string, args: Record<string, any>): Promise<string> {
    const client = this.clients.get(serverName);
    if (!client) throw new Error(`MCP server "${serverName}" not connected`);

    const result = await client.callTool({ name: toolName, arguments: args });

    // Extract text from result content blocks
    const texts: string[] = [];
    for (const block of (result.content as any[]) || []) {
      if (block.type === 'text') texts.push(block.text);
      else if (block.type === 'image') texts.push('[image data]');
      else texts.push(JSON.stringify(block));
    }
    const output = texts.join('\n');
    return output;
  }

  /** Get status of all configured servers */
  getStatus(): MCPServerStatus[] {
    const result: MCPServerStatus[] = [];
    for (const [name, config] of this.configs) {
      result.push({
        name,
        connected: this.clients.has(name),
        toolCount: this.toolCache.get(name)?.length ?? 0,
        tools: this.toolCache.get(name) || [],
        config,
      });
    }
    return result;
  }

  /** Get all tools across all connected servers */
  getAllTools(): MCPToolInfo[] {
    const all: MCPToolInfo[] = [];
    for (const tools of this.toolCache.values()) {
      all.push(...tools);
    }
    return all;
  }

  /** Get tools for a specific server */
  getToolsForServer(name: string): MCPToolInfo[] {
    return this.toolCache.get(name) || [];
  }

  /** Find MCP server matching a building type */
  findServerForBuilding(buildingType: string): string | null {
    // Direct name match
    if (this.clients.has(buildingType)) return buildingType;

    // Alias matching for common building types
    const aliases: Record<string, string[]> = {
      notion: ['notion'],
      slack: ['slack'],
      gmail: ['gmail', 'google-gmail', 'email'],
      google_sheets: ['google-sheets', 'sheets', 'google_sheets'],
      airtable: ['airtable'],
      whatsapp: ['whatsapp'],
      scraper: ['scraper', 'browser', 'puppeteer', 'fetch'],
    };

    const candidates = aliases[buildingType] || [buildingType];
    for (const candidate of candidates) {
      for (const [serverName] of this.clients) {
        if (serverName.toLowerCase().includes(candidate.toLowerCase())) {
          return serverName;
        }
      }
    }
    return null;
  }

  /** Convert all MCP tools to Anthropic tool format for AI agent buildings */
  getAnthropicTools(): Anthropic.Tool[] {
    const tools: Anthropic.Tool[] = [];
    for (const [serverName, serverTools] of this.toolCache) {
      for (const tool of serverTools) {
        tools.push({
          name: `${serverName}__${tool.name}`,
          description: `[${serverName}] ${tool.description}`,
          input_schema: tool.inputSchema as Anthropic.Tool.InputSchema,
        });
      }
    }
    return tools;
  }

  /** Execute a tool call from Claude (handles serverName__toolName format) */
  async executeAnthropicToolCall(fullName: string, input: Record<string, any>): Promise<string> {
    const sep = fullName.indexOf('__');
    if (sep < 0) throw new Error(`Invalid MCP tool name: ${fullName}`);
    const serverName = fullName.slice(0, sep);
    const toolName = fullName.slice(sep + 2);
    return this.callTool(serverName, toolName, input);
  }

  isConnected(name: string): boolean {
    return this.clients.has(name);
  }

  get connectedCount(): number {
    return this.clients.size;
  }
}
