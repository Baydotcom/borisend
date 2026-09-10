/**
 * ProviderConfigService — Reads provider configuration from secure storage.
 * On Base44: reads from AppSettings entity.
 * On a private server: replace with environment variable reads.
 *
 * Credentials are never stored in normal database records — only secret names
 * are stored in config, and the actual secrets live in environment variables.
 */

import { ProviderConfig } from './types.ts';

export async function getProviderConfig(base44Client: any): Promise<ProviderConfig> {
  const settings = await base44Client.asServiceRole.entities.AppSettings.list("setting_key", 50);
  const getSetting = (key: string, fallback: string) => {
    const s = settings.find((s: any) => s.setting_key === key);
    return s?.setting_value || fallback;
  };

  return {
    active_provider: getSetting('ai_provider', 'base44'),
    model: getSetting('ai_model', 'automatic'),
    temperature: parseFloat(getSetting('ai_temperature', '0.7')),
    max_tokens: parseInt(getSetting('ai_max_tokens', '500')),
    timeout_seconds: parseInt(getSetting('ai_timeout_seconds', '30')),
    retry_count: parseInt(getSetting('ai_retry_count', '2')),
    fallback_provider: getSetting('ai_fallback_provider', ''),
    enabled: getSetting('ai_enabled', 'true') !== 'false',
    api_base_url: getSetting('ai_api_base_url', ''),
    api_key_secret_name: getSetting('ai_api_key_secret_name', ''),
  };
}

/**
 * Future private-server replacement:
 *
 * export function getProviderConfig(): ProviderConfig {
 *   return {
 *     active_provider: Deno.env.get('MESSAGE_PROVIDER') || 'base44',
 *     model: Deno.env.get('MESSAGE_MODEL') || 'automatic',
 *     temperature: parseFloat(Deno.env.get('MESSAGE_TEMPERATURE') || '0.7'),
 *     max_tokens: parseInt(Deno.env.get('MESSAGE_MAX_TOKENS') || '500'),
 *     timeout_seconds: parseInt(Deno.env.get('MESSAGE_TIMEOUT') || '30'),
 *     retry_count: parseInt(Deno.env.get('MESSAGE_RETRY_COUNT') || '2'),
 *     fallback_provider: Deno.env.get('MESSAGE_FALLBACK_PROVIDER') || '',
 *     enabled: Deno.env.get('MESSAGE_PROVIDER_ENABLED') !== 'false',
 *     api_base_url: Deno.env.get('MESSAGE_API_BASE_URL') || '',
 *     api_key_secret_name: 'MESSAGE_API_KEY',
 *   };
 * }
 */