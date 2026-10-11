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
      caption_styles: {
        Row: {
          created_at: string
          id: string
          is_default: boolean
          name: string
          project_id: string
          style: Json
        }
        Insert: {
          created_at?: string
          id?: string
          is_default?: boolean
          name: string
          project_id: string
          style?: Json
        }
        Update: {
          created_at?: string
          id?: string
          is_default?: boolean
          name?: string
          project_id?: string
          style?: Json
        }
        Relationships: [
          {
            foreignKeyName: "caption_styles_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      captions: {
        Row: {
          created_at: string
          end_seconds: number
          id: string
          position: string
          project_id: string
          scene_id: string | null
          start_seconds: number
          style: Json
          text: string
          updated_at: string
          words: Json | null
        }
        Insert: {
          created_at?: string
          end_seconds: number
          id?: string
          position?: string
          project_id: string
          scene_id?: string | null
          start_seconds: number
          style?: Json
          text: string
          updated_at?: string
          words?: Json | null
        }
        Update: {
          created_at?: string
          end_seconds?: number
          id?: string
          position?: string
          project_id?: string
          scene_id?: string | null
          start_seconds?: number
          style?: Json
          text?: string
          updated_at?: string
          words?: Json | null
        }
        Relationships: [
          {
            foreignKeyName: "captions_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "captions_scene_id_fkey"
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
      credit_packs: {
        Row: {
          created_at: string
          credits: number
          id: string
          is_active: boolean
          name: string
          paddle_price_id: string | null
          price_cents: number
          slug: string
          sort_order: number
        }
        Insert: {
          created_at?: string
          credits: number
          id?: string
          is_active?: boolean
          name: string
          paddle_price_id?: string | null
          price_cents: number
          slug: string
          sort_order?: number
        }
        Update: {
          created_at?: string
          credits?: number
          id?: string
          is_active?: boolean
          name?: string
          paddle_price_id?: string | null
          price_cents?: number
          slug?: string
          sort_order?: number
        }
        Relationships: []
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
      exports: {
        Row: {
          asset_id: string | null
          created_at: string
          duration_seconds: number | null
          filename: string
          format: string
          fps: number | null
          height: number | null
          id: string
          metadata: Json
          project_id: string
          render_job_id: string
          size_bytes: number | null
          status: string
          storage_path: string | null
          width: number | null
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          filename: string
          format: string
          fps?: number | null
          height?: number | null
          id?: string
          metadata?: Json
          project_id: string
          render_job_id: string
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          width?: number | null
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          filename?: string
          format?: string
          fps?: number | null
          height?: number | null
          id?: string
          metadata?: Json
          project_id?: string
          render_job_id?: string
          size_bytes?: number | null
          status?: string
          storage_path?: string | null
          width?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "exports_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exports_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "exports_render_job_id_fkey"
            columns: ["render_job_id"]
            isOneToOne: false
            referencedRelation: "render_jobs"
            referencedColumns: ["id"]
          },
        ]
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
      music_tracks: {
        Row: {
          asset_id: string | null
          attribution: string | null
          created_at: string
          duration_seconds: number | null
          genre: string | null
          id: string
          license: string | null
          metadata: Json
          mood: string | null
          project_id: string
          provider: string
          provider_asset_id: string | null
          title: string
          updated_at: string
        }
        Insert: {
          asset_id?: string | null
          attribution?: string | null
          created_at?: string
          duration_seconds?: number | null
          genre?: string | null
          id?: string
          license?: string | null
          metadata?: Json
          mood?: string | null
          project_id: string
          provider?: string
          provider_asset_id?: string | null
          title: string
          updated_at?: string
        }
        Update: {
          asset_id?: string | null
          attribution?: string | null
          created_at?: string
          duration_seconds?: number | null
          genre?: string | null
          id?: string
          license?: string | null
          metadata?: Json
          mood?: string | null
          project_id?: string
          provider?: string
          provider_asset_id?: string | null
          title?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "music_tracks_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "music_tracks_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      paddle_customers: {
        Row: {
          created_at: string
          email: string | null
          id: string
          paddle_customer_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          email?: string | null
          id?: string
          paddle_customer_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          email?: string | null
          id?: string
          paddle_customer_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paddle_customers_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      paddle_events: {
        Row: {
          created_at: string
          event_type: string
          id: string
          metadata: Json
          paddle_event_id: string
        }
        Insert: {
          created_at?: string
          event_type: string
          id?: string
          metadata?: Json
          paddle_event_id: string
        }
        Update: {
          created_at?: string
          event_type?: string
          id?: string
          metadata?: Json
          paddle_event_id?: string
        }
        Relationships: []
      }
      paddle_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          canceled_at: string | null
          created_at: string
          current_period_end: string | null
          current_period_start: string | null
          id: string
          metadata: Json
          paddle_customer_id: string
          paddle_subscription_id: string
          plan_slug: string
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          paddle_customer_id: string
          paddle_subscription_id: string
          plan_slug?: string
          status: string
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          canceled_at?: string | null
          created_at?: string
          current_period_end?: string | null
          current_period_start?: string | null
          id?: string
          metadata?: Json
          paddle_customer_id?: string
          paddle_subscription_id?: string
          plan_slug?: string
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "paddle_subscriptions_user_id_fkey"
            columns: ["user_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
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
          paddle_price_id: string | null
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
          paddle_price_id?: string | null
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
          paddle_price_id?: string | null
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
          settings: Json
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
          settings?: Json
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
          settings?: Json
        }
        Relationships: []
      }
      render_jobs: {
        Row: {
          created_at: string
          error: string | null
          finished_at: string | null
          id: string
          input_manifest: Json
          preset_id: string | null
          progress: number
          project_id: string
          provider: string
          provider_job_id: string | null
          started_at: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input_manifest?: Json
          preset_id?: string | null
          progress?: number
          project_id: string
          provider?: string
          provider_job_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          error?: string | null
          finished_at?: string | null
          id?: string
          input_manifest?: Json
          preset_id?: string | null
          progress?: number
          project_id?: string
          provider?: string
          provider_job_id?: string | null
          started_at?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "render_jobs_preset_id_fkey"
            columns: ["preset_id"]
            isOneToOne: false
            referencedRelation: "render_presets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "render_jobs_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      render_presets: {
        Row: {
          audio_bitrate_kbps: number
          audio_codec: string
          container: string
          created_at: string
          fps: number
          height: number
          id: string
          is_default: boolean
          name: string
          project_id: string
          updated_at: string
          video_bitrate_kbps: number
          video_codec: string
          width: number
        }
        Insert: {
          audio_bitrate_kbps?: number
          audio_codec?: string
          container?: string
          created_at?: string
          fps: number
          height: number
          id?: string
          is_default?: boolean
          name: string
          project_id: string
          updated_at?: string
          video_bitrate_kbps?: number
          video_codec?: string
          width: number
        }
        Update: {
          audio_bitrate_kbps?: number
          audio_codec?: string
          container?: string
          created_at?: string
          fps?: number
          height?: number
          id?: string
          is_default?: boolean
          name?: string
          project_id?: string
          updated_at?: string
          video_bitrate_kbps?: number
          video_codec?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "render_presets_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      scene_audio: {
        Row: {
          created_at: string
          ducking_amount: number
          ducking_attack_ms: number
          ducking_enabled: boolean
          ducking_release_ms: number
          fade_in_ms: number
          fade_out_ms: number
          id: string
          metadata: Json
          music_track_id: string | null
          music_volume: number
          project_id: string
          scene_id: string
          sfx_asset_id: string | null
          sfx_volume: number
          updated_at: string
          voice_volume: number
          voiceover_id: string | null
        }
        Insert: {
          created_at?: string
          ducking_amount?: number
          ducking_attack_ms?: number
          ducking_enabled?: boolean
          ducking_release_ms?: number
          fade_in_ms?: number
          fade_out_ms?: number
          id?: string
          metadata?: Json
          music_track_id?: string | null
          music_volume?: number
          project_id: string
          scene_id: string
          sfx_asset_id?: string | null
          sfx_volume?: number
          updated_at?: string
          voice_volume?: number
          voiceover_id?: string | null
        }
        Update: {
          created_at?: string
          ducking_amount?: number
          ducking_attack_ms?: number
          ducking_enabled?: boolean
          ducking_release_ms?: number
          fade_in_ms?: number
          fade_out_ms?: number
          id?: string
          metadata?: Json
          music_track_id?: string | null
          music_volume?: number
          project_id?: string
          scene_id?: string
          sfx_asset_id?: string | null
          sfx_volume?: number
          updated_at?: string
          voice_volume?: number
          voiceover_id?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "scene_audio_music_track_id_fkey"
            columns: ["music_track_id"]
            isOneToOne: false
            referencedRelation: "music_tracks"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_audio_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_audio_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: true
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_audio_sfx_asset_id_fkey"
            columns: ["sfx_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "scene_audio_voiceover_id_fkey"
            columns: ["voiceover_id"]
            isOneToOne: false
            referencedRelation: "voiceovers"
            referencedColumns: ["id"]
          },
        ]
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
      timeline_clips: {
        Row: {
          asset_id: string | null
          clip_type: string
          created_at: string
          duration_seconds: number
          id: string
          metadata: Json
          opacity: number
          playback_rate: number
          project_id: string
          scene_id: string | null
          source_start_seconds: number
          start_seconds: number
          track_id: string
          transition_in: string | null
          transition_out: string | null
          updated_at: string
          volume: number
        }
        Insert: {
          asset_id?: string | null
          clip_type: string
          created_at?: string
          duration_seconds?: number
          id?: string
          metadata?: Json
          opacity?: number
          playback_rate?: number
          project_id: string
          scene_id?: string | null
          source_start_seconds?: number
          start_seconds?: number
          track_id: string
          transition_in?: string | null
          transition_out?: string | null
          updated_at?: string
          volume?: number
        }
        Update: {
          asset_id?: string | null
          clip_type?: string
          created_at?: string
          duration_seconds?: number
          id?: string
          metadata?: Json
          opacity?: number
          playback_rate?: number
          project_id?: string
          scene_id?: string | null
          source_start_seconds?: number
          start_seconds?: number
          track_id?: string
          transition_in?: string | null
          transition_out?: string | null
          updated_at?: string
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "timeline_clips_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_clips_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_clips_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "timeline_clips_track_id_fkey"
            columns: ["track_id"]
            isOneToOne: false
            referencedRelation: "timeline_tracks"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_settings: {
        Row: {
          caption_style: Json
          created_at: string
          fps: number
          grid_seconds: number
          height: number
          project_id: string
          snap_enabled: boolean
          updated_at: string
          width: number
        }
        Insert: {
          caption_style?: Json
          created_at?: string
          fps?: number
          grid_seconds?: number
          height?: number
          project_id: string
          snap_enabled?: boolean
          updated_at?: string
          width?: number
        }
        Update: {
          caption_style?: Json
          created_at?: string
          fps?: number
          grid_seconds?: number
          height?: number
          project_id?: string
          snap_enabled?: boolean
          updated_at?: string
          width?: number
        }
        Relationships: [
          {
            foreignKeyName: "timeline_settings_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: true
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
        ]
      }
      timeline_tracks: {
        Row: {
          created_at: string
          id: string
          locked: boolean
          muted: boolean
          name: string
          position: number
          project_id: string
          track_type: string
          updated_at: string
          visible: boolean
          volume: number
        }
        Insert: {
          created_at?: string
          id?: string
          locked?: boolean
          muted?: boolean
          name: string
          position?: number
          project_id: string
          track_type: string
          updated_at?: string
          visible?: boolean
          volume?: number
        }
        Update: {
          created_at?: string
          id?: string
          locked?: boolean
          muted?: boolean
          name?: string
          position?: number
          project_id?: string
          track_type?: string
          updated_at?: string
          visible?: boolean
          volume?: number
        }
        Relationships: [
          {
            foreignKeyName: "timeline_tracks_project_id_fkey"
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
      voice_clones: {
        Row: {
          consent_confirmed: boolean
          consent_text: string | null
          created_at: string
          id: string
          metadata: Json
          name: string
          project_id: string
          provider: string
          provider_voice_id: string | null
          source_asset_id: string | null
          status: string
          updated_at: string
          user_id: string
        }
        Insert: {
          consent_confirmed?: boolean
          consent_text?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name: string
          project_id: string
          provider: string
          provider_voice_id?: string | null
          source_asset_id?: string | null
          status?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          consent_confirmed?: boolean
          consent_text?: string | null
          created_at?: string
          id?: string
          metadata?: Json
          name?: string
          project_id?: string
          provider?: string
          provider_voice_id?: string | null
          source_asset_id?: string | null
          status?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voice_clones_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voice_clones_source_asset_id_fkey"
            columns: ["source_asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
        ]
      }
      voiceovers: {
        Row: {
          asset_id: string | null
          created_at: string
          duration_seconds: number | null
          generation_job_id: string | null
          id: string
          metadata: Json
          model: string
          project_id: string
          provider: string
          scene_id: string
          status: string
          text: string
          text_hash: string
          voice_id: string
        }
        Insert: {
          asset_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          generation_job_id?: string | null
          id?: string
          metadata?: Json
          model: string
          project_id: string
          provider: string
          scene_id: string
          status?: string
          text: string
          text_hash: string
          voice_id: string
        }
        Update: {
          asset_id?: string | null
          created_at?: string
          duration_seconds?: number | null
          generation_job_id?: string | null
          id?: string
          metadata?: Json
          model?: string
          project_id?: string
          provider?: string
          scene_id?: string
          status?: string
          text?: string
          text_hash?: string
          voice_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "voiceovers_asset_id_fkey"
            columns: ["asset_id"]
            isOneToOne: false
            referencedRelation: "assets"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voiceovers_generation_job_id_fkey"
            columns: ["generation_job_id"]
            isOneToOne: false
            referencedRelation: "generation_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voiceovers_project_id_fkey"
            columns: ["project_id"]
            isOneToOne: false
            referencedRelation: "projects"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voiceovers_scene_id_fkey"
            columns: ["scene_id"]
            isOneToOne: false
            referencedRelation: "scenes"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "voiceovers_voice_id_fkey"
            columns: ["voice_id"]
            isOneToOne: false
            referencedRelation: "voices"
            referencedColumns: ["id"]
          },
        ]
      }
      voices: {
        Row: {
          accent: string | null
          category: string | null
          created_at: string
          gender: string | null
          id: string
          language: string | null
          metadata: Json
          name: string
          preview_url: string | null
          provider: string
          provider_voice_id: string
          status: string
          style: string | null
          updated_at: string
        }
        Insert: {
          accent?: string | null
          category?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          language?: string | null
          metadata?: Json
          name: string
          preview_url?: string | null
          provider: string
          provider_voice_id: string
          status?: string
          style?: string | null
          updated_at?: string
        }
        Update: {
          accent?: string | null
          category?: string | null
          created_at?: string
          gender?: string | null
          id?: string
          language?: string | null
          metadata?: Json
          name?: string
          preview_url?: string | null
          provider?: string
          provider_voice_id?: string
          status?: string
          style?: string | null
          updated_at?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      create_project_version: {
        Args: { _label?: string | null; _project_id: string }
        Returns: Json
      }
      restore_project_version: {
        Args: { _project_id: string; _version_id: string }
        Returns: undefined
      }
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
