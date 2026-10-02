"use server";

import { revalidatePath } from "next/cache";
import { loadComponents } from "@/lib/drift/designSystem";
import { applyEdits } from "@/lib/drift/fix";
import { runGate } from "@/lib/drift/gate";
import { acceptProposal, applyAutofixes } from "@/lib/drift/resolve";
import { GATE_PATH, readReport, saveReport, scan } from "@/lib/drift/scan";

// Local demo tool: these actions edit files in this working tree. Never deploy them.
function assertLocal() {
  if (process.env.NODE_ENV === "production" && !process.env.DRIFT_ALLOW_WRITES) {
    throw new Error("Drift actions write to the working tree and are disabled in production.");
  }
}

async function rescan() {
  saveReport(await scan());
  revalidatePath("/drift");
  revalidatePath("/demo");
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
  const report = readReport();
  const finding = report?.colors.find((c) => c.id === findingId);
  if (!finding) return;
  applyEdits([{ finding, token }], [], loadComponents());
  await rescan();
}

export async function applyComponentAction(findingId: string) {
  assertLocal();
  const report = readReport();
  const finding = report?.components.find((c) => c.id === findingId);
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

export async function runGateAction() {
  assertLocal();
  await runGate();
  revalidatePath("/drift");
}

export async function fixGateAction() {
  assertLocal();
  const gate = readReport(GATE_PATH());
  if (!gate) return;
  applyAutofixes(gate);
  await runGate();
  revalidatePath("/drift");
  revalidatePath("/demo");
}
