// Minimal Jev (TypeSafe System One) client: parallel calls with a concurrency cap,
// retry on 429/529, usage + latency accounting, and a replay cache so a demo
// survives a flaky network (DRIFT_REPLAY=1 forces replay; misses still go live).
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";

const ENDPOINT = "https://api.typesafe.ai/v1/systemone";
const PRICE_PER_INPUT_TOKEN = 0.042 / 1_000_000;
const CACHE_FILE = path.join(process.cwd(), ".drift", "jev-cache.json");

export const jevApiKey = () => process.env.JEV_API_KEY ?? process.env.JEVITE_API_KEY;

export type JevAnswer = {
  type: "score" | "noul" | "choice";
  score?: number;
  noul?: number;
  choice?: string;
  probabilities?: Record<string, number>;
  confidence?: number;
};

export type JevRequest = {
  state: unknown;
  questions: Record<string, unknown>;
};

export class JevSession {
  calls = 0;
  replayed = 0;
  inputTokens = 0;
  callMs: number[] = [];
  private cache: Record<string, { answers: Record<string, JevAnswer>; input_tokens: number }> = {};
  private active = 0;
  private queue: (() => void)[] = [];

  constructor(private concurrency = 12) {
    try {
      if (existsSync(CACHE_FILE)) this.cache = JSON.parse(readFileSync(CACHE_FILE, "utf8"));
    } catch {
      this.cache = {};
    }
  }

  get costUsd() {
    return this.inputTokens * PRICE_PER_INPUT_TOKEN;
  }

  saveCache() {
    mkdirSync(path.dirname(CACHE_FILE), { recursive: true });
    writeFileSync(CACHE_FILE, JSON.stringify(this.cache));
  }

  private async slot<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.concurrency) await new Promise<void>((r) => this.queue.push(r));
    this.active++;
    try {
      return await fn();
    } finally {
      this.active--;
      this.queue.shift()?.();
    }
  }

  async ask(req: JevRequest): Promise<Record<string, JevAnswer>> {
    const body = { state: req.state, model: "jev-latest", questions: req.questions };
    const key = createHash("sha1").update(JSON.stringify(body)).digest("hex");
    const apiKey = jevApiKey();
    const cached = this.cache[key];

    if (cached && (process.env.DRIFT_REPLAY === "1" || !apiKey)) {
      this.replayed++;
      this.calls++;
      this.inputTokens += cached.input_tokens;
      return cached.answers;
    }
    if (!apiKey) throw new Error("JEV_API_KEY is not set (add it to .env.local) and no replay is cached for this request.");

    return this.slot(async () => {
      for (let attempt = 0; ; attempt++) {
        const t0 = performance.now();
        let res: Response;
        try {
          res = await fetch(ENDPOINT, {
            method: "POST",
            headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
            body: JSON.stringify(body),
          });
        } catch (err) {
          if (cached) return this.fromCache(cached);
          throw err;
        }
        if ((res.status === 429 || res.status === 529) && attempt < 4) {
          await new Promise((r) => setTimeout(r, 250 * 2 ** attempt));
          continue;
        }
        if (!res.ok) {
          if (cached) return this.fromCache(cached);
          throw new Error(`Jev ${res.status}: ${(await res.text()).slice(0, 400)}`);
        }
        const json = (await res.json()) as { answers: Record<string, JevAnswer>; usage?: { input_tokens?: number } };
        this.callMs.push(performance.now() - t0);
        this.calls++;
        const tokens = json.usage?.input_tokens ?? 0;
        this.inputTokens += tokens;
        this.cache[key] = { answers: json.answers, input_tokens: tokens };
        return json.answers;
      }
    });
  }

  private fromCache(cached: { answers: Record<string, JevAnswer>; input_tokens: number }) {
    this.replayed++;
    this.calls++;
    this.inputTokens += cached.input_tokens;
    return cached.answers;
  }
}
