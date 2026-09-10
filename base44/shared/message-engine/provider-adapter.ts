/**
 * MessageProviderAdapter — Provider-neutral adapter interface.
 * The rest of BoriSend must not call any provider directly.
 *
 * Base44MessageProviderAdapter wraps the current Base44 InvokeLLM integration
 * as one concrete adapter. Future providers (OpenAI, Anthropic, Google,
 * self-hosted, private server) implement the same interface.
 */

import { ProviderConfig, FailureClassification } from './types.ts';
import { classifyFailure } from './failure-classifier.ts';

export interface MessageProviderAdapter {
  generateMessage(prompt: string, config: ProviderConfig): Promise<string>;
  validateProviderConfiguration(config: ProviderConfig): boolean;
  classifyFailure(error: Error): FailureClassification;
  getProviderNameForInternalLogs(): string;
}

/**
 * Base44 provider adapter — wraps base44.asServiceRole.integrations.Core.InvokeLLM.
 * This is the ONLY place in the engine that depends on Base44.
 */
export class Base44MessageProviderAdapter implements MessageProviderAdapter {
  constructor(private base44Client: any) {}

  async generateMessage(prompt: string, config: ProviderConfig): Promise<string> {
    const result = await this.base44Client.asServiceRole.integrations.Core.InvokeLLM({
      prompt,
      model: config.model || undefined,
    });

    if (typeof result === 'string') return result;
    if (result?.response) return result.response;
    if (result?.text) return result.text;
    if (result?.content) return result.content;
    return String(result);
  }

  validateProviderConfiguration(_config: ProviderConfig): boolean {
    return true; // Base44 is always available when the function runs
  }

  classifyFailure(error: Error): FailureClassification {
    return classifyFailure(error);
  }

  getProviderNameForInternalLogs(): string {
    return 'base44';
  }
}

/**
 * Factory: returns the appropriate adapter for a given provider name.
 * Future providers are added here without touching the rest of the engine.
 */
export function getProviderAdapter(providerName: string, base44Client: any): MessageProviderAdapter {
  switch (providerName) {
    case 'base44':
    default:
      return new Base44MessageProviderAdapter(base44Client);
  }
}