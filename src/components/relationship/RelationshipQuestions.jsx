import React from "react";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Heart } from "lucide-react";
import { getQuestionSet } from "@/lib/relationshipQuestions";

/**
 * RC16.2 — Relationship Context Questions step.
 * Deterministic, LLM-free question set based on relationship category.
 * All questions are optional (Skip for now is implicit — just continue).
 * Answers become PlanRecipient-scoped RelationshipMemory.
 */
export default function RelationshipQuestions({ categoryKey, answers, onAnswersChange }) {
  const questionSet = getQuestionSet(categoryKey);

  const handleAnswer = (questionId, value) => {
    onAnswersChange(prev => ({ ...prev, [questionId]: value }));
  };

  return (
    <div className="space-y-5">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Heart className="w-5 h-5 text-primary" />
          <h2 className="text-lg font-heading font-semibold">{questionSet.heading}</h2>
        </div>
        <p className="text-sm text-muted-foreground">{questionSet.supporting_copy}</p>
      </div>

      <div className="space-y-4">
        {questionSet.questions.map((q, i) => (
          <div key={q.id} className="space-y-1.5">
            <Label className="text-sm font-medium">
              {i + 1}. {q.prompt}
              {!q.required && <span className="text-xs text-muted-foreground font-normal ml-1">(optional)</span>}
            </Label>
            {q.help_text && <p className="text-xs text-muted-foreground">{q.help_text}</p>}
            {q.type === 'long_text' && (
              <Textarea
                value={answers[q.id] || ""}
                onChange={e => handleAnswer(q.id, e.target.value)}
                rows={3}
                placeholder={q.placeholder || "Share what feels right..."}
              />
            )}
            {q.type === 'short_text' && (
              <Input
                value={answers[q.id] || ""}
                onChange={e => handleAnswer(q.id, e.target.value)}
                placeholder={q.placeholder || ""}
                className="h-11"
              />
            )}
            {q.type === 'date' && (
              <Input
                type="date"
                value={answers[q.id] || ""}
                onChange={e => handleAnswer(q.id, e.target.value)}
                className="h-11"
              />
            )}
          </div>
        ))}
      </div>

      <p className="text-xs text-muted-foreground">
        You can skip any question and update these later. BoriSend will only use what you share — it won't invent details.
      </p>
    </div>
  );
}