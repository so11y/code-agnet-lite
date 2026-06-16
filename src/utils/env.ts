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

export function getOpenAiModel(defaultModel: string): string {
  return process.env.OPENAI_MODEL?.trim() || defaultModel;
}
