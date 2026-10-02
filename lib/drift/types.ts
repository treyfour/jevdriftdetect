export type Lane = "autofix" | "review" | "propose" | "leave";

export type Token = { name: string; value: string; usage: string };

export type ComponentSpec = {
  name: string;
  import: string;
  exports: string[];
  template: string; // {variant} {attrs} {icon} {children} {text}
  variants: Record<string, string>;
};

export type ColorLiteral = {
  id: string;
  file: string;
  line: number;
  start: number; // absolute offset of the literal in the file
  end: number;
  raw: string;
  hex: string;
  property: string;
  selector: string;
  component: string;
  context: string; // the trimmed source line
  syntax: "inline" | "css" | "tailwind";
};

export type Candidate = {
  token: string;
  tokenValue: string;
  deltaE: number;
  score: number; // Jev link score, 0-2
  confidence: number;
  sameRole: number; // P(yes)
  level: 0 | 1 | 2;
};

export type NewTokenProposal = {
  name: string;
  role: string;
  usage: string;
  gap: number; // P(this is a role the design system should own)
};

export type Fix = { replacement: string; before: string; after: string };

export type ColorFinding = ColorLiteral & {
  candidates: Candidate[];
  best: Candidate | null;
  lane: Lane;
  proposal?: NewTokenProposal;
  gap?: number; // P(new role worth a token), asked only when no token fits
  fix?: Fix;
  subsumedBy?: string; // component finding id that resolves this literal
  baselineLane: Lane; // what a distance-only tool would do
  baselineToken?: string;
  expected?: { lane: Lane; token?: string; why?: string };
};

export type HandRolledElement = {
  id: string;
  file: string;
  line: number;
  start: number;
  end: number;
  tag: string;
  className: string;
  text: string;
  style: string; // inline style literal, if any
  classes: string; // className value, if any
  icon?: string; // inline <svg> child, if any
  attrs: string; // non-style, non-className attributes, kept on swap
  source: string;
};

export type ComponentFinding = HandRolledElement & {
  choice: string; // "Button/default" | "none"
  lucide?: string; // suggested Lucide icon export, when the element hand-rolls an <svg>
  probabilities: Record<string, number>;
  confidence: number;
  lane: Lane;
  fix?: Fix;
  proposal?: { name: string; brief: string };
  expected?: { lane: Lane; component?: string; why?: string };
};

export type RunStats = {
  files: number;
  literals: number;
  elements: number;
  pairs: number;
  calls: number;
  replayed: number;
  inputTokens: number;
  costUsd: number;
  ms: number;
  avgCallMs: number;
};

export type Accuracy = {
  jev: { correct: number; total: number };
  baseline: { correct: number; total: number };
  components: { correct: number; total: number };
};

export type Report = {
  generatedAt: string;
  mode: "full" | "changed";
  base?: string;
  stats: RunStats;
  colors: ColorFinding[];
  components: ComponentFinding[];
  accuracy?: Accuracy;
  gate?: { status: "pass" | "warn" | "fail"; blocking: number; warnings: number };
  error?: string;
};
