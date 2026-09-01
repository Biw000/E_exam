export type UserRole = "admin" | "student";

export interface User {
  id: string;
  name: string;
  email: string;
  role: UserRole;
  created_at: string;
}

export interface Choice {
  id: string;
  choice_text: string;
  order: number;
  is_correct?: boolean; // only present in admin responses
}

export interface Question {
  id: string;
  question_text: string;
  score: number;
  order: number;
  choices: Choice[];
}

export type ExamStatus = "upcoming" | "open" | "closed";

export interface ExamListItem {
  id: string;
  title: string;
  description: string | null;
  duration: number;
  start_time: string;
  end_time: string;
  status: ExamStatus;
}

export interface ExamDetail extends ExamListItem {
  questions: Question[];
}

export type AttemptStatus = "in_progress" | "submitted" | "expired";

export interface SavedAnswer {
  question_id: string;
  choice_id: string | null;
}

export interface Attempt {
  id: string;
  exam_id: string;
  started_at: string;
  submitted_at: string | null;
  status: AttemptStatus;
  duration: number;
  server_time: string;
  questions: Question[];
  answers: SavedAnswer[];
}

export type EventSeverity = "INFO" | "WARNING" | "SUSPICIOUS";

export interface SuspiciousEvent {
  id: string;
  event_type: string;
  severity: EventSeverity;
  confidence: number | null;
  description: string | null;
  event_metadata: Record<string, unknown> | null;
  created_at: string;
}

export type FacePose = "CENTER" | "LEFT" | "RIGHT" | "UP" | "DOWN";

export interface EnrollmentStatus {
  enrolled_poses: string[];
  required_poses: string[];
  missing_poses: string[];
  complete: boolean;
}

export interface MyResult {
  attempt_id: string;
  exam_id: string;
  exam_title: string;
  score: number | null;
  total_score: number;
  percentage: number | null;
  started_at: string;
  submitted_at: string | null;
  status: AttemptStatus;
}

export interface AdminResult {
  attempt_id: string;
  student_name: string;
  student_email: string;
  exam_title: string;
  score: number | null;
  total_score: number;
  started_at: string;
  submitted_at: string | null;
  status: AttemptStatus;
}
