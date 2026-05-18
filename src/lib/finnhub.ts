const FINNHUB_BASE = "https://finnhub.io/api/v1";

type CacheEntry = { price: number; ts: number };
const cache = new Map<string, CacheEntry>();
const TTL = 5 * 60 * 1000;

export async function getQuote(symbol: string): Promise<number | null> {
  const cached = cache.get(symbol);
  if (cached && Date.now() - cached.ts < TTL) return cached.price;

  const apiKey = process.env.FINNHUB_API_KEY;
  if (!apiKey) return null;

  try {
    const res = await fetch(
      `${FINNHUB_BASE}/quote?symbol=${encodeURIComponent(symbol)}&token=${apiKey}`,
      { next: { revalidate: 0 } }
    );
    if (!res.ok) return null;
    const data = await res.json();
    const price: number = data.c;
    if (!price) return null;
    cache.set(symbol, { price, ts: Date.now() });
    return price;
  } catch {
    return null;
  }
}

export async function getQuotes(symbols: string[]): Promise<Record<string, number>> {
  const results: Record<string, number> = {};
  await Promise.all(
    symbols.map(async (s) => {
      const price = await getQuote(s);
      if (price !== null) results[s] = price;
    })
  );
  return results;
}
