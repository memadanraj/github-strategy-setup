export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      ai_tasks: {
        Row: {
          created_at: string
          credit_cost: number
          description: string | null
          is_active: boolean
          model: string
          name: string
          slug: string
        }
        Insert: {
          created_at?: string
          credit_cost: number
          description?: string | null
          is_active?: boolean
          model: string
          name: string
          slug: string
        }
        Update: {
          created_at?: string
          credit_cost?: number
          description?: string | null
          is_active?: boolean
          model?: string
          name?: string
          slug?: string
        }
        Relationships: []
      }
      assets: {
        Row: {
          created_at: string
          id: string
          kind: string
          meta: Json
          name: string
          project_id: string
          scene_id: string | null
          storage_path: string | null
        }
        Insert: {
          created_at?: string
          id?: string
          kind: string
          meta?: Json
          name: string
          project_id: string
          scene_id?: string | null
          storage_path?: string | null
        }
        Update: {
          created_at?: string
          id?: string
          kind?: string
          meta?: Json
          name?: string
          project_id?: string
          scene_id?: string | null
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "assets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "assets_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
        ]
      }
      characters: {
        Row: {
          created_at: string
          description: string | null
          id: string
          name: string
          project_id: string
          visual_notes: string | null
        }
        Insert: {
          created_at?: string
          description?: string | null
          id?: string
          name: string
          project_id: string
          visual_notes?: string | null
        }
        Update: {
          created_at?: string
          description?: string | null
          id?: string
          name?: string
          project_id?: string
          visual_notes?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "characters_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      credit_transactions: {
        Row: {
          amount: number
          created_at: string
          description: string | null
          id: string
          kind: string
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          description?: string | null
          id?: string
          kind: string
          user_id: string
        }
        Update: {
          amount?: number
          created_at?: string
          description?: string | null
          id?: string
          kind?: string
          user_id?: string
        }
        Relationships: []
      }
      generation_jobs: {
        Row: {
          created_at: string
          credits_reserved: number
          error: string | null
          finished_at: string | null
          id: string
          input: Json
          output: Json | null
          project_id: string | null
          started_at: string | null
          status: string
          task_slug: string
          user_id: string
        }
        Insert: {
          created_at?: string
          credits_reserved?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json | null
          project_id?: string | null
          started_at?: string | null
          status?: string
          task_slug: string
          user_id: string
        }
        Update: {
          created_at?: string
          credits_reserved?: number
          error?: string | null
          finished_at?: string | null
          id?: string
          input?: Json
          output?: Json | null
          project_id?: string | null
          started_at?: string | null
          status?: string
          task_slug?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "generation_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "generation_jobs_task_slug_fkey"
            columns: ["task_slug"]
            isOneToOne: false
            referencedRelation: "ai_tasks"
            referencedColumns: ["slug"]
          },
        ]
      }
      plans: {
        Row: {
          created_at: string
          features: Json
          id: string
          is_active: boolean
          is_featured: boolean
          max_projects: number | null
          max_resolution: string
          max_storage_gb: number | null
          max_video_minutes: number | null
          monthly_credits: number
          name: string
          price_monthly_cents: number
          render_priority: number
          slug: string
          sort_order: number
          tagline: string | null
          youtube_channels: number
        }
        Insert: {
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          max_projects?: number | null
          max_resolution?: string
          max_storage_gb?: number | null
          max_video_minutes?: number | null
          monthly_credits?: number
          name: string
          price_monthly_cents?: number
          render_priority?: number
          slug: string
          sort_order?: number
          tagline?: string | null
          youtube_channels?: number
        }
        Update: {
          created_at?: string
          features?: Json
          id?: string
          is_active?: boolean
          is_featured?: boolean
          max_projects?: number | null
          max_resolution?: string
          max_storage_gb?: number | null
          max_video_minutes?: number | null
          monthly_credits?: number
          name?: string
          price_monthly_cents?: number
          render_priority?: number
          slug?: string
          sort_order?: number
          tagline?: string | null
          youtube_channels?: number
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          credits_balance: number
          display_name: string | null
          id: string
          onboarded: boolean
          plan_slug: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          credits_balance?: number
          display_name?: string | null
          id: string
          onboarded?: boolean
          plan_slug?: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          credits_balance?: number
          display_name?: string | null
          id?: string
          onboarded?: boolean
          plan_slug?: string
          updated_at?: string
        }
        Relationships: []
      }
      project_versions: {
        Row: {
          created_at: string
          id: string
          label: string | null
          project_id: string
          snapshot: Json
          version_number: number
        }
        Insert: {
          created_at?: string
          id?: string
          label?: string | null
          project_id: string
          snapshot?: Json
          version_number: number
        }
        Update: {
          created_at?: string
          id?: string
          label?: string | null
          project_id?: string
          snapshot?: Json
          version_number?: number
        }
        Relationships: [
          {
            foreignKeyName: "project_versions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      project_writing: {
        Row: {
          hooks: Json | null
          project_id: string
          research: Json | null
          script: string | null
          titles: Json | null
          updated_at: string
        }
        Insert: {
          hooks?: Json | null
          project_id: string
          research?: Json | null
          script?: string | null
          titles?: Json | null
          updated_at?: string
        }
        Update: {
          hooks?: Json | null
          project_id?: string
          research?: Json | null
          script?: string | null
          titles?: Json | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "project_writing_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      projects: {
        Row: {
          created_at: string
          format: string
          id: string
          idea: string | null
          mode: string
          status: string
          thumbnail_url: string | null
          title: string
          updated_at: string
          user_id: string
          visual_style: string
        }
        Insert: {
          created_at?: string
          format?: string
          id?: string
          idea?: string | null
          mode?: string
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id: string
          visual_style?: string
        }
        Update: {
          created_at?: string
          format?: string
          id?: string
          idea?: string | null
          mode?: string
          status?: string
          thumbnail_url?: string | null
          title?: string
          updated_at?: string
          user_id?: string
          visual_style?: string
        }
        Relationships: []
      }
      scenes: {
        Row: {
          clip_path: string | null
          created_at: string
          duration_seconds: number
          id: string
          image_path: string | null
          narration: string | null
          position: number
          project_id: string
          title: string
          updated_at: string
          visual_prompt: string | null
        }
        Insert: {
          clip_path?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          image_path?: string | null
          narration?: string | null
          position?: number
          project_id: string
          title?: string
          updated_at?: string
          visual_prompt?: string | null
        }
        Update: {
          clip_path?: string | null
          created_at?: string
          duration_seconds?: number
          id?: string
          image_path?: string | null
          narration?: string | null
          position?: number
          project_id?: string
          title?: string
          updated_at?: string
          visual_prompt?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scenes_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      user_roles: {
        Row: {
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      complete_generation_job: {
        Args: { _job_id: string; _output: Json }
        Returns: undefined
      }
      fail_generation_job: {
        Args: { _error: string; _job_id: string }
        Returns: undefined
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      owns_project: { Args: { _project_id: string }; Returns: boolean }
      start_generation_job: {
        Args: { _input: Json; _project_id: string; _task_slug: string }
        Returns: string
      }
    }
    Enums: {
      app_role: "admin" | "moderator" | "user"
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      app_role: ["admin", "moderator", "user"],
    },
  },
} as const
