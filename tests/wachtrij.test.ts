// De offline wachtrij: werken zonder internet, later doorsturen, en een conflict
// als twee toestellen hetzelfde exemplaar verkochten.
import { test } from "node:test";
import assert from "node:assert/strict";
import { fetchUitPublic } from "./helpers";

// Een minimale browseromgeving voor state.ts.
const opslag = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => opslag.get(k) ?? null,
  setItem: (k: string, v: string) => void opslag.set(k, String(v)),
  removeItem: (k: string) => void opslag.delete(k),
};
fetchUitPublic();

const { DemoBackend } = await import("../src/store/demo");
const { Fout } = await import("../src/store/backend");
const st = await import("../src/state");
const { regelUit } = await import("../src/lib/kassa");
const { laadTestset } = await import("../src/lib/testset");

/** Een "server" met de logica van de demo, die we offline kunnen zetten. */
function nepServer() {
  const server = new DemoBackend();
  const status = { offline: false };
  const proxy = new Proxy(server, {
    get(doel, sleutel) {
      if (sleutel === "soort") return "supabase";
      if (sleutel === "gebruikerId") return () => "beheerder-a";
      const v = (doel as unknown as Record<string | symbol, unknown>)[sleutel];
      if (typeof v !== "function") return v;
      return (...args: unknown[]) => {
        if (status.offline && sleutel !== "gebruiker") return Promise.reject(new Fout("Geen verbinding met de server."));
        return (v as (...a: unknown[]) => unknown).apply(doel, args);
      };
    },
  });
  return { server, proxy, status };
}

const wacht = (ms: number) => new Promise((r) => setTimeout(r, ms));

test("offline verkopen en wijzigen, later doorsturen; conflict bij dubbele verkoop", async () => {
  const { server, proxy, status } = nepServer();
  const set = await laadTestset();
  await server.voegExemplarenToe(set.exemplaren);
  await server.voegArtikelenToe(set.artikelen);

  await st.__testGebruik(proxy);
  let s = st.huidig();
  assert.equal(s.fase, "klaar");
  assert.equal(s.exemplaren.length, 105);

  // Geen internet op de beurs
  status.offline = true;
  const psyduck = s.exemplaren.find((e) => e.code === "FYA-Y74".replace("-", ""))!;
  const darkrai = s.exemplaren.find((e) => e.code === "2Y9YS7")!;
  st.zetHartje(darkrai.id, 125);
  st.inMandje(regelUit(st.huidig().exemplaren.find((e) => e.id === psyduck.id)!));
  st.afrekenen({ cash: 50, sumup: 0 });
  await wacht(50);
  s = st.huidig();
  assert.equal(s.online, false);
  assert.equal(s.wachtrij, 2, "hartje en verkoop wachten");
  assert.equal(s.exemplaren.find((e) => e.id === psyduck.id)!.status, "verkocht", "lokaal meteen verkocht");
  assert.equal((await server.laadAlles()).exemplaren.find((e) => e.id === psyduck.id)!.status, "in voorraad", "server weet nog niets");

  // Een ander toestel verkoopt ondertussen Darkrai, en dit toestel (offline) ook
  await server.boekTransactie({ id: "ander-toestel", beurs_id: null, soort: "verkoop", tijd: new Date().toISOString(), regels: [regelUit(darkrai)], totaal: 130, cash: 130, sumup: 0, status: "ok", conflicten: [], opmerking: null });
  st.inMandje(regelUit(st.huidig().exemplaren.find((e) => e.id === darkrai.id)!));
  const dubbel = st.afrekenen({ cash: 125, sumup: 0 });
  assert.equal(st.huidig().wachtrij, 3);

  // De kopie op het toestel: de app start ook zonder internet
  await wacht(1000);
  await st.__testGebruik(proxy);
  s = st.huidig();
  assert.equal(s.fase, "klaar", "start offline met de kopie");
  assert.equal(s.wachtrij, 3, "wachtrij blijft bewaard");
  assert.equal(s.exemplaren.find((e) => e.id === psyduck.id)!.status, "verkocht");

  // Weer internet
  status.offline = false;
  assert.equal(await st.spoel(), true);
  await wacht(50);
  s = st.huidig();
  assert.equal(s.wachtrij, 0);
  const op = await server.laadAlles();
  assert.equal(op.exemplaren.find((e) => e.id === psyduck.id)!.status, "verkocht", "verkoop staat op de server");
  assert.equal(op.exemplaren.find((e) => e.id === darkrai.id)!.hartjesprijs, 125, "hartje staat op de server");
  assert.equal(op.transacties.find((t) => t.id === dubbel.id)!.status, "conflict", "dubbele verkoop is een conflict");
  assert.equal(s.transacties.find((t) => t.id === dubbel.id)!.status, "conflict", "en dat ziet de app ook");

  // Opnieuw versturen verandert niets (bv. na een time-out)
  await proxy.boekTransactie(op.transacties.find((t) => t.id === dubbel.id)!);
  assert.equal((await server.laadAlles()).transacties.length, op.transacties.length);
});
