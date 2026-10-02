// The only place Jev is consulted. Each question is a small typed judgment about role;
// code does every comparison, threshold, and routing decision.
import type { JevSession } from "./jev";
import type { Candidate, ColorLiteral, ComponentSpec, HandRolledElement, Token } from "./types";

function literalState(l: ColorLiteral) {
  return {
    value: l.raw,
    property: l.property,
    selector: l.selector,
    component: l.component,
    file: l.file,
    source_line: l.context,
  };
}

const LINK_QUESTIONS = {
  link: {
    type: "score",
    instructions: "Should the hardcoded color `literal` be replaced by the design token `token`? Judge by UI role (what the color is used for, per `token.usage`), not by how similar the colors look.",
    criteria: [
      "Different role: `literal` is used for a different purpose than `token.usage` describes. Leave it alone.",
      "Related role: same family but not clearly the same purpose (for example a hover or emphasis variant). A designer should decide.",
      "Same role: `literal` is used for exactly the purpose `token.usage` describes. Replace it with the token.",
    ],
  },
  same_role: {
    type: "noul",
    instructions: "Is `literal` used for the same UI role that `token.usage` describes?",
    criteria: { true: "same UI role", false: "different UI role" },
  },
};

export async function judgePair(jev: JevSession, l: ColorLiteral, t: Token, dE: number): Promise<Candidate> {
  const a = await jev.ask({
    state: { literal: literalState(l), token: { name: t.name, value: t.value, usage: t.usage } },
    questions: LINK_QUESTIONS,
  });
  const score = a.link.score ?? 0;
  return {
    token: t.name,
    tokenValue: t.value,
    deltaE: dE,
    score,
    confidence: a.link.confidence ?? 0,
    sameRole: a.same_role.noul ?? 0,
    level: Math.min(Math.floor(score + 0.5), 2) as 0 | 1 | 2,
  };
}

export const NEW_ROLES: Record<string, string> = {
  brand: "brand identity and marketing accents",
  promo: "promotions, sales and discount highlights",
  chart: "data visualization series",
  hover: "hover or pressed state of an existing color",
  surface: "tinted background surface for a status or section",
  accent: "decorative accent or illustration",
};

// Asked only when no existing token fits the literal's role.
export async function judgeGap(jev: JevSession, l: ColorLiteral, tokens: Token[]) {
  const a = await jev.ask({
    state: {
      literal: literalState(l),
      design_system: tokens.map((t) => ({ name: t.name, usage: t.usage })),
    },
    questions: {
      gap: {
        type: "noul",
        instructions: "No token in `design_system` covers the role of `literal`. Is `literal` serving a recurring product UI role that the design system should own as a new token, rather than a fixed external color such as a third-party logo, or a one-off?",
        criteria: {
          true: "a recurring product UI role the design system should add as a token (e.g. brand, promotions, data visualization)",
          false: "an external brand color, illustration detail or one-off that should stay exactly as written",
        },
      },
      role: {
        type: "choice",
        instructions: "If the design system added a new token for `literal`, which role would that token name?",
        criteria: NEW_ROLES,
      },
    },
  });
  return { gap: a.gap.noul ?? 0, role: a.role.choice ?? "accent" };
}

export const NOT_A_COMPONENT = "not_a_component";
export const NEW_COMPONENT = "new_component";

export async function judgeElement(jev: JevSession, el: HandRolledElement, catalog: ComponentSpec[]) {
  const criteria: Record<string, string> = {};
  for (const c of catalog) for (const [v, d] of Object.entries(c.variants)) criteria[`${c.name}/${v}`] = `${c.name} component, ${v} variant: ${d}`;
  criteria[NEW_COMPONENT] = "a reusable control, label or banner that none of the listed component variants fits; the design system should add one";
  criteria[NOT_A_COMPONENT] = "plain text, a plain link or a layout element; no component is needed";

  const questions: Record<string, unknown> = {
    match: {
      type: "choice",
      instructions: "This JSX `element` was hand-styled with hardcoded colors instead of using the design system. Which design-system component variant should it be built with instead?",
      criteria,
    },
  };
  if (el.icon) {
    questions.icon = {
      type: "choice",
      instructions: "The `element` draws its own inline SVG icon. Which Lucide icon best represents the element's action, judging by its text?",
      criteria: LUCIDE_ICONS,
    };
  }
  const a = await jev.ask({
    state: {
      element: {
        tag: el.tag,
        text: el.text,
        class_name: el.className || undefined,
        tailwind_classes: el.classes || undefined,
        inline_style: el.style || undefined,
        has_inline_svg_icon: !!el.icon,
        file: el.file,
      },
    },
    questions,
  });
  return {
    choice: a.match.choice ?? NOT_A_COMPONENT,
    probabilities: a.match.probabilities ?? {},
    confidence: a.match.confidence ?? 0,
    lucide: a.icon?.choice,
  };
}

// A short, curated set of action icons from lucide-react (export names). Jev selects; it never invents.
export const LUCIDE_ICONS: Record<string, string> = {
  SparklesIcon: "AI magic: summarize, generate, enhance",
  FileTextIcon: "a document or written summary",
  ListChecksIcon: "a checklist or action items",
  WandSparklesIcon: "auto-fix or transform content",
  MessageSquareIcon: "a message or chat",
  SendIcon: "send a message",
  ArrowUpIcon: "submit or send upward",
  DownloadIcon: "download or export",
  RefreshCwIcon: "refresh, regenerate or retry",
  CopyIcon: "copy to clipboard",
  ShareIcon: "share with others",
  SearchIcon: "search",
  PlusIcon: "add or create",
  BotIcon: "an AI assistant",
  PencilIcon: "edit or rename",
};
