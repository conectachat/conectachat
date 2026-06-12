export type Json = string | number | boolean | null | { [key: string]: Json | undefined } | Json[];

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.5";
  };
  public: {
    Tables: {
      channels: {
        Row: {
          created_at: string;
          credentials: Json;
          external_instance_id: string | null;
          id: string;
          name: string;
          org_id: string;
          receive_groups: boolean;
          status: Database["public"]["Enums"]["channel_status"];
          type: Database["public"]["Enums"]["channel_type"];
        };
        Insert: {
          created_at?: string;
          credentials?: Json;
          external_instance_id?: string | null;
          id?: string;
          name: string;
          org_id: string;
          receive_groups?: boolean;
          status?: Database["public"]["Enums"]["channel_status"];
          type: Database["public"]["Enums"]["channel_type"];
        };
        Update: {
          created_at?: string;
          credentials?: Json;
          external_instance_id?: string | null;
          id?: string;
          name?: string;
          org_id?: string;
          receive_groups?: boolean;
          status?: Database["public"]["Enums"]["channel_status"];
          type?: Database["public"]["Enums"]["channel_type"];
        };
        Relationships: [
          {
            foreignKeyName: "channels_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      contact_tags: {
        Row: {
          contact_id: string;
          created_at: string;
          tag_id: string;
        };
        Insert: {
          contact_id: string;
          created_at?: string;
          tag_id: string;
        };
        Update: {
          contact_id?: string;
          created_at?: string;
          tag_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contact_tags_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "contact_tags_tag_id_fkey";
            columns: ["tag_id"];
            isOneToOne: false;
            referencedRelation: "tags";
            referencedColumns: ["id"];
          },
        ];
      };
      contacts: {
        Row: {
          avatar_url: string | null;
          birth_date: string | null;
          blocked: boolean;
          channel_type: Database["public"]["Enums"]["channel_type"];
          created_at: string;
          email: string | null;
          external_id: string;
          id: string;
          is_group: boolean;
          metadata: Json;
          name: string | null;
          name_locked: boolean;
          notes: string | null;
          org_id: string;
        };
        Insert: {
          avatar_url?: string | null;
          birth_date?: string | null;
          blocked?: boolean;
          channel_type: Database["public"]["Enums"]["channel_type"];
          created_at?: string;
          email?: string | null;
          external_id: string;
          id?: string;
          is_group?: boolean;
          metadata?: Json;
          name?: string | null;
          name_locked?: boolean;
          notes?: string | null;
          org_id: string;
        };
        Update: {
          avatar_url?: string | null;
          birth_date?: string | null;
          blocked?: boolean;
          channel_type?: Database["public"]["Enums"]["channel_type"];
          created_at?: string;
          email?: string | null;
          external_id?: string;
          id?: string;
          is_group?: boolean;
          metadata?: Json;
          name?: string | null;
          name_locked?: boolean;
          notes?: string | null;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "contacts_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      conversation_transfers: {
        Row: {
          conversation_id: string;
          created_at: string;
          from_department_id: string | null;
          from_user_id: string | null;
          id: string;
          note: string | null;
          org_id: string;
          to_department_id: string | null;
          to_user_id: string | null;
          transferred_by: string | null;
        };
        Insert: {
          conversation_id: string;
          created_at?: string;
          from_department_id?: string | null;
          from_user_id?: string | null;
          id?: string;
          note?: string | null;
          org_id: string;
          to_department_id?: string | null;
          to_user_id?: string | null;
          transferred_by?: string | null;
        };
        Update: {
          conversation_id?: string;
          created_at?: string;
          from_department_id?: string | null;
          from_user_id?: string | null;
          id?: string;
          note?: string | null;
          org_id?: string;
          to_department_id?: string | null;
          to_user_id?: string | null;
          transferred_by?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "conversation_transfers_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_transfers_from_department_id_fkey";
            columns: ["from_department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_transfers_from_user_id_fkey";
            columns: ["from_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_transfers_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_transfers_to_department_id_fkey";
            columns: ["to_department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_transfers_to_user_id_fkey";
            columns: ["to_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversation_transfers_transferred_by_fkey";
            columns: ["transferred_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      conversations: {
        Row: {
          assigned_user_id: string | null;
          channel_id: string;
          contact_id: string;
          created_at: string;
          department_id: string | null;
          id: string;
          last_message_at: string | null;
          org_id: string;
          status: Database["public"]["Enums"]["conversation_status"];
          unread_count: number;
        };
        Insert: {
          assigned_user_id?: string | null;
          channel_id: string;
          contact_id: string;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          last_message_at?: string | null;
          org_id: string;
          status?: Database["public"]["Enums"]["conversation_status"];
          unread_count?: number;
        };
        Update: {
          assigned_user_id?: string | null;
          channel_id?: string;
          contact_id?: string;
          created_at?: string;
          department_id?: string | null;
          id?: string;
          last_message_at?: string | null;
          org_id?: string;
          status?: Database["public"]["Enums"]["conversation_status"];
          unread_count?: number;
        };
        Relationships: [
          {
            foreignKeyName: "conversations_assigned_user_id_fkey";
            columns: ["assigned_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "conversations_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      custom_fields: {
        Row: {
          created_at: string;
          field_type: string;
          id: string;
          name: string;
          org_id: string;
          position: number;
        };
        Insert: {
          created_at?: string;
          field_type?: string;
          id?: string;
          name: string;
          org_id: string;
          position?: number;
        };
        Update: {
          created_at?: string;
          field_type?: string;
          id?: string;
          name?: string;
          org_id?: string;
          position?: number;
        };
        Relationships: [
          {
            foreignKeyName: "custom_fields_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      department_members: {
        Row: {
          department_id: string;
          user_id: string;
        };
        Insert: {
          department_id: string;
          user_id: string;
        };
        Update: {
          department_id?: string;
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "department_members_department_id_fkey";
            columns: ["department_id"];
            isOneToOne: false;
            referencedRelation: "departments";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "department_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      departments: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          org_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          org_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "departments_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      messages: {
        Row: {
          content: string | null;
          content_type: Database["public"]["Enums"]["msg_content_type"];
          conversation_id: string;
          created_at: string;
          direction: Database["public"]["Enums"]["msg_direction"];
          external_message_id: string | null;
          id: string;
          media_name: string | null;
          media_size: number | null;
          media_url: string | null;
          org_id: string;
          reactions: Json;
          reply_to_external_id: string | null;
          reply_to_preview: string | null;
          deleted_at: string | null;
          sender_external_id: string | null;
          sender_name: string | null;
          sender_user_id: string | null;
          status: Database["public"]["Enums"]["msg_status"];
        };
        Insert: {
          content?: string | null;
          content_type?: Database["public"]["Enums"]["msg_content_type"];
          conversation_id: string;
          created_at?: string;
          direction: Database["public"]["Enums"]["msg_direction"];
          external_message_id?: string | null;
          id?: string;
          media_name?: string | null;
          media_size?: number | null;
          media_url?: string | null;
          org_id: string;
          reactions?: Json;
          reply_to_external_id?: string | null;
          reply_to_preview?: string | null;
          deleted_at?: string | null;
          sender_external_id?: string | null;
          sender_name?: string | null;
          sender_user_id?: string | null;
          status?: Database["public"]["Enums"]["msg_status"];
        };
        Update: {
          content?: string | null;
          content_type?: Database["public"]["Enums"]["msg_content_type"];
          conversation_id?: string;
          created_at?: string;
          direction?: Database["public"]["Enums"]["msg_direction"];
          external_message_id?: string | null;
          id?: string;
          media_name?: string | null;
          media_size?: number | null;
          media_url?: string | null;
          org_id?: string;
          reactions?: Json;
          reply_to_external_id?: string | null;
          reply_to_preview?: string | null;
          deleted_at?: string | null;
          sender_external_id?: string | null;
          sender_name?: string | null;
          sender_user_id?: string | null;
          status?: Database["public"]["Enums"]["msg_status"];
        };
        Relationships: [
          {
            foreignKeyName: "messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "messages_sender_user_id_fkey";
            columns: ["sender_user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      org_members: {
        Row: {
          created_at: string;
          id: string;
          org_id: string;
          permissions: Json;
          role: Database["public"]["Enums"]["user_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          org_id: string;
          permissions?: Json;
          role?: Database["public"]["Enums"]["user_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          org_id?: string;
          permissions?: Json;
          role?: Database["public"]["Enums"]["user_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "org_members_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "org_members_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      organizations: {
        Row: {
          created_at: string;
          id: string;
          name: string;
          plan_id: string | null;
          slug: string;
          stripe_customer_id: string | null;
          timezone: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          name: string;
          plan_id?: string | null;
          slug: string;
          stripe_customer_id?: string | null;
          timezone?: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          name?: string;
          plan_id?: string | null;
          slug?: string;
          stripe_customer_id?: string | null;
          timezone?: string;
        };
        Relationships: [
          {
            foreignKeyName: "organizations_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      plans: {
        Row: {
          created_at: string;
          currency: string;
          description: string | null;
          features: Json;
          id: string;
          is_active: boolean;
          max_channels: number;
          max_users: number;
          name: string;
          price_cents: number;
          stripe_price_id: string | null;
        };
        Insert: {
          created_at?: string;
          currency?: string;
          description?: string | null;
          features?: Json;
          id?: string;
          is_active?: boolean;
          max_channels?: number;
          max_users?: number;
          name: string;
          price_cents?: number;
          stripe_price_id?: string | null;
        };
        Update: {
          created_at?: string;
          currency?: string;
          description?: string | null;
          features?: Json;
          id?: string;
          is_active?: boolean;
          max_channels?: number;
          max_users?: number;
          name?: string;
          price_cents?: number;
          stripe_price_id?: string | null;
        };
        Relationships: [];
      };
      platform_staff: {
        Row: {
          created_at: string;
          id: string;
          role: Database["public"]["Enums"]["platform_role"];
          user_id: string;
        };
        Insert: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["platform_role"];
          user_id: string;
        };
        Update: {
          created_at?: string;
          id?: string;
          role?: Database["public"]["Enums"]["platform_role"];
          user_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "platform_staff_user_id_fkey";
            columns: ["user_id"];
            isOneToOne: true;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
        ];
      };
      profiles: {
        Row: {
          avatar_url: string | null;
          created_at: string;
          email: string | null;
          full_name: string | null;
          id: string;
          language: string;
          timezone: string | null;
        };
        Insert: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id: string;
          language?: string;
          timezone?: string | null;
        };
        Update: {
          avatar_url?: string | null;
          created_at?: string;
          email?: string | null;
          full_name?: string | null;
          id?: string;
          language?: string;
          timezone?: string | null;
        };
        Relationships: [];
      };
      quick_replies: {
        Row: {
          active: boolean;
          content: string;
          created_at: string;
          id: string;
          org_id: string;
          shortcut: string;
          title: string | null;
        };
        Insert: {
          active?: boolean;
          content: string;
          created_at?: string;
          id?: string;
          org_id: string;
          shortcut: string;
          title?: string | null;
        };
        Update: {
          active?: boolean;
          content?: string;
          created_at?: string;
          id?: string;
          org_id?: string;
          shortcut?: string;
          title?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "quick_replies_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      scheduled_messages: {
        Row: {
          channel_id: string;
          contact_id: string;
          content: string | null;
          conversation_id: string | null;
          created_at: string;
          created_by: string | null;
          error: string | null;
          id: string;
          media_mime: string | null;
          media_name: string | null;
          media_path: string | null;
          media_type: string | null;
          org_id: string;
          scheduled_at: string;
          sent_at: string | null;
          status: string;
        };
        Insert: {
          channel_id: string;
          contact_id: string;
          content?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          media_mime?: string | null;
          media_name?: string | null;
          media_path?: string | null;
          media_type?: string | null;
          org_id: string;
          scheduled_at: string;
          sent_at?: string | null;
          status?: string;
        };
        Update: {
          channel_id?: string;
          contact_id?: string;
          content?: string | null;
          conversation_id?: string | null;
          created_at?: string;
          created_by?: string | null;
          error?: string | null;
          id?: string;
          media_mime?: string | null;
          media_name?: string | null;
          media_path?: string | null;
          media_type?: string | null;
          org_id?: string;
          scheduled_at?: string;
          sent_at?: string | null;
          status?: string;
        };
        Relationships: [
          {
            foreignKeyName: "scheduled_messages_channel_id_fkey";
            columns: ["channel_id"];
            isOneToOne: false;
            referencedRelation: "channels";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_messages_contact_id_fkey";
            columns: ["contact_id"];
            isOneToOne: false;
            referencedRelation: "contacts";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_messages_conversation_id_fkey";
            columns: ["conversation_id"];
            isOneToOne: false;
            referencedRelation: "conversations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_messages_created_by_fkey";
            columns: ["created_by"];
            isOneToOne: false;
            referencedRelation: "profiles";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "scheduled_messages_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
      subscriptions: {
        Row: {
          created_at: string;
          current_period_end: string | null;
          id: string;
          org_id: string;
          plan_id: string | null;
          status: Database["public"]["Enums"]["subscription_status"];
          stripe_subscription_id: string | null;
        };
        Insert: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          org_id: string;
          plan_id?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          stripe_subscription_id?: string | null;
        };
        Update: {
          created_at?: string;
          current_period_end?: string | null;
          id?: string;
          org_id?: string;
          plan_id?: string | null;
          status?: Database["public"]["Enums"]["subscription_status"];
          stripe_subscription_id?: string | null;
        };
        Relationships: [
          {
            foreignKeyName: "subscriptions_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
          {
            foreignKeyName: "subscriptions_plan_id_fkey";
            columns: ["plan_id"];
            isOneToOne: false;
            referencedRelation: "plans";
            referencedColumns: ["id"];
          },
        ];
      };
      tags: {
        Row: {
          color: string;
          created_at: string;
          id: string;
          name: string;
          org_id: string;
        };
        Insert: {
          color?: string;
          created_at?: string;
          id?: string;
          name: string;
          org_id: string;
        };
        Update: {
          color?: string;
          created_at?: string;
          id?: string;
          name?: string;
          org_id?: string;
        };
        Relationships: [
          {
            foreignKeyName: "tags_org_id_fkey";
            columns: ["org_id"];
            isOneToOne: false;
            referencedRelation: "organizations";
            referencedColumns: ["id"];
          },
        ];
      };
    };
    Views: {
      [_ in never]: never;
    };
    Functions: {
      is_member_of: { Args: { p_org_id: string }; Returns: boolean };
      is_org_admin: { Args: { p_org_id: string }; Returns: boolean };
      is_platform_staff: { Args: never; Returns: boolean };
      is_super_admin: { Args: never; Returns: boolean };
    };
    Enums: {
      channel_status: "disconnected" | "connecting" | "connected" | "error";
      channel_type: "whatsapp_baileys" | "whatsapp_cloud" | "telegram" | "instagram" | "messenger";
      conversation_status: "open" | "pending" | "closed";
      msg_content_type: "text" | "image" | "audio" | "video" | "document" | "location" | "sticker";
      msg_direction: "inbound" | "outbound";
      msg_status: "queued" | "sent" | "delivered" | "read" | "failed";
      platform_role: "super_admin" | "finance" | "sales" | "support" | "ops";
      subscription_status: "trialing" | "active" | "past_due" | "canceled" | "incomplete";
      user_role: "owner" | "admin" | "agent";
    };
    CompositeTypes: {
      [_ in never]: never;
    };
  };
};

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">;

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">];

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R;
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] & DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R;
      }
      ? R
      : never
    : never;

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I;
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I;
      }
      ? I
      : never
    : never;

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"] | { schema: keyof DatabaseWithoutInternals },
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U;
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U;
      }
      ? U
      : never
    : never;

export type Enums<
  DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"] | { schema: keyof DatabaseWithoutInternals },
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never;

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals;
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals;
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never;

export const Constants = {
  public: {
    Enums: {
      channel_status: ["disconnected", "connecting", "connected", "error"],
      channel_type: ["whatsapp_baileys", "whatsapp_cloud", "telegram", "instagram", "messenger"],
      conversation_status: ["open", "pending", "closed"],
      msg_content_type: ["text", "image", "audio", "video", "document", "location", "sticker"],
      msg_direction: ["inbound", "outbound"],
      msg_status: ["queued", "sent", "delivered", "read", "failed"],
      platform_role: ["super_admin", "finance", "sales", "support", "ops"],
      subscription_status: ["trialing", "active", "past_due", "canceled", "incomplete"],
      user_role: ["owner", "admin", "agent"],
    },
  },
} as const;
