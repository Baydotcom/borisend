/**
 * Type definitions for the BoriSend relationship subsystem.
 * Portable — no Base44 dependencies.
 */

export interface RelationshipCategoryRecord {
  id: string;
  system_key: string;
  display_name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
}

export interface RelationshipTypeRecord {
  id: string;
  system_key: string;
  category_id: string;
  category_system_key?: string;
  display_label: string;
  user_role_label?: string;
  recipient_role_label?: string;
  description?: string;
  direction_sensitive: boolean;
  display_order: number;
  is_active: boolean;
}

export interface RelationshipStateRecord {
  id: string;
  system_key: string;
  display_name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
}

export interface RelationshipGoalRecord {
  id: string;
  system_key: string;
  display_name: string;
  description?: string;
  display_order: number;
  is_active: boolean;
}

export interface ContactRecord {
  id: string;
  owner_user_id: string;
  first_name?: string;
  last_name?: string;
  display_name: string;
  phone_number?: string;
  email?: string;
  organisation?: string;
  timezone?: string;
  notes?: string;
  is_active: boolean;
}

export type PlanRecipientStatus = 'active' | 'paused' | 'deactivated';

export interface PlanRecipientRecord {
  id: string;
  owner_user_id: string;
  campaign_id: string;
  contact_id: string;
  relationship_type_id?: string;
  relationship_state_id?: string;
  relationship_goal_id?: string;
  recipient_context?: string;
  status: PlanRecipientStatus;
  joined_at?: string;
  deactivated_at?: string;
}

export type RelationshipMemoryType =
  | 'fact'
  | 'milestone'
  | 'important_date'
  | 'preference'
  | 'boundary'
  | 'feedback_derived';

export interface RelationshipMemoryRecord {
  id: string;
  owner_user_id: string;
  campaign_id: string;
  plan_recipient_id: string;
  memory_type: RelationshipMemoryType;
  content: string;
  related_date?: string;
  is_active: boolean;
}