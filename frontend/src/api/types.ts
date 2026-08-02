export interface LoginResponse {
  token: string;
  user_id: number;
  email: string;
  role: string;
  must_change_password: boolean;
}

export interface Profile {
  id: number;
  label: string;
  draft_message: string;
  draft_saved_message_id: number | null;
  draft_mode: string;
  has_session: boolean;
  created_at: string;
  updated_at: string;
}

export interface Job {
  id: number;
  profile_id: number;
  status: string;
  message: string;
  source_message_id: number | null;
  delay_seconds: number;
  max_slowmode_wait: number;
  include_discord: boolean;
  total: number;
  done: number;
  current_name: string;
  current_detail: string;
  error: string;
  summary: Record<string, number>;
  created_at: string;
  updated_at: string;
}

export interface JobResult {
  id: number;
  platform: string;
  target_id: string;
  target_name: string;
  status: string;
  detail: string;
  created_at: string;
}

export type SendLogEntry = JobResult;

export interface Group {
  id: string;
  name: string;
  kind: string;
  stars_required: number;
}

export interface Skip {
  target_id: string;
  name: string;
  reason: string;
  detail: string;
  at: string;
}

export interface DiscordChannel {
  id: string;
  name: string;
  guild: string;
}

export interface SavedMessage {
  id: number;
  tag: string;
  preview: string;
  has_media: boolean;
}

export interface AdminUser {
  id: number;
  email: string;
  role: string;
  is_active: boolean;
  created_at: string;
  profile_count: number;
}
