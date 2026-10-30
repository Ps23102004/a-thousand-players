// Tavily returns scraped page text. Drop snippets that are not about game design (news, shortcodes, maintenance or ad pages)
// and strip leading "Title: ..." / markdown heading noise from the ones we keep.
export type PrecedentItem = { title: string; url: string; snippet: string };

const JUNK = /###|\[caption|\[\/?[a-z_]+ id=|sorry for the inconvenience|scheduled maintenance|sponsored content|cookie|subscribe to our/i;

export function cleanPrecedent<T extends PrecedentItem>(items: T[]): T[] {
  return items
    .filter((p) => !JUNK.test(p.snippet))
    .map((p) => ({ ...p, snippet: p.snippet.replace(/^\s*Title:[^#\n]*#?\s*/i, "").replace(/#+\s*/g, "").replace(/\s+/g, " ").trim() }))
    .filter((p) => p.snippet.length > 20);
}
