// Tavily returns scraped page text. Drop snippets that are not about game design (news, shortcodes, maintenance or ad pages)
// and strip leading "Title: ..." / markdown heading noise from the ones we keep.
export type PrecedentItem = { title: string; url: string; snippet: string };

const JUNK = /^\s*###|\[caption|\[\/?[a-z_]+ id=|sorry for the inconvenience|scheduled maintenance|sponsored content|cookie|subscribe to our|GDC talks cover|fresh GDC video|subscribe to the channel/i;
const JUNK_HOST = /(^|\.)(halloween-game-guide\.wiki|realestatewebsites360\.com)$/i;

const isWebUrl = (u: string) => { try { const x = new URL(u); return /^https?:$/.test(x.protocol) && !JUNK_HOST.test(x.hostname); } catch { return false; } };

export function cleanPrecedent<T extends PrecedentItem>(items: T[]): T[] {
  return items
    .filter((p) => isWebUrl(p.url) && !JUNK.test(p.snippet))
    .map((p) => ({ ...p, snippet: p.snippet.replace(/^\s*Title:[^#\n]*#?\s*/i, "").replace(/#+\s*/g, "").replace(/\s+/g, " ").trim() }))
    .filter((p) => p.snippet.length > 20);
}
