const api = process.env.API_BASE_URL ?? process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export async function getJson<T>(path: string): Promise<T | null> {
  try {
    const response = await fetch(`${api}${path}`, { cache: "no-store" });
    if (!response.ok) return null;
    return response.json() as Promise<T>;
  } catch {
    return null;
  }
}

export function publicApiUrl(path: string): string {
  return `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}${path}`;
}
