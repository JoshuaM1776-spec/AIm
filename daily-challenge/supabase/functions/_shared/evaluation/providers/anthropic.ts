// The Claude evaluator. The caller passes in the Anthropic SDK client and the SDK class (for its
// typed errors), so this file has no imports and runs in both Deno and Node:
//   import Anthropic from "npm:@anthropic-ai/sdk@1.12.0";   // Deno (the Edge Function)
//   import Anthropic from "@anthropic-ai/sdk";              // Node (the dev server)
//   anthropicProvider(new Anthropic(), Anthropic, { model: "claude-opus-5-5" })
import type { EvalProvider, ProviderRequest, ProviderResult } from "../types.ts";

// deno-lint-ignore no-explicit-any
type ErrorClass = abstract new (...args: any[]) => Error;
export interface AnthropicErrorClasses {
  APIError: ErrorClass;
  APIUserAbortError: ErrorClass;
  APIConnectionError: ErrorClass;
  APIConnectionTimeoutError: ErrorClass;
  RateLimitError: ErrorClass;
  InternalServerError: ErrorClass;
  AuthenticationError: ErrorClass;
  PermissionDeniedError: ErrorClass;
  BadRequestError: ErrorClass;
}

interface Usage { input_tokens?: number; output_tokens?: number; iterations?: { input_tokens?: number; output_tokens?: number }[] | null }
interface BetaMessage {
  model: string;
  stop_reason: string | null;
  content: { type: string; text?: string }[];
  usage?: Usage;
}
export interface AnthropicLike {
  beta: {
    messages: {
      // deno-lint-ignore no-explicit-any
      create(params: any, options?: { signal?: AbortSignal; maxRetries?: number; timeout?: number }): PromiseLike<BetaMessage>;
    };
  };
}

export interface AnthropicProviderOptions {
  model: string;          // default claude-opus-5-5
  effort?: "low" | "medium" | "high"; // depth of the evaluator's thinking; default "medium"
  maxTokens?: number;
}

function tokens(usage: Usage | undefined) {
  if (!usage) return { inputTokens: 0, outputTokens: 0 };
  if (usage.iterations?.length) {
    // includes a fallback model's tokens if the first model declined
    return usage.iterations.reduce((t, it) => ({
      inputTokens: t.inputTokens + (it.input_tokens ?? 0), outputTokens: t.outputTokens + (it.output_tokens ?? 0),
    }), { inputTokens: 0, outputTokens: 0 });
  }
  return { inputTokens: usage.input_tokens ?? 0, outputTokens: usage.output_tokens ?? 0 };
}

export function anthropicProvider(client: AnthropicLike, sdk: AnthropicErrorClasses, opts: AnthropicProviderOptions): EvalProvider {
  return {
    name: "anthropic",
    model: opts.model,
    async evaluate(req: ProviderRequest, signal: AbortSignal): Promise<ProviderResult> {
      try {
        const msg = await client.beta.messages.create({
          model: opts.model,
          max_tokens: opts.maxTokens ?? 16000,
          // If the model declines for policy reasons, the API retries on a fallback model.
          betas: ["server-side-fallback-2026-07-01"],
          fallbacks: "default",
          output_config: { effort: opts.effort ?? "medium", format: { type: "json_schema", schema: req.schema } },
          system: req.system,
          messages: [{ role: "user", content: req.prompt }],
        }, { signal, maxRetries: 1 });
        const used = tokens(msg.usage);
        if (msg.stop_reason === "refusal") return { ok: false, code: "refusal", model: msg.model };
        if (msg.stop_reason === "max_tokens") return { ok: false, code: "invalid_output", model: msg.model, detail: "cut off at max_tokens" };
        const text = msg.content.map(b => (b.type === "text" ? b.text ?? "" : "")).join("");
        let output: unknown;
        try {
          output = JSON.parse(text);
        } catch {
          return { ok: false, code: "invalid_output", model: msg.model, detail: "not JSON" };
        }
        return { ok: true, output, model: msg.model, ...used };
      } catch (e) {
        // Most specific first.
        if (e instanceof sdk.APIUserAbortError || e instanceof sdk.APIConnectionTimeoutError) return { ok: false, code: "timeout" };
        if (e instanceof sdk.RateLimitError) return { ok: false, code: "busy" };
        if (e instanceof sdk.AuthenticationError || e instanceof sdk.PermissionDeniedError) return { ok: false, code: "config", detail: "API key rejected" };
        if (e instanceof sdk.BadRequestError) return { ok: false, code: "upstream", detail: "bad request" };
        if (e instanceof sdk.InternalServerError) return { ok: false, code: "busy", detail: "server error" };
        if (e instanceof sdk.APIConnectionError) return { ok: false, code: "upstream", detail: "connection" };
        if (e instanceof sdk.APIError) return { ok: false, code: "upstream", detail: "api error" };
        throw e;
      }
    },
  };
}
