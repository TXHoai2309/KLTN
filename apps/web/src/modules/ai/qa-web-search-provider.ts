import "server-only";
import { AppError } from "../../server/http/app-error";

export type WebSearchResult = {
  text: string;
  urls: { title: string; url: string }[];
};

export async function executeOpenAiWebSearch(options: {
  apiKey?: () => string | undefined;
  fetcher?: typeof fetch;
  model?: string;
  input: string;
  signal?: AbortSignal;
}): Promise<WebSearchResult> {
  const model = options.model ?? "gpt-6-luna";
  const key = (options.apiKey ?? (() => process.env.OPENAI_API_KEY))();
  if (!key) throw new AppError("AI_UNAVAILABLE", "Dịch vụ tìm kiếm web chưa được cấu hình API Key.", 503);

  const fetchFn = options.fetcher ?? fetch;
  const response = await fetchFn("https://api.openai.com/v1/responses", {
    method: "POST",
    signal: options.signal,
    headers: {
      authorization: `Bearer ${key}`,
      "content-type": "application/json",
    },
    body: JSON.stringify({
      model,
      tools: [{ type: "web_search" }],
      input: options.input,
    }),
  });

  if (!response.ok) {
    throw new AppError("AI_UNAVAILABLE", "Không thể tìm kiếm thông tin từ Web vào lúc này.", 503);
  }

  const data = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      type?: string;
      content?: Array<{
        type?: string;
        text?: string;
        annotations?: Array<{
          type?: string;
          url?: string;
          title?: string;
        }>;
      }>;
    }>;
  };

  const text =
    data.output_text ??
    data.output?.[0]?.content?.[0]?.text ??
    "Đã tìm kiếm thông tin trên Web nhưng không có kết quả chi tiết.";

  const urls: { title: string; url: string }[] = [];
  if (Array.isArray(data.output)) {
    for (const item of data.output) {
      if (Array.isArray(item.content)) {
        for (const c of item.content) {
          if (Array.isArray(c.annotations)) {
            for (const a of c.annotations) {
              if (a.url && !urls.some(u => u.url === a.url)) {
                urls.push({
                  title: a.title || a.url,
                  url: a.url,
                });
              }
            }
          }
        }
      }
    }
  }

  const linkMatches = text.matchAll(/https?:\/\/[^\s)\]]+/gu);
  for (const match of linkMatches) {
    if (!urls.some(u => u.url === match[0])) {
      urls.push({ title: match[0], url: match[0] });
    }
  }

  return { text, urls };
}
