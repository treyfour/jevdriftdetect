"use server";

import { revalidatePath } from "next/cache";
import { loadComponents } from "@/lib/drift/designSystem";
import { applyEdits } from "@/lib/drift/fix";
import { acceptProposal, applyAutofixes } from "@/lib/drift/resolve";
import { acceptReview, buildReview, readReview, setChoice, type ChoiceKind } from "@/lib/drift/review";
import { readReport, saveReport, scan } from "@/lib/drift/scan";

// Local demo tool: these actions edit (and commit) files in this working tree. Never deploy them.
function assertLocal() {
  if (process.env.NODE_ENV === "production" && !process.env.DRIFT_ALLOW_WRITES) {
    throw new Error("Drift actions write to the working tree and are disabled in production.");
  }
}

function refresh() {
  revalidatePath("/drift");
  revalidatePath("/demo");
  revalidatePath("/app");
}

/* ---------- Pull request review ---------- */

export async function buildReviewAction() {
  assertLocal();
  await buildReview();
  refresh();
}

export async function setChoiceAction(id: string, kind: ChoiceKind, reason?: string) {
  assertLocal();
  setChoice(id, { kind, reason });
  refresh();
}

export async function acceptReviewAction() {
  assertLocal();
  await acceptReview();
  refresh();
}

export async function resetChoicesAction() {
  assertLocal();
  const s = readReview();
  if (!s || s.accepted) return;
  for (const ch of s.changes) setChoice(ch.id, { kind: "proposed" });
  refresh();
}

/* ---------- Codebase scan ---------- */

async function rescan() {
  saveReport(await scan());
  refresh();
}

export async function runScanAction() {
  assertLocal();
  await rescan();
}

export async function applyAllAction() {
  assertLocal();
  const report = readReport();
  if (!report) return;
  applyAutofixes(report);
  await rescan();
}

export async function applyTokenAction(findingId: string, token: string) {
  assertLocal();
  const finding = readReport()?.colors.find((c) => c.id === findingId);
  if (!finding) return;
  applyEdits([{ finding, token }], [], loadComponents());
  await rescan();
}

export async function applyComponentAction(findingId: string) {
  assertLocal();
  const finding = readReport()?.components.find((c) => c.id === findingId);
  if (!finding) return;
  applyEdits([], [finding], loadComponents());
  await rescan();
}

export async function acceptProposalAction(tokenName: string) {
  assertLocal();
  const report = readReport();
  if (!report) return;
  acceptProposal(report, tokenName);
  await rescan();
}
