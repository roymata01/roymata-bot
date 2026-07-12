export type Channel = "whatsapp" | "instagram" | "messenger";

export type ConversationStatus =
  | "con_ia"
  | "por_atender"
  | "atendiendo"
  | "apagada"
  | "cerrada";

export type MessageDirection = "in" | "out";
export type MessageSenderType = "contact" | "ai" | "human";

export type LeadStatus = "interesado" | "registrado" | "sin_interes" | "cliente";

export interface Contact {
  id: string;
  channel: Channel;
  external_id: string;
  display_name: string | null;
  phone: string | null;
  avatar_url: string | null;
  tags: string[];
  notes: string | null;
  lead_status: LeadStatus | null;
  first_contact_at: string;
  last_contact_at: string;
  created_at: string;
  updated_at: string;
}

export interface Conversation {
  id: string;
  contact_id: string;
  channel: Channel;
  status: ConversationStatus;
  ai_enabled: boolean;
  assigned_user_id: string | null;
  last_message_at: string | null;
  last_message_preview: string | null;
  last_inbound_at: string | null;
  unread_count: number;
  created_at: string;
  updated_at: string;
}

export interface Message {
  id: string;
  conversation_id: string;
  contact_id: string;
  channel: Channel;
  direction: MessageDirection;
  sender_type: MessageSenderType;
  sender_user_id: string | null;
  content: string | null;
  media_url: string | null;
  media_type: string | null;
  meta_message_id: string | null;
  status: "sent" | "delivered" | "read" | "failed" | null;
  raw_payload: Record<string, unknown> | null;
  created_at: string;
}

export interface KnowledgeBaseSection {
  id: string;
  section_key: string;
  title: string;
  content: string;
  order_index: number;
  is_active: boolean;
  updated_at: string;
}

export interface AssistantSettings {
  id: 1;
  model: string;
  max_tokens: number;
  escalation_keywords: string[];
  business_hours: Record<string, unknown>;
  off_hours_message: string | null;
  is_paused: boolean;
  relevance_filter_enabled: boolean;
  relevance_filter_prompt: string;
  comment_dm_enabled: boolean;
  comment_dm_text: string;
  keyword_trigger: string;
  keyword_reply: string;
  updated_at: string;
}

export interface QuoteRequest {
  id: string;
  conversation_id: string;
  contact_id: string;
  nombre: string | null;
  organizacion: string | null;
  num_personas: number | null;
  correo: string | null;
  telefono: string | null;
  notas: string | null;
  status: "pendiente" | "atendida";
  created_at: string;
  updated_at: string;
  contact?: Contact;
}

export interface CommentInvite {
  id: string;
  channel: Channel;
  comment_id: string;
  media_id: string | null;
  ig_user_id: string;
  username: string | null;
  comment_text: string | null;
  status: "pending" | "sent" | "failed";
  error: string | null;
  created_at: string;
}

export interface Template {
  id: string;
  name: string;
  channel: Channel | null;
  category: string | null;
  body: string;
  variables: string[];
  meta_template_name: string | null;
  meta_template_status: string | null;
  created_at: string;
  updated_at: string;
}

export interface Workflow {
  id: string;
  name: string;
  is_active: boolean;
  priority: number;
  trigger_type: "contains_keyword" | "emergency_keyword";
  trigger_config: { keywords?: string[]; channel?: Channel | null };
  action_type: "tag" | "reply_template" | "notify" | "disable_ai";
  action_config: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface ChannelAccount {
  id: string;
  channel: Channel;
  label: string;
  external_account_id: string;
  waba_id: string | null;
  is_active: boolean;
  connected_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  full_name: string | null;
  role: "admin" | "agent";
  created_at: string;
}
