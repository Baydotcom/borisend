/**
 * Intelligence Pipeline — Orchestrates the full deterministic pipeline (§3):
 *
 * RELATIONSHIP CATEGORY → TYPE → STATE → GOAL → RECIPIENT/PLAN CONTEXT
 * → SAFETY CHECK → STRATEGY → INTENT → MESSAGE SPECIFICATION
 *
 * The pipeline is pure logic (no Base44 dependencies). The context-loader
 * fetches entity data and passes plain objects here. The provider/LLM is
 * invoked AFTER this pipeline returns a specification (§31).
 *
 * Safety blocks (DO_NOT_ENCOURAGE_CONTACT) prevent the pipeline from producing
 * a specification, so no generation occurs.
 */

import type {
  IntelligenceInput, PipelineResult, SafetyOutcome,
  RelationshipStrategy, MessageSpecification, RhythmRecommendation,
} from './types.ts';
import { evaluateSafety, isSafetyBlocking } from './safety-engine.ts';
import { resolveStrategy } from './strategy-engine.ts';
import { selectIntent } from './intent-engine.ts';
import { recommendRhythm } from './rhythm-engine.ts';
import { buildMessageSpecification } from './message-specification.ts';

export function runIntelligencePipeline(input: IntelligenceInput): PipelineResult {
  // 1. Safety check (deterministic, pre-generation)
  const safety: SafetyOutcome = evaluateSafety(input);

  if (isSafetyBlocking(safety)) {
    return {
      specification: null,
      strategy: resolveStrategy(input),
      intent: '',
      safety,
      rhythm: recommendRhythm(input, resolveStrategy(input)),
      blocked: true,
      block_reason: safety.guidance || safety.reason,
    };
  }

  // 2. Strategy resolution (deterministic)
  const strategy: RelationshipStrategy = resolveStrategy(input);

  // 3. Intent selection (deterministic, repetition-controlled)
  const intent: string = selectIntent(strategy.allowed_message_intents, input.recent_intents);

  // 4. Message specification (deterministic)
  const specification: MessageSpecification = buildMessageSpecification(input, strategy, intent, safety);

  // 5. Rhythm recommendation (deterministic, non-binding)
  const rhythm: RhythmRecommendation = recommendRhythm(input, strategy);

  return {
    specification,
    strategy,
    intent,
    safety,
    rhythm,
    blocked: false,
  };
}