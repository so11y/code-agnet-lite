import {z} from 'zod';
import {throwIfAborted, truncate} from '@code-agent-lite/shared';
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
    .replace(/&nbsp;|&ensp;|&emsp;|&thinsp;/g, ' ')
    .replace(/&middot;/g, '·')
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
  const blockPattern = /<li class="b_algo"[\s\S]*?(?=<li class="b_algo"|<\/ol>)/gi;

  for (const match of html.matchAll(blockPattern)) {
    const block = match[0] ?? '';
    const titleMatch = block.match(/<h2[^>]*>\s*<a[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>\s*<\/h2>/i);

    if (!titleMatch) {
      continue;
    }

    const snippetMatch = block.match(/<div class="b_caption"[^>]*>[\s\S]*?<p[^>]*>([\s\S]*?)<\/p>/i);
    const snippet = snippetMatch ? stripTags(snippetMatch[1] ?? '').slice(0, 240) : '';

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

async function fetchText(url: URL, signal?: AbortSignal): Promise<string> {
  throwIfAborted(signal);

  const response = await fetch(url, {
    headers: {
      'accept-language': 'zh-CN,zh;q=0.9,en;q=0.8',
      'user-agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Safari/537.36'
    },
    signal
  });

  if (!response.ok) {
    throw new Error(`搜索请求失败：HTTP ${response.status}`);
  }

  return response.text();
}

function formatResults(results: SearchResult[]): string {
  return truncate(
    results
      .map((result, index) => {
        const snippet = result.snippet ? `\n${result.snippet}` : '';
        return `${index + 1}. ${result.title}\n${result.url}${snippet}`;
      })
      .join('\n\n')
  );
}

export const webSearchTool = createTool({
  name: 'web_search',
  description: '使用 Bing 搜索公开网页信息，返回精简的标题、链接和摘要。',
  schema: z.object({
    query: z.string().describe('搜索关键词。'),
    limit: z.number().optional().describe('最多返回多少条结果。默认 5 条，最多 10 条。')
  }),
  async execute(input, context) {
    throwIfAborted(context.signal);

    const limit = Math.min(Math.max(Math.floor(input.limit ?? 5), 1), 10);
    const url = new URL('https://cn.bing.com/search');
    url.searchParams.set('q', input.query);
    url.searchParams.set('count', String(limit));

    const html = await fetchText(url, context.signal);

    if (!html.includes('b_algo')) {
      throw new Error('搜索页面未返回有效结果，可能被拦截或网络异常。');
    }

    const results = parseResults(html, limit);

    if (!results.length) {
      return '未找到搜索结果。';
    }

    return formatResults(results);
  }
});
