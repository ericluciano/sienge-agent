#!/usr/bin/env node
// Servidor MCP (stdio) do Sienge Agent. Registrado em `.mcp.json` na raiz do repositório;
// o Claude Code o inicia sozinho ao abrir a pasta. Configuração: `.env` (ver .env.example).

import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { RAIZ, recarregarConfig } from './config.js';
import { registrarTools, INSTRUCOES } from './tools.js';

const { version } = createRequire(import.meta.url)('../package.json');

const server = new McpServer({ name: 'sienge-agent', version }, { instructions: INSTRUCOES });
registrarTools(server, { raiz: RAIZ, env: process.env });

await server.connect(new StdioServerTransport());

const cfg = recarregarConfig(RAIZ, process.env);
console.error(`[sienge-agent] v${version} pronto — subdomínio: ${cfg.subdominio ?? 'não configurado (rode /setup)'}`);
