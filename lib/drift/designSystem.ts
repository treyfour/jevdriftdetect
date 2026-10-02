import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { ComponentSpec, Lane, Token } from "./types";

const root = () => process.cwd();
const TOKENS = () => path.join(root(), "design-system", "tokens.json");
const TOKENS_CSS = () => path.join(root(), "app", "tokens.css");

export type DriftConfig = {
  include: string[];
  extensions: string[];
  review: { base: string };
  gate: { base: string; block: Lane[]; warn: Lane[] };
};

// A deliberate one-off: the author kept a value outside the system, with a reason.
export type DriftException = { file: string; raw?: string; selector?: string; className?: string; reason: string; decidedAt: string };

const EXCEPTIONS = () => path.join(root(), "design-system", "exceptions.json");

export function loadExceptions(): DriftException[] {
  try {
    return JSON.parse(readFileSync(EXCEPTIONS(), "utf8")).exceptions;
  } catch {
    return [];
  }
}

export function addException(e: DriftException) {
  const list = loadExceptions();
  list.push(e);
  const rows = list.map((x) => `    ${JSON.stringify(x)}`);
  writeFileSync(EXCEPTIONS(), `{\n  "exceptions": [\n${rows.join(",\n")}\n  ]\n}\n`);
}

export function loadConfig(): DriftConfig {
  return JSON.parse(readFileSync(path.join(root(), "drift.config.json"), "utf8"));
}

export function loadTokens(): Token[] {
  return JSON.parse(readFileSync(TOKENS(), "utf8")).tokens;
}

export function loadComponents(): ComponentSpec[] {
  return JSON.parse(readFileSync(path.join(root(), "design-system", "components.json"), "utf8")).components;
}

export type AnswerKey = {
  colors: { file: string; raw: string; lane: Lane; token?: string; why?: string }[];
  components: { file: string; className: string; lane: Lane; component?: string; why?: string }[];
};

export function loadAnswerKey(): AnswerKey | null {
  try {
    return JSON.parse(readFileSync(path.join(root(), "design-system", "answer_key.json"), "utf8"));
  } catch {
    return null;
  }
}

export function writeTokensCss(tokens: Token[]) {
  const body = tokens.map((t) => `  ${t.name}: ${t.value};`).join("\n");
  writeFileSync(TOKENS_CSS(), `/* Generated from design-system/tokens.json. Do not edit by hand. */\n:root {\n${body}\n}\n`);
}

export function addToken(token: Token) {
  const tokens = loadTokens();
  if (tokens.some((t) => t.name === token.name)) return tokens;
  tokens.push(token);
  // One token per line, so adding a token is a one-line diff in review.
  const rows = tokens.map((t) => `    { "name": ${JSON.stringify(t.name)}, "value": ${JSON.stringify(t.value)}, "usage": ${JSON.stringify(t.usage)} }`);
  writeFileSync(TOKENS(), `{\n  "tokens": [\n${rows.join(",\n")}\n  ]\n}\n`);
  writeTokensCss(tokens);
  return tokens;
}
