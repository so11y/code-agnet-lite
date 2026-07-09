import {existsSync, readFileSync} from 'node:fs';
import path from 'node:path';

function unquote(value: string): string {
  const trimmed = value.trim();
  const quote = trimmed[0];

  if ((quote === '"' || quote === "'") && trimmed.endsWith(quote)) {
    return trimmed.slice(1, -1);
  }

  return trimmed;
}

export function loadDotEnv(cwd: string): void {
  const envPath = path.join(cwd, '.env');

  if (!existsSync(envPath)) {
    return;
  }

  const lines = readFileSync(envPath, 'utf8').split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith('#')) {
      continue;
    }

    const separatorIndex = trimmed.indexOf('=');

    if (separatorIndex === -1) {
      continue;
    }

    const key = trimmed.slice(0, separatorIndex).trim();
    const value = unquote(trimmed.slice(separatorIndex + 1));

    if (key && process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

export function getRequiredOpenAiApiKey(): string {
  const apiKey = process.env.OPENAI_API_KEY?.trim();

  if (!apiKey) {
    throw new Error(
      'Missing OPENAI_API_KEY. Create a .env file in the project root, then add OPENAI_API_KEY=your-key.'
    );
  }

  return apiKey;
}

export function getOpenAiBaseUrl(): string | undefined {
  const baseUrl = process.env.OPENAI_BASE_URL?.trim();
  return baseUrl || undefined;
}

export function getOpenAiModel(defaultModel?: string): string {
  return process.env.OPENAI_MODEL?.trim() || defaultModel || '';
}

export function isThinkingEnabled(): boolean {
  const value = process.env.ENABLE_THINKING?.trim().toLowerCase();
  return value !== 'false' && value !== '0';
}

export type AgentProviderKind = 'openai' | 'cursor';

export function getAgentProviderKind(): AgentProviderKind {
  const value = process.env.AGENT_PROVIDER?.trim().toLowerCase();
  return value === 'cursor' ? 'cursor' : 'openai';
}

export function getCursorApiKey(): string {
  const cursorKey = process.env.CURSOR_API_KEY?.trim();
  if (cursorKey) {
    return cursorKey;
  }

  return process.env.OPENAI_API_KEY?.trim() ?? '';
}

export function getCursorModel(): string {
  return getCursorModelSelection().id;
}

export type CursorModelParam = {
  id: string;
  value: string;
};

export type CursorModelSelection = {
  id: string;
  params?: CursorModelParam[];
};

function parseCursorModelFast(): boolean | undefined {
  const value = process.env.CURSOR_MODEL_FAST?.trim().toLowerCase();
  if (value === undefined || value === '') {
    return;
  }

  return value !== 'false' && value !== '0';
}

export function getCursorModelSelection(): CursorModelSelection {
  let modelId = process.env.CURSOR_MODEL?.trim() || 'composer-2.5';
  let fast = parseCursorModelFast();

  if (modelId.endsWith('-fast')) {
    modelId = modelId.slice(0, -'-fast'.length);
    fast ??= true;
  }

  if (fast === undefined || !modelId.startsWith('composer-')) {
    return {id: modelId};
  }

  return {
    id: modelId,
    params: [{id: 'fast', value: fast ? 'true' : 'false'}]
  };
}

const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'composer-2.5': 200_000,
  'composer-2': 200_000,
  'gpt-4o': 128_000,
  'gpt-4o-mini': 128_000,
  'gpt-4.1': 1_047_576,
  'gpt-4.1-mini': 1_047_576,
  'gpt-4.1-nano': 1_047_576,
  'o3': 200_000,
  'o4-mini': 200_000
};

function parseContextLimitOverride(): number | undefined {
  const raw = process.env.CONTEXT_LIMIT?.trim() || process.env.OPENAI_CONTEXT_LIMIT?.trim();

  if (!raw) {
    return;
  }

  const parsed = Number(raw);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return;
  }

  return Math.floor(parsed);
}

export function getActiveModelName(): string {
  if (getAgentProviderKind() === 'cursor') {
    return getCursorModel();
  }

  return getOpenAiModel();
}

export function getContextLimit(model = getActiveModelName()): number {
  const override = parseContextLimitOverride();

  if (override) {
    return override;
  }

  const normalized = model.trim().toLowerCase();

  if (MODEL_CONTEXT_LIMITS[normalized]) {
    return MODEL_CONTEXT_LIMITS[normalized];
  }

  if (normalized.startsWith('composer-')) {
    return MODEL_CONTEXT_LIMITS['composer-2.5'];
  }

  return 128_000;
}
