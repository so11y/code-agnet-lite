import {z} from 'zod';
import {truncate} from '@code-agent-lite/shared';
import {createTool} from './common.js';

type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

function decodeHtml(value: string): string {
  return value
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(Number.parseInt(code, 16)))
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function stripTags(value: string): string {
  return decodeHtml(value.replace(/<[^>]*>/g, ''));
}

function parseResults(html: string, limit: number): SearchResult[] {
  const results: SearchResult[] = [];
  const resultPattern = /<div[^>]+(?:class="[^"]*\bresult\b[^"]*"|tpl="se_com_default")[^>]*>([\s\S]*?)(?=<div[^>]+(?:class="[^"]*\bresult\b|tpl="se_com_default")|<\/body>)/gi;

  for (const match of html.matchAll(resultPattern)) {
    const block = match[1] ?? '';
    const titleMatch = block.match(/<h3[^>]*>[\s\S]*?<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>[\s\S]*?<\/h3>/i);

    if (!titleMatch) {
      continue;
    }

    const snippet = stripTags(
      block
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .replace(/<h3[\s\S]*?<\/h3>/gi, '')
    ).slice(0, 240);

    results.push({
      title: stripTags(titleMatch[2] ?? ''),
      url: decodeHtml(titleMatch[1] ?? ''),
      snippet
    });

    if (results.length >= limit) {
      break;
    }
  }

  return results;
}

async function fetchText(url: URL): Promise<string> {
  const response = await fetch(url, {
    headers: {
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
    }
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  return response.text();
}

export const webSearchTool = createTool({
  name: 'web_search',
  description: '使用百度搜索公开网页信息，返回精简的标题、链接和摘要。',
  schema: z.object({
    query: z.string().describe('搜索关键词。'),
    limit: z.number().optional().describe('最多返回多少条结果。默认 5 条，最多 10 条。')
  }),
  async execute(input) {
    const limit = Math.min(Math.max(Math.floor(input.limit ?? 5), 1), 10);
    const url = new URL('https://www.baidu.com/s');
    url.searchParams.set('wd', input.query);
    url.searchParams.set('rn', String(limit));
    url.searchParams.set('ie', 'utf-8');

    const results = parseResults(await fetchText(url), limit);

    if (!results.length) {
      return '未找到搜索结果。';
    }

    return truncate(
      results
        .map((result, index) => {
          const snippet = result.snippet ? `\n${result.snippet}` : '';
          return `${index + 1}. ${result.title}\n${result.url}${snippet}`;
        })
        .join('\n\n')
    );
  }
});
