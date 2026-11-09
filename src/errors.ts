/**
 * Failures the sidebar and the feature_dev tool both surface.
 * `status` is for the HTTP face; the tool shows `message`.
 */

import type { ChatCall } from "./guidance.js";
import type { RunState } from "./state.js";

export class FeatureDevError extends Error {
  readonly code: string;
  readonly status: number;
  readonly chatCall: ChatCall | null;
  readonly state: RunState | null;

  constructor(message: string, options: {
    code: string;
    status?: number;
    chatCall?: ChatCall | null;
    state?: RunState | null;
  }) {
    super(message);
    this.name = "FeatureDevError";
    this.code = options.code;
    this.status = options.status ?? 400;
    this.chatCall = options.chatCall ?? null;
    this.state = options.state ?? null;
  }
}
