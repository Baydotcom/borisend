/**
 * Improvement Service — guided improvement actions for prepared messages.
 * Portable: pure logic.
 *
 * Improvement requests count as the one permitted alternative provider call.
 */

export interface ImprovementAction {
  id: string;
  label: string;
  instruction: string;
}

export const IMPROVEMENT_ACTIONS: ImprovementAction[] = [
  { id: "shorter", label: "Make it shorter", instruction: "Make this message shorter while keeping the same meaning and warmth." },
  { id: "warmer", label: "Make it warmer", instruction: "Make this message warmer and more affectionate." },
  { id: "professional", label: "Make it more professional", instruction: "Rewrite this message in a more professional tone." },
  { id: "romantic", label: "Make it more romantic", instruction: "Make this message more romantic and heartfelt." },
  { id: "encouraging", label: "Make it more encouraging", instruction: "Make this message more uplifting and encouraging." },
  { id: "simpler", label: "Simplify the language", instruction: "Rewrite this message using simpler, more everyday language." },
  { id: "add_humour", label: "Add gentle humour", instruction: "Add a touch of gentle, appropriate humour to this message." },
  { id: "remove_humour", label: "Remove humour", instruction: "Remove any humour and make this message sincere and straightforward." },
  { id: "remove_emojis", label: "Remove emojis", instruction: "Remove all emojis from this message." },
  { id: "personal", label: "Make it more personal", instruction: "Make this message more personal and specific to the recipient." },
  { id: "time_neutral", label: "Make it time-neutral", instruction: "Rewrite this message with a time-neutral opening that works any time of day." },
];

export function getImprovementAction(id: string): ImprovementAction | null {
  return IMPROVEMENT_ACTIONS.find((a) => a.id === id) || null;
}

/**
 * Build the instruction text for an improvement request.
 * Uses the existing message as context.
 */
export function buildImprovementInstruction(
  actionId: string,
  originalContent: string
): string {
  const action = getImprovementAction(actionId);
  if (!action) throw new Error(`Unknown improvement action: ${actionId}`);
  return `${action.instruction}\n\nOriginal message:\n"${originalContent}"\n\nReturn only the improved message text.`;
}

/**
 * Map improvement action IDs to preference adjustments for learning.
 */
export function improvementToPreferenceHints(actionId: string): string[] {
  switch (actionId) {
    case "shorter": return ["shorter"];
    case "warmer": return ["warmer"];
    case "professional": return ["professional"];
    case "romantic": return ["more romantic"];
    case "encouraging": return ["more encouraging"];
    case "simpler": return ["simpler language"];
    case "add_humour": return ["add humour"];
    case "remove_humour": return ["remove humour"];
    case "remove_emojis": return ["no emojis"];
    case "personal": return ["more personal"];
    case "time_neutral": return ["time-neutral opening"];
    default: return [];
  }
}