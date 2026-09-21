#!/usr/bin/env node
// Sobe o servidor MCP por stdio como um cliente faria, lista as ferramentas e chama sienge_status.
// Uso: npm run smoke   (não precisa de credencial: sem .env, o status responde "configurado: false")

import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const raiz = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const transporte = new StdioClientTransport({ command: process.execPath, args: [path.join(raiz, 'mcp', 'index.js')], cwd: raiz, stderr: 'pipe' });
const cliente = new Client({ name: 'smoke', version: '0.0.0' });

await cliente.connect(transporte);
const { tools } = await cliente.listTools();
console.log(`Ferramentas registradas: ${tools.length}`);
for (const t of tools) console.log(`  - ${t.name}`);

const status = await cliente.callTool({ name: 'sienge_status', arguments: {} });
console.log('\nsienge_status →');
console.log(status.content?.[0]?.text ?? JSON.stringify(status));

await cliente.close();
process.exit(0);
