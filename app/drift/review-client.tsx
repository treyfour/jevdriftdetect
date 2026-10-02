"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { ChoiceKind } from "@/lib/drift/review";
import { setChoiceAction } from "./actions";

export type ChoiceOption = {
  kind: ChoiceKind;
  title: string;
  detail: string;
  warning?: string;
  recommended?: string;
};

export function ChoiceGroup({
  changeId,
  options,
  current,
  currentReason,
  locked,
}: {
  changeId: string;
  options: ChoiceOption[];
  current: ChoiceKind;
  currentReason?: string;
  locked: boolean;
}) {
  const [pending, start] = useTransition();
  const [optimistic, setOptimistic] = useState<ChoiceKind | null>(null);
  const [reason, setReason] = useState(currentReason ?? "");
  const selected = pending && optimistic ? optimistic : current;

  const choose = (kind: ChoiceKind, why?: string) => {
    if (locked) return;
    setOptimistic(kind);
    start(() => setChoiceAction(changeId, kind, why));
  };

  return (
    <fieldset className="r-choices" disabled={locked} aria-busy={pending}>
      <legend className="r-sr">Choose a path</legend>
      {options.map((o) => (
        <label key={o.kind} className={`r-choice ${selected === o.kind ? "r-choice-on" : ""} r-choice-${o.kind}`}>
          <input
            type="radio"
            name={`choice-${changeId}`}
            checked={selected === o.kind}
            onChange={() => (o.kind === "oneoff" ? setOptimistic("oneoff") : choose(o.kind))}
          />
          <span className="r-choice-body">
            <span className="r-choice-title">
              {o.title}
              {o.recommended && <span className="r-rec">{o.recommended}</span>}
            </span>
            <span className="r-choice-detail">{o.detail}</span>
            {o.warning && <span className="r-choice-warn">{o.warning}</span>}
            {o.kind === "oneoff" && (selected === "oneoff" || optimistic === "oneoff") && !locked && (
              <span className="r-reason">
                <input
                  type="text"
                  value={reason}
                  placeholder="Why does this stay outside the system?"
                  onChange={(e) => setReason(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), choose("oneoff", reason))}
                  aria-label="Reason for the one-off"
                />
                <button type="button" className="d-btn" onClick={() => choose("oneoff", reason)}>
                  Record one-off
                </button>
              </span>
            )}
          </span>
        </label>
      ))}
      {pending && <p className="r-applying">Applying to the working tree…</p>}
    </fieldset>
  );
}

// The real app in a frame, scaled to fit. Reloads whenever the set of choices changes.
// `crop` zooms into a region of the app (in app pixels), e.g. the area a change touches.
const APP_W = 1180;
const APP_H = 760;

export function PreviewFrame({
  src,
  version,
  label,
  crop,
}: {
  src: string;
  version: string;
  label: string;
  crop?: { x: number; y: number; w: number; h: number };
}) {
  const wrap = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(600);
  useEffect(() => {
    const el = wrap.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const region = crop ?? { x: 0, y: 0, w: APP_W, h: APP_H };
  const scale = width / region.w;
  return (
    <div ref={wrap} className="r-frame" style={{ height: region.h * scale }}>
      <iframe
        key={version}
        src={src}
        title={label}
        tabIndex={crop ? -1 : undefined}
        style={{ width: APP_W, height: APP_H, transform: `scale(${scale}) translate(${-region.x}px, ${-region.y}px)` }}
      />
    </div>
  );
}
