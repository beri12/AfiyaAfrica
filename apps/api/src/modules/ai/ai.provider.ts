import { Injectable, Logger } from '@nestjs/common';
import { AppConfig } from '../../config/config.module';

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface CompletionRequest {
  messages: ChatMessage[];
  maxTokens?: number;
  /** Ask the model for a JSON object response. */
  json?: boolean;
}

export interface CompletionResult {
  text: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
}

export class AiProviderError extends Error {}

/** Provider-agnostic port. Swap implementations without touching the safety pipeline. */
export abstract class AiProvider {
  abstract readonly name: string;
  abstract readonly model: string;
  abstract readonly configured: boolean;
  abstract complete(req: CompletionRequest): Promise<CompletionResult>;
}

/**
 * OpenAI-compatible Chat Completions adapter (works with OpenAI, Azure OpenAI-compatible gateways, and
 * self-hosted servers such as vLLM). Enabled only when AI_BASE_URL, AI_API_KEY and AI_MODEL are set.
 * Requests set `store: false` where supported; the provider contract must also prohibit training on data.
 */
@Injectable()
export class OpenAiCompatibleProvider extends AiProvider {
  private readonly logger = new Logger(OpenAiCompatibleProvider.name);
  readonly name = 'openai-compatible';
  readonly model: string;
  readonly configured: boolean;

  constructor(private readonly config: AppConfig) {
    super();
    this.model = config.get('AI_MODEL') ?? 'unconfigured';
    this.configured = !!(config.get('AI_BASE_URL') && config.get('AI_API_KEY') && config.get('AI_MODEL'));
  }

  async complete(req: CompletionRequest): Promise<CompletionResult> {
    if (!this.configured) throw new AiProviderError('AI provider not configured');
    const base = this.config.get('AI_BASE_URL')!.replace(/\/$/, '');
    let res: Response;
    try {
      res = await fetch(`${base}/chat/completions`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${this.config.get('AI_API_KEY')}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: this.model,
          messages: req.messages,
          temperature: 0.2,
          max_tokens: req.maxTokens ?? 1200,
          store: false,
          ...(req.json ? { response_format: { type: 'json_object' } } : {}),
        }),
        signal: AbortSignal.timeout(this.config.get('AI_TIMEOUT_MS')),
      });
    } catch (e) {
      throw new AiProviderError(`AI provider unreachable: ${(e as Error).message}`);
    }
    if (!res.ok) {
      this.logger.warn(`AI provider HTTP ${res.status}`);
      throw new AiProviderError(`AI provider returned HTTP ${res.status}`);
    }
    const body = (await res.json()) as {
      model?: string;
      choices?: { message?: { content?: string } }[];
      usage?: { prompt_tokens?: number; completion_tokens?: number };
    };
    const text = body.choices?.[0]?.message?.content;
    if (typeof text !== 'string') throw new AiProviderError('AI provider returned no content');
    return { text, model: body.model ?? this.model, inputTokens: body.usage?.prompt_tokens, outputTokens: body.usage?.completion_tokens };
  }
}
