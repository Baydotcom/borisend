/**
 * RC16.2 — Frontend relationship question engine (mirrors backend question-engine.ts).
 * Deterministic mapping from relationship category system_key → 3–5 questions.
 * No LLM. Answers become PlanRecipient-scoped RelationshipMemory.
 */

export const QUESTION_FAMILIES = {
  romantic_marital: [
    { id: 'appreciate_most', type: 'long_text', prompt: 'What do you appreciate most about this person?', memory_type: 'fact', placeholder: 'e.g. Their patience, their laughter, how they make me feel...' },
    { id: 'be_intentional_about', type: 'long_text', prompt: 'What would you like to be more intentional about in this relationship?', memory_type: 'fact', placeholder: 'e.g. Saying "I love you" more, planning date nights, listening better...' },
    { id: 'enjoy_together', type: 'long_text', prompt: 'Are there things you genuinely enjoy doing together?', memory_type: 'shared_activity', placeholder: 'e.g. Walks, cooking together, watching films, travelling...' },
    { id: 'important_dates', type: 'date', prompt: 'Are there important dates or moments BoriSend should remember?', memory_type: 'important_date', help_text: 'Anniversaries, birthdays, special occasions.' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Is there anything BoriSend should avoid mentioning or assuming?', memory_type: 'boundary', placeholder: 'e.g. Don\'t mention past arguments, avoid work topics...' },
  ],
  parent_child: [
    { id: 'value_most', type: 'long_text', prompt: 'What do you value most about your relationship?', memory_type: 'fact', placeholder: 'e.g. Their curiosity, their honesty, our closeness...' },
    { id: 'communicate_more', type: 'long_text', prompt: 'What would you like to communicate more consistently?', memory_type: 'fact', placeholder: 'e.g. Encouragement, pride in them, checking in on how they feel...' },
    { id: 'happening_now', type: 'long_text', prompt: 'Is there something important happening in their life right now?', memory_type: 'current_context', placeholder: 'e.g. Exams, new job, a challenge they\'re facing...' },
    { id: 'important_dates', type: 'date', prompt: 'Are there important dates or milestones to remember?', memory_type: 'important_date' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Anything BoriSend should avoid assuming?', memory_type: 'boundary' },
  ],
  family_extended: [
    { id: 'value_most', type: 'long_text', prompt: 'What do you value most about this family relationship?', memory_type: 'fact' },
    { id: 'stay_connected', type: 'long_text', prompt: 'What would help you stay connected more consistently?', memory_type: 'fact' },
    { id: 'happening_now', type: 'long_text', prompt: 'Is there anything important happening in their life right now?', memory_type: 'current_context' },
    { id: 'important_dates', type: 'date', prompt: 'Are there important family dates to remember?', memory_type: 'important_date' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Anything BoriSend should avoid assuming?', memory_type: 'boundary' },
  ],
  friendship_personal: [
    { id: 'appreciate_most', type: 'long_text', prompt: 'What do you appreciate most about this friend?', memory_type: 'fact' },
    { id: 'enjoy_together', type: 'long_text', prompt: 'What do you enjoy doing together?', memory_type: 'shared_activity' },
    { id: 'stay_in_touch', type: 'long_text', prompt: 'What would you like to communicate more consistently?', memory_type: 'fact' },
    { id: 'important_dates', type: 'date', prompt: 'Are there important dates BoriSend should remember?', memory_type: 'important_date' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Anything BoriSend should avoid mentioning?', memory_type: 'boundary' },
  ],
  workplace_professional: [
    { id: 'their_role', type: 'short_text', prompt: 'What is this person\'s role?', memory_type: 'fact', placeholder: 'e.g. Direct report, manager, colleague...' },
    { id: 'recognise_support', type: 'long_text', prompt: 'What would you like to recognise, encourage or support?', memory_type: 'fact' },
    { id: 'working_towards', type: 'long_text', prompt: 'Are they currently working towards a particular goal?', memory_type: 'current_context' },
    { id: 'communication_style', type: 'short_text', prompt: 'What communication style works best with them?', memory_type: 'preference', placeholder: 'e.g. Direct, warm, formal, casual...' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Anything BoriSend should avoid assuming?', memory_type: 'boundary' },
  ],
  business_customer: [
    { id: 'service_product', type: 'short_text', prompt: 'What service or product connects you?', memory_type: 'fact' },
    { id: 'value_relationship', type: 'long_text', prompt: 'What do you value about this client relationship?', memory_type: 'fact' },
    { id: 'current_project', type: 'long_text', prompt: 'Is there a current project or milestone worth remembering?', memory_type: 'current_context' },
    { id: 'useful_communication', type: 'short_text', prompt: 'What type of communication is most useful?', memory_type: 'preference' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Anything BoriSend should avoid assuming?', memory_type: 'boundary' },
  ],
  faith_spiritual: [
    { id: 'encouragement_type', type: 'long_text', prompt: 'What kind of encouragement or support is appropriate?', memory_type: 'preference' },
    { id: 'important_milestones', type: 'date', prompt: 'Are there important milestones to remember?', memory_type: 'important_date' },
    { id: 'asked_for_support', type: 'long_text', prompt: 'Is there anything they have explicitly asked for support with?', memory_type: 'fact' },
    { id: 'appropriate_tone', type: 'short_text', prompt: 'What tone is appropriate?', memory_type: 'preference' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Anything BoriSend should avoid assuming?', memory_type: 'boundary' },
  ],
  community_social: [
    { id: 'appreciate_most', type: 'long_text', prompt: 'What do you appreciate most about this person?', memory_type: 'fact' },
    { id: 'be_intentional_about', type: 'long_text', prompt: 'What would you like to be more intentional about?', memory_type: 'fact' },
    { id: 'important_dates', type: 'date', prompt: 'Are there important dates BoriSend should remember?', memory_type: 'important_date' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Anything BoriSend should avoid mentioning?', memory_type: 'boundary' },
  ],
  education_development: [
    { id: 'learning_journey', type: 'long_text', prompt: 'What is this person learning or working towards?', memory_type: 'current_context' },
    { id: 'encourage_most', type: 'long_text', prompt: 'What would you most like to encourage them about?', memory_type: 'fact' },
    { id: 'important_dates', type: 'date', prompt: 'Are there important dates or milestones to remember?', memory_type: 'important_date' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Anything BoriSend should avoid assuming?', memory_type: 'boundary' },
  ],
  care_support: [
    { id: 'care_context', type: 'long_text', prompt: 'What care or support context connects you?', memory_type: 'fact' },
    { id: 'encouragement_type', type: 'long_text', prompt: 'What kind of encouragement is most helpful?', memory_type: 'preference' },
    { id: 'important_dates', type: 'date', prompt: 'Are there important dates to remember?', memory_type: 'important_date' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Anything BoriSend should avoid assuming?', memory_type: 'boundary' },
  ],
  membership_organisation: [
    { id: 'connection_context', type: 'short_text', prompt: 'What connects you to this person?', memory_type: 'fact' },
    { id: 'value_most', type: 'long_text', prompt: 'What do you value about this relationship?', memory_type: 'fact' },
    { id: 'important_dates', type: 'date', prompt: 'Are there important dates to remember?', memory_type: 'important_date' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Anything BoriSend should avoid assuming?', memory_type: 'boundary' },
  ],
  network_influence: [
    { id: 'connection_context', type: 'short_text', prompt: 'What is your professional connection?', memory_type: 'fact' },
    { id: 'value_most', type: 'long_text', prompt: 'What do you value about this relationship?', memory_type: 'fact' },
    { id: 'stay_in_touch', type: 'long_text', prompt: 'What would you like to communicate more consistently?', memory_type: 'fact' },
    { id: 'avoid_assuming', type: 'long_text', prompt: 'Anything BoriSend should avoid assuming?', memory_type: 'boundary' },
  ],
};

const GENERIC_QUESTIONS = [
  { id: 'appreciate_most', type: 'long_text', prompt: 'What do you appreciate most about this person?', memory_type: 'fact', placeholder: 'e.g. Their kindness, their sense of humour, how they always listen...' },
  { id: 'be_intentional_about', type: 'long_text', prompt: 'What would you like to be more intentional about in this relationship?', memory_type: 'fact' },
  { id: 'important_dates', type: 'date', prompt: 'Are there important dates or moments BoriSend should remember?', memory_type: 'important_date' },
  { id: 'avoid_assuming', type: 'long_text', prompt: 'Is there anything BoriSend should avoid mentioning or assuming?', memory_type: 'boundary' },
];

export function getQuestionSet(categoryKey) {
  const questions = QUESTION_FAMILIES[categoryKey] || GENERIC_QUESTIONS;
  return {
    category_key: categoryKey,
    heading: 'Help BoriSend understand this relationship',
    supporting_copy: 'Share only what would help BoriSend prepare thoughtful, accurate messages. You can update this later.',
    questions: questions.slice(0, 5),
  };
}

export function answerToMemory(question, answer) {
  if (answer === null || answer === undefined) return null;
  if (typeof answer === 'string' && answer.trim() === '') return null;
  if (Array.isArray(answer) && answer.length === 0) return null;

  const content = Array.isArray(answer) ? answer.join(', ') : String(answer);
  const result = { memory_type: question.memory_type, content: content.trim() };
  if (question.type === 'date' && typeof answer === 'string') {
    result.related_date = answer;
  }
  return result;
}