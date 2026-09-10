/**
 * RC16.8 — Message Language Resolver.
 *
 * Authoritative source of truth for generated-message language resolution.
 * Called by generateMessage and the scheduler BEFORE any LLM generation.
 *
 * Resolution hierarchy (deterministic, §5):
 *   1. PlanRecipient.message_language_override
 *   2. Campaign.message_language (if not 'use_default' or empty)
 *   3. BoriSendProfile.default_message_language (user default)
 *   4. English fallback ('en')
 *
 * This module is the SINGLE place where language resolution happens.
 * Settings, Campaign wizard, PlanRecipient, prompt-builder, and context-builder
 * all resolve through this — no independent language lists (§49).
 *
 * Portable: depends on a service-role Base44 client passed as `sr`.
 */

export interface ResolvedLanguage {
  /** Stable language code (MessageLanguage.system_key, e.g. 'fr') */
  code: string;
  /** Display name for the generation prompt (e.g. 'French') */
  display_name: string;
  /** Native name for admin/display (e.g. 'Français') */
  native_name: string;
  /** Optional generation instruction (e.g. 'Write in Modern Standard Arabic.') */
  generation_instruction: string;
  /** Which level of the hierarchy resolved this language */
  source: 'plan_recipient' | 'campaign' | 'user_default' | 'fallback';
  /** True if the resolved language is no longer active (§48 compatibility) */
  inactive_warning: boolean;
}

const FALLBACK: ResolvedLanguage = {
  code: 'en',
  display_name: 'English',
  native_name: 'English',
  generation_instruction: '',
  source: 'fallback',
  inactive_warning: false,
};

/**
 * Resolve the effective message language for a specific Campaign + PlanRecipient + User.
 *
 * @param sr - Base44 service-role client
 * @param params.campaign - The Campaign object (needs message_language field)
 * @param params.planRecipientId - Optional PlanRecipient ID (for override lookup)
 * @param params.userId - The authenticated user ID (for BoriSendProfile lookup)
 */
export async function resolveMessageLanguage(
  sr: any,
  params: {
    campaign?: any;
    planRecipientId?: string | null;
    userId: string;
  }
): Promise<ResolvedLanguage> {
  // ── Load all MessageLanguages (active + inactive for compatibility) ──
  let allLangs: any[] = [];
  try {
    allLangs = await sr.entities.MessageLanguage.list('display_order', 100);
  } catch {
    // MessageLanguage entity not yet seeded — use built-in fallback map
  }

  const activeLangs = allLangs.filter((l: any) => l.is_active);
  const activeByCode = new Map(activeLangs.map((l: any) => [l.system_key, l]));
  const allByCode = new Map(allLangs.map((l: any) => [l.system_key, l]));

  /** Resolve a code to a ResolvedLanguage, checking active/inactive/unknown */
  function resolveCode(code: string, source: ResolvedLanguage['source']): ResolvedLanguage {
    if (!code) return FALLBACK;
    const active = activeByCode.get(code);
    if (active) {
      return {
        code: active.system_key,
        display_name: active.display_name,
        native_name: active.native_name || active.display_name,
        generation_instruction: active.generation_instruction || '',
        source,
        inactive_warning: false,
      };
    }
    // Check inactive languages (§48 — existing config preserved, warning shown)
    const inactive = allByCode.get(code);
    if (inactive) {
      return {
        code: inactive.system_key,
        display_name: inactive.display_name,
        native_name: inactive.native_name || inactive.display_name,
        generation_instruction: inactive.generation_instruction || '',
        source,
        inactive_warning: true,
      };
    }
    // Unknown code — use built-in map as last resort
    const builtin = BUILTIN_LANGUAGES[code];
    if (builtin) {
      return { ...builtin, source, inactive_warning: false };
    }
    // Completely unknown — return the raw code as display name
    return { code, display_name: code, native_name: code, generation_instruction: '', source, inactive_warning: false };
  }

  // ── 1. PlanRecipient override (highest priority) ──
  if (params.planRecipientId) {
    try {
      const prs = await sr.entities.PlanRecipient.filter({ id: params.planRecipientId });
      if (prs[0]?.message_language_override) {
        return resolveCode(prs[0].message_language_override, 'plan_recipient');
      }
    } catch { /* non-blocking */ }
  }

  // ── 2. Campaign message language ──
  const campaignLang = params.campaign?.message_language;
  if (campaignLang && campaignLang !== 'use_default') {
    return resolveCode(campaignLang, 'campaign');
  }

  // ── 3. User default from BoriSendProfile ──
  try {
    const profiles = await sr.entities.BoriSendProfile.filter({ user_id: params.userId });
    if (profiles[0]?.default_message_language) {
      return resolveCode(profiles[0].default_message_language, 'user_default');
    }
  } catch { /* non-blocking */ }

  // ── 3b. Legacy: User entity message_language ──
  try {
    const users = await sr.entities.User.filter({ id: params.userId });
    if (users[0]?.message_language) {
      return resolveCode(users[0].message_language, 'user_default');
    }
  } catch { /* non-blocking */ }

  // ── 4. English fallback ──
  return FALLBACK;
}

/**
 * Get all active languages for frontend selection (Settings, Campaign wizard).
 * Returns a lightweight array — no entity objects leaked.
 */
export async function getActiveLanguages(sr: any): Promise<{ code: string; display_name: string; native_name: string }[]> {
  try {
    const langs = await sr.entities.MessageLanguage.filter({ is_active: true }, 'display_order', 100);
    return langs.map((l: any) => ({
      code: l.system_key,
      display_name: l.display_name,
      native_name: l.native_name || l.display_name,
    }));
  } catch {
    // Fallback to built-in list
    return Object.entries(BUILTIN_LANGUAGES).map(([code, lang]) => ({
      code,
      display_name: lang.display_name,
      native_name: lang.native_name,
    }));
  }
}

/**
 * Built-in language map — used when the MessageLanguage entity is not yet seeded
 * or as a compatibility fallback for unknown codes.
 * This is NOT an independent language list — it mirrors the seeded MessageLanguage
 * records and exists solely as a safety net.
 */
const BUILTIN_LANGUAGES: Record<string, { code: string; display_name: string; native_name: string }> = {
  en: { code: 'en', display_name: 'English', native_name: 'English' },
  yo: { code: 'yo', display_name: 'Yoruba', native_name: 'Yorùbá' },
  ig: { code: 'ig', display_name: 'Igbo', native_name: 'Igbo' },
  ha: { code: 'ha', display_name: 'Hausa', native_name: 'Hausa' },
  fr: { code: 'fr', display_name: 'French', native_name: 'Français' },
  es: { code: 'es', display_name: 'Spanish', native_name: 'Español' },
  pt: { code: 'pt', display_name: 'Portuguese', native_name: 'Português' },
  de: { code: 'de', display_name: 'German', native_name: 'Deutsch' },
  it: { code: 'it', display_name: 'Italian', native_name: 'Italiano' },
  nl: { code: 'nl', display_name: 'Dutch', native_name: 'Nederlands' },
  ar: { code: 'ar', display_name: 'Arabic', native_name: 'العربية' },
  sw: { code: 'sw', display_name: 'Swahili', native_name: 'Kiswahili' },
  hi: { code: 'hi', display_name: 'Hindi', native_name: 'हिन्दी' },
  ur: { code: 'ur', display_name: 'Urdu', native_name: 'اردو' },
  bn: { code: 'bn', display_name: 'Bengali', native_name: 'বাংলা' },
  pa: { code: 'pa', display_name: 'Punjabi', native_name: 'ਪੰਜਾਬੀ' },
  zh: { code: 'zh', display_name: 'Mandarin Chinese', native_name: '中文' },
  ja: { code: 'ja', display_name: 'Japanese', native_name: '日本語' },
  ko: { code: 'ko', display_name: 'Korean', native_name: '한국어' },
  tr: { code: 'tr', display_name: 'Turkish', native_name: 'Türkçe' },
  id: { code: 'id', display_name: 'Indonesian', native_name: 'Bahasa Indonesia' },
};