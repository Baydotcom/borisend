/**
 * Core type definitions for the BoriSend Message Intelligence Engine.
 * Provider-neutral and portable — no Base44 dependencies.
 */

export type Daypart = 'morning' | 'afternoon' | 'evening' | 'night';

export interface DeliveryTimeContext {
  timezone: string;
  scheduled_utc: string;
  scheduled_local: string;
  local_date: string;
  local_time: string;
  local_hour: number;
  weekday: string;
  daypart: Daypart;
  schedule_type: string;
}

export interface RecipientContext {
  name: string;
  relationship: string;
  language: string;
  preferences: string[];
}

export interface CampaignContext {
  id: string;
  name: string;
  category: string;
  instructions: string;
  approval_mode: string;
  tone: string;
  message_length: string;
  writing_style: string;
  pet_name: string;
  purpose: string;
}

export interface MessageContext {
  purpose: string;
  tone: string;
  length: string;
  time_specific_language_allowed: boolean;
}

export interface RulesContext {
  avoid_repetition: boolean;
  avoid_wrong_daypart: boolean;
  avoid_wrong_weekday: boolean;
  avoid_provider_language: boolean;
  prefer_time_neutral_opening: boolean;
}

export interface PreferencesContext {
  tone?: string;
  length?: string;
  writing_style?: string;
  humour_level?: string;
  emoji_preference?: string;
  faith_content?: string;
  preferred_opening?: string;
  avoid_styles?: string[];
  source?: string;
}

export interface GenerationContext {
  request_id: string;
  campaign: CampaignContext;
  recipient: RecipientContext;
  delivery: DeliveryTimeContext;
  message: MessageContext;
  rules: RulesContext;
  preferences?: PreferencesContext;
}

export type FailureCategory =
  | 'temporary_failure'
  | 'rate_limit'
  | 'timeout'
  | 'network_failure'
  | 'invalid_provider_config'
  | 'invalid_generation_context'
  | 'invalid_provider_response'
  | 'content_validation_failure'
  | 'unknown_failure';

export interface FailureClassification {
  category: FailureCategory;
  is_permanent: boolean;
  should_retry: boolean;
}

export interface ValidationIssue {
  code: string;
  severity: 'error' | 'warning';
  message: string;
}

export interface ValidationResult {
  valid: boolean;
  issues: ValidationIssue[];
}

export interface ProviderConfig {
  active_provider: string;
  model: string;
  temperature: number;
  max_tokens: number;
  timeout_seconds: number;
  retry_count: number;
  fallback_provider: string;
  enabled: boolean;
  api_base_url: string;
  api_key_secret_name: string;
}

export interface GenerationResult {
  content: string | null;
  provider: string;
  model: string;
  used_fallback: boolean;
  needs_review: boolean;
  validation_issues: ValidationIssue[];
  error: string | null;
  failure_category: FailureCategory | null;
  attempts: number;
}