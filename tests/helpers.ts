// Laat fetch("data/...") in Node uit public/ lezen, zoals de browser het van de server haalt.
import { readFile } from "node:fs/promises";
import path from "node:path";

export function fetchUitPublic() {
  const root = path.resolve(process.cwd(), "public");
  globalThis.fetch = (async (url: string | URL) => {
    const p = path.join(root, String(url).replace(/^\.?\//, ""));
    try {
      const data = await readFile(p);
      return new Response(data, { status: 200 });
    } catch {
      return new Response("niet gevonden", { status: 404 });
    }
  }) as typeof fetch;
}
