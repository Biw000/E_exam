"use client";

import { Question } from "@/types";

interface QuestionCardProps {
  question: Question;
  index: number;
  total: number;
  selectedChoiceId: string | null;
  onSelect: (choiceId: string) => void;
}

export default function QuestionCard({ question, index, total, selectedChoiceId, onSelect }: QuestionCardProps) {
  return (
    <div className="card space-y-4">
      <p className="text-sm text-slate-500">
        Question {index + 1} / {total}
      </p>
      <h3 className="text-lg font-medium">{question.question_text}</h3>
      <div className="space-y-2">
        {question.choices.map((choice) => (
          <label
            key={choice.id}
            className={`flex items-center gap-3 border rounded-lg px-4 py-2 cursor-pointer transition ${
              selectedChoiceId === choice.id
                ? "border-brand-500 bg-brand-50"
                : "border-slate-200 hover:border-slate-300"
            }`}
          >
            <input
              type="radio"
              name={`question-${question.id}`}
              checked={selectedChoiceId === choice.id}
              onChange={() => onSelect(choice.id)}
            />
            <span>{choice.choice_text}</span>
          </label>
        ))}
      </div>
    </div>
  );
}
