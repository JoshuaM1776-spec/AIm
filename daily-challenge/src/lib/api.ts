// Every call the app makes to its server. Data goes through database functions (RPC), which
// check who is asking and return only what they may see; evaluation goes through the evaluate
// Edge Function, which holds the AI key.
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from "./supabase.ts";
import type {
  AdminChallengeRow, AdminResponse, Attempt, Challenge, ChallengeAdmin, CommunityItem, Difficulty, LibraryItem,
  MyState, Progress, Stats, Today,
} from "./types.ts";

export class ApiError extends Error {
  code: string;
  detail: string;
  retryable: boolean;
  retryAfter?: number;
  constructor(code: string, message: string, detail = "", retryable = false, retryAfter?: number) {
    super(message);
    this.code = code;
    this.detail = detail;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }
}

// Plain-language messages for the codes the database functions raise.
const MESSAGES: Record<string, string> = {
  auth_required: "Please sign in to continue.",
  challenge_not_found: "That challenge isn't available.",
  attempt_not_found: "We couldn't find your work on this challenge. Try refreshing.",
  already_submitted: "This response has already been submitted.",
  too_short: "Write at least 40 words so there's enough to evaluate.",
  too_long: "Responses can be up to 30,000 characters.",
  not_active: "This challenge can't be changed now.",
  challenge_closed: "This challenge has closed. Each challenge is open on its own day, until 00:00 UTC.",
  revision_not_ready: "You can revise once your first evaluation is ready.",
  submit_first: "Submit your own response to see how others approached this challenge.",
  invalid_display_name: "Use 2 to 40 letters, numbers, spaces, dots, dashes or apostrophes.",
  own_response: "You can't report your own response.",
  forbidden: "Only administrators can do this.",
  network: "We couldn't reach the server. Check your connection and try again.",
};

function toApiError(e: { code?: string; message?: string; details?: string | null } | null, fallback = "Something went wrong. Please try again."): ApiError {
  if (!e) return new ApiError("unknown", fallback);
  if (/failed to fetch|network|load failed/i.test(e.message ?? "")) return new ApiError("network", MESSAGES.network, "", true);
  // Database functions raise a snake_case code as the message, sometimes with a sentence for users as the detail.
  const code = e.message && /^[a-z_]+$/.test(e.message) ? e.message : e.code ?? "unknown";
  const detail = e.details ?? "";
  const human = detail && !detail.startsWith("{") ? detail : MESSAGES[code] ?? fallback;
  return new ApiError(code, human, detail);
}

async function rpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  if (!supabase) throw new ApiError("not_configured", "This app isn't connected to a server yet.");
  let result;
  try {
    result = await supabase.rpc(fn, args);
  } catch {
    throw new ApiError("network", MESSAGES.network, "", true);
  }
  if (result.error) throw toApiError(result.error);
  return result.data as T;
}

export const api = {
  today: () => rpc<Today>("get_today"),
  challenge: (number: number) => rpc<Challenge>("get_challenge", { p_number: number }),
  myState: () => rpc<MyState>("my_state"),
  updateProfile: (displayName: string | null, difficulty: Difficulty | null) =>
    rpc<MyState["profile"]>("update_profile", { p_display_name: displayName, p_preferred_difficulty: difficulty }),

  attempt: (number: number) => rpc<Attempt | null>("get_attempt", { p_number: number }),
  startAttempt: (number: number, difficulty: Difficulty) =>
    rpc<Attempt>("start_attempt", { p_number: number, p_difficulty: difficulty }),
  updateAttempt: (id: string, patch: { card_position?: number; briefing_done?: boolean; difficulty?: Difficulty }) =>
    rpc<Attempt>("update_attempt", { p_attempt: id, p_card_position: patch.card_position ?? null, p_briefing_done: patch.briefing_done ?? null, p_difficulty: patch.difficulty ?? null }),
  saveDraft: (id: string, kind: "initial" | "revision", body: string) =>
    rpc<{ updated_at: string; word_count: number }>("save_draft", { p_attempt: id, p_kind: kind, p_body: body }),
  submit: (id: string, kind: "initial" | "revision", body: string, key: string) =>
    rpc<Attempt>("submit_response", { p_attempt: id, p_kind: kind, p_body: body, p_key: key }),

  publish: (id: string, displayName: string, title: string) =>
    rpc<Attempt>("publish_response", { p_attempt: id, p_display_name: displayName, p_title: title }),
  unpublish: (id: string) => rpc<Attempt>("unpublish_response", { p_attempt: id }),
  community: (number: number, tab: "selected" | "all", offset = 0, limit = 20) =>
    rpc<{ total: number; items: CommunityItem[] }>("list_community", { p_number: number, p_tab: tab, p_limit: limit, p_offset: offset }),
  report: (responseId: string, reason: string, details: string) =>
    rpc<{ reported: boolean }>("report_response", { p_response: responseId, p_reason: reason, p_details: details }),

  stats: (number: number) => rpc<Stats>("challenge_stats", { p_number: number }),
  progress: () => rpc<Progress>("my_progress"),
  library: () => rpc<LibraryItem[]>("my_library"),

  admin: {
    list: () => rpc<{ today: string; items: AdminChallengeRow[] }>("admin_list_challenges"),
    get: (id: string) => rpc<ChallengeAdmin>("admin_get_challenge", { p_id: id }),
    save: (doc: Record<string, unknown>) => rpc<ChallengeAdmin>("admin_save_challenge", { p_doc: doc }),
    setStatus: (id: string, status: Challenge["status"]) => rpc<ChallengeAdmin>("admin_set_status", { p_id: id, p_status: status }),
    schedule: (id: string, date: string | null) => rpc<ChallengeAdmin>("admin_schedule", { p_id: id, p_date: date }),
    responses: (id: string) => rpc<AdminResponse[]>("admin_list_responses", { p_id: id }),
    updateResponse: (id: string, patch: { selected_label?: string | null; selected_position?: number | null; hidden?: boolean; clear_selection?: boolean }) =>
      rpc<{ ok: boolean }>("admin_update_response", {
        p_response: id, p_selected_label: patch.selected_label ?? null, p_selected_position: patch.selected_position ?? null,
        p_hidden: patch.hidden ?? null, p_clear_selection: patch.clear_selection ?? false,
      }),
  },

  /** Ask the server to evaluate a stored submission. Resolves to "complete" or "in_progress". */
  async evaluate(submissionId: string): Promise<"complete" | "in_progress"> {
    if (!supabase) throw new ApiError("not_configured", "This app isn't connected to a server yet.");
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) throw new ApiError("auth", "Please sign in again.");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 170_000);
    let res: Response;
    try {
      res = await fetch(`${SUPABASE_URL}/functions/v1/evaluate`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, apikey: SUPABASE_ANON_KEY, "content-type": "application/json" },
        body: JSON.stringify({ submissionId }),
        signal: controller.signal,
      });
    } catch {
      throw new ApiError("network", "We couldn't reach the evaluator. Your response is saved; please try again.", "", true);
    } finally {
      clearTimeout(timer);
    }
    const body = await res.json().catch(() => null) as { ok?: boolean; status?: string; error?: { code: string; message: string; retryable?: boolean; retry_after?: number } } | null;
    if (res.ok && body?.ok) return body.status === "in_progress" ? "in_progress" : "complete";
    const e = body?.error;
    throw new ApiError(e?.code ?? "server", e?.message ?? "Something went wrong. Your response is saved; please try again.", "", e?.retryable ?? true, e?.retry_after);
  },
};
