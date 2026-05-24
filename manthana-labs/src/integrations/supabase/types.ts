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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      access_code_attempts: {
        Row: {
          attempted_at: string
          fingerprint: string | null
          id: string
          ip_address: string | null
          succeeded: boolean
          user_id: string | null
        }
        Insert: {
          attempted_at?: string
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          succeeded?: boolean
          user_id?: string | null
        }
        Update: {
          attempted_at?: string
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          succeeded?: boolean
          user_id?: string | null
        }
        Relationships: []
      }
      access_code_redemptions: {
        Row: {
          code_label: string
          fingerprint: string | null
          id: string
          ip_address: string | null
          redeemed_at: string
          user_email: string
          user_id: string
        }
        Insert: {
          code_label?: string
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          redeemed_at?: string
          user_email: string
          user_id: string
        }
        Update: {
          code_label?: string
          fingerprint?: string | null
          id?: string
          ip_address?: string | null
          redeemed_at?: string
          user_email?: string
          user_id?: string
        }
        Relationships: []
      }
      attestations: {
        Row: {
          accepted_at: string
          id: string
          ip_address: string | null
          user_agent: string | null
          user_id: string
          version: string
        }
        Insert: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id: string
          version: string
        }
        Update: {
          accepted_at?: string
          id?: string
          ip_address?: string | null
          user_agent?: string | null
          user_id?: string
          version?: string
        }
        Relationships: []
      }
      audit_log: {
        Row: {
          action: string
          actor_email: string | null
          created_at: string
          entity_id: string | null
          entity_type: string | null
          id: string
          ip_address: string | null
          metadata: Json | null
          user_agent: string | null
          user_id: string | null
        }
        Insert: {
          action: string
          actor_email?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Update: {
          action?: string
          actor_email?: string | null
          created_at?: string
          entity_id?: string | null
          entity_type?: string | null
          id?: string
          ip_address?: string | null
          metadata?: Json | null
          user_agent?: string | null
          user_id?: string | null
        }
        Relationships: []
      }
      camp_applications: {
        Row: {
          applicant_kind: Database["public"]["Enums"]["applicant_kind"]
          camp_dates: string | null
          city: string | null
          contact_email: string
          contact_name: string
          contact_phone: string | null
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          doctor_council_number: string | null
          expected_patients: number | null
          expected_scans_per_month: number | null
          id: string
          organisation_name: string
          purpose: string
          registration_number: string
          state: string | null
          status: Database["public"]["Enums"]["camp_application_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          applicant_kind: Database["public"]["Enums"]["applicant_kind"]
          camp_dates?: string | null
          city?: string | null
          contact_email: string
          contact_name: string
          contact_phone?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          doctor_council_number?: string | null
          expected_patients?: number | null
          expected_scans_per_month?: number | null
          id?: string
          organisation_name: string
          purpose: string
          registration_number: string
          state?: string | null
          status?: Database["public"]["Enums"]["camp_application_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          applicant_kind?: Database["public"]["Enums"]["applicant_kind"]
          camp_dates?: string | null
          city?: string | null
          contact_email?: string
          contact_name?: string
          contact_phone?: string | null
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          doctor_council_number?: string | null
          expected_patients?: number | null
          expected_scans_per_month?: number | null
          id?: string
          organisation_name?: string
          purpose?: string
          registration_number?: string
          state?: string | null
          status?: Database["public"]["Enums"]["camp_application_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      chat_quotas: {
        Row: {
          created_at: string
          id: string
          messages_used: number
          study_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          messages_used?: number
          study_id: string
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          messages_used?: number
          study_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      council_verifications: {
        Row: {
          council_body: string
          created_at: string
          full_name_submitted: string
          id: string
          registration_number: string
          registration_year: number | null
          rejection_reason: string | null
          reviewed_at: string | null
          reviewed_by: string | null
          state: string | null
          status: Database["public"]["Enums"]["verification_status"]
          system: Database["public"]["Enums"]["medical_system"]
          updated_at: string
          user_id: string
          verification_payload: Json | null
          verification_source: string | null
        }
        Insert: {
          council_body: string
          created_at?: string
          full_name_submitted: string
          id?: string
          registration_number: string
          registration_year?: number | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          system: Database["public"]["Enums"]["medical_system"]
          updated_at?: string
          user_id: string
          verification_payload?: Json | null
          verification_source?: string | null
        }
        Update: {
          council_body?: string
          created_at?: string
          full_name_submitted?: string
          id?: string
          registration_number?: string
          registration_year?: number | null
          rejection_reason?: string | null
          reviewed_at?: string | null
          reviewed_by?: string | null
          state?: string | null
          status?: Database["public"]["Enums"]["verification_status"]
          system?: Database["public"]["Enums"]["medical_system"]
          updated_at?: string
          user_id?: string
          verification_payload?: Json | null
          verification_source?: string | null
        }
        Relationships: []
      }
      dicom_assets: {
        Row: {
          body_part: string | null
          cols: number | null
          created_at: string
          dcm_path: string
          frame_count: number
          id: string
          modality: string | null
          phi_scrubbed: boolean
          preview_png_path: string | null
          rows: number | null
          series_instance_uid: string | null
          sop_class_uid: string | null
          sop_instance_uid: string
          study_id: string
          study_instance_uid: string | null
          user_id: string
        }
        Insert: {
          body_part?: string | null
          cols?: number | null
          created_at?: string
          dcm_path: string
          frame_count?: number
          id?: string
          modality?: string | null
          phi_scrubbed?: boolean
          preview_png_path?: string | null
          rows?: number | null
          series_instance_uid?: string | null
          sop_class_uid?: string | null
          sop_instance_uid: string
          study_id: string
          study_instance_uid?: string | null
          user_id: string
        }
        Update: {
          body_part?: string | null
          cols?: number | null
          created_at?: string
          dcm_path?: string
          frame_count?: number
          id?: string
          modality?: string | null
          phi_scrubbed?: boolean
          preview_png_path?: string | null
          rows?: number | null
          series_instance_uid?: string | null
          sop_class_uid?: string | null
          sop_instance_uid?: string
          study_id?: string
          study_instance_uid?: string | null
          user_id?: string
        }
        Relationships: []
      }
      dicom_exports: {
        Row: {
          connection_id: string | null
          created_at: string
          error: string | null
          id: string
          kind: string
          response_body_excerpt: string | null
          response_code: number | null
          sop_instance_uid: string | null
          status: string
          study_id: string
          target_url: string | null
          user_id: string
        }
        Insert: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind: string
          response_body_excerpt?: string | null
          response_code?: number | null
          sop_instance_uid?: string | null
          status: string
          study_id: string
          target_url?: string | null
          user_id: string
        }
        Update: {
          connection_id?: string | null
          created_at?: string
          error?: string | null
          id?: string
          kind?: string
          response_body_excerpt?: string | null
          response_code?: number | null
          sop_instance_uid?: string | null
          status?: string
          study_id?: string
          target_url?: string | null
          user_id?: string
        }
        Relationships: []
      }
      doctor_branding: {
        Row: {
          accent_color: string | null
          address: string | null
          clinic_name: string | null
          created_at: string
          credentials: string | null
          doctor_name: string | null
          email: string | null
          enabled: boolean
          footer_disclaimer: string | null
          id: string
          logo_url: string | null
          phone: string | null
          signature_url: string | null
          template: string
          updated_at: string
          user_id: string
        }
        Insert: {
          accent_color?: string | null
          address?: string | null
          clinic_name?: string | null
          created_at?: string
          credentials?: string | null
          doctor_name?: string | null
          email?: string | null
          enabled?: boolean
          footer_disclaimer?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          signature_url?: string | null
          template?: string
          updated_at?: string
          user_id: string
        }
        Update: {
          accent_color?: string | null
          address?: string | null
          clinic_name?: string | null
          created_at?: string
          credentials?: string | null
          doctor_name?: string | null
          email?: string | null
          enabled?: boolean
          footer_disclaimer?: string | null
          id?: string
          logo_url?: string | null
          phone?: string | null
          signature_url?: string | null
          template?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      email_send_log: {
        Row: {
          created_at: string
          error_message: string | null
          id: string
          message_id: string | null
          metadata: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Insert: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email: string
          status: string
          template_name: string
        }
        Update: {
          created_at?: string
          error_message?: string | null
          id?: string
          message_id?: string | null
          metadata?: Json | null
          recipient_email?: string
          status?: string
          template_name?: string
        }
        Relationships: []
      }
      email_send_state: {
        Row: {
          auth_email_ttl_minutes: number
          batch_size: number
          id: number
          retry_after_until: string | null
          send_delay_ms: number
          transactional_email_ttl_minutes: number
          updated_at: string
        }
        Insert: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Update: {
          auth_email_ttl_minutes?: number
          batch_size?: number
          id?: number
          retry_after_until?: string | null
          send_delay_ms?: number
          transactional_email_ttl_minutes?: number
          updated_at?: string
        }
        Relationships: []
      }
      email_unsubscribe_tokens: {
        Row: {
          created_at: string
          email: string
          id: string
          token: string
          used_at: string | null
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          token: string
          used_at?: string | null
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          token?: string
          used_at?: string | null
        }
        Relationships: []
      }
      emergency_scan_requests: {
        Row: {
          created_at: string
          decided_at: string | null
          decided_by: string | null
          decision_note: string | null
          id: string
          patient_ref_short: string | null
          reason: string
          status: Database["public"]["Enums"]["emergency_request_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          patient_ref_short?: string | null
          reason: string
          status?: Database["public"]["Enums"]["emergency_request_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          decided_at?: string | null
          decided_by?: string | null
          decision_note?: string | null
          id?: string
          patient_ref_short?: string | null
          reason?: string
          status?: Database["public"]["Enums"]["emergency_request_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      findings: {
        Row: {
          anatomical_region: string | null
          confidence: number
          created_at: string
          description: string | null
          differentials: Json | null
          display_order: number
          escalation_acknowledged: boolean
          escalation_acknowledged_at: string | null
          escalation_acknowledged_by: string | null
          escalation_callback_target: string | null
          escalation_communication_note: string | null
          icd10_code: string | null
          icd10_label: string | null
          id: string
          impression: string | null
          observation: string | null
          recommendation: string | null
          region: string | null
          severity: Database["public"]["Enums"]["severity"]
          snomed_code: string | null
          snomed_label: string | null
          study_id: string
          title: string
          updated_at: string
          urgency: Database["public"]["Enums"]["urgency"] | null
          user_id: string
        }
        Insert: {
          anatomical_region?: string | null
          confidence: number
          created_at?: string
          description?: string | null
          differentials?: Json | null
          display_order?: number
          escalation_acknowledged?: boolean
          escalation_acknowledged_at?: string | null
          escalation_acknowledged_by?: string | null
          escalation_callback_target?: string | null
          escalation_communication_note?: string | null
          icd10_code?: string | null
          icd10_label?: string | null
          id?: string
          impression?: string | null
          observation?: string | null
          recommendation?: string | null
          region?: string | null
          severity: Database["public"]["Enums"]["severity"]
          snomed_code?: string | null
          snomed_label?: string | null
          study_id: string
          title: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["urgency"] | null
          user_id: string
        }
        Update: {
          anatomical_region?: string | null
          confidence?: number
          created_at?: string
          description?: string | null
          differentials?: Json | null
          display_order?: number
          escalation_acknowledged?: boolean
          escalation_acknowledged_at?: string | null
          escalation_acknowledged_by?: string | null
          escalation_callback_target?: string | null
          escalation_communication_note?: string | null
          icd10_code?: string | null
          icd10_label?: string | null
          id?: string
          impression?: string | null
          observation?: string | null
          recommendation?: string | null
          region?: string | null
          severity?: Database["public"]["Enums"]["severity"]
          snomed_code?: string | null
          snomed_label?: string | null
          study_id?: string
          title?: string
          updated_at?: string
          urgency?: Database["public"]["Enums"]["urgency"] | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "findings_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      hospital_connections: {
        Row: {
          ae_title: string | null
          created_at: string
          enabled: boolean
          id: string
          inbound_token: string
          last_push_at: string | null
          name: string
          pacs_auth_header: string | null
          pacs_open_url_template: string | null
          pacs_qido_url: string | null
          pacs_stow_url: string | null
          ris_auth_header: string | null
          ris_fhir_base_url: string | null
          updated_at: string
          user_id: string
          verified_at: string | null
        }
        Insert: {
          ae_title?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          inbound_token?: string
          last_push_at?: string | null
          name: string
          pacs_auth_header?: string | null
          pacs_open_url_template?: string | null
          pacs_qido_url?: string | null
          pacs_stow_url?: string | null
          ris_auth_header?: string | null
          ris_fhir_base_url?: string | null
          updated_at?: string
          user_id: string
          verified_at?: string | null
        }
        Update: {
          ae_title?: string | null
          created_at?: string
          enabled?: boolean
          id?: string
          inbound_token?: string
          last_push_at?: string | null
          name?: string
          pacs_auth_header?: string | null
          pacs_open_url_template?: string | null
          pacs_qido_url?: string | null
          pacs_stow_url?: string | null
          ris_auth_header?: string | null
          ris_fhir_base_url?: string | null
          updated_at?: string
          user_id?: string
          verified_at?: string | null
        }
        Relationships: []
      }
      medical_codes: {
        Row: {
          category: string | null
          code: string
          id: string
          label: string
          search_tsv: unknown
          system: string
        }
        Insert: {
          category?: string | null
          code: string
          id?: string
          label: string
          search_tsv?: unknown
          system: string
        }
        Update: {
          category?: string | null
          code?: string
          id?: string
          label?: string
          search_tsv?: unknown
          system?: string
        }
        Relationships: []
      }
      mfa_enrollments: {
        Row: {
          created_at: string
          enrolled_at: string
          factor_id: string | null
          last_verified_at: string | null
          recovery_codes_generated: boolean
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          enrolled_at?: string
          factor_id?: string | null
          last_verified_at?: string | null
          recovery_codes_generated?: boolean
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          enrolled_at?: string
          factor_id?: string | null
          last_verified_at?: string | null
          recovery_codes_generated?: boolean
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      model_feedback: {
        Row: {
          detail: string
          doctor_name: string | null
          finding_id: string | null
          id: string
          reason: string
          reported_at: string
          study_id: string | null
          user_id: string
        }
        Insert: {
          detail: string
          doctor_name?: string | null
          finding_id?: string | null
          id?: string
          reason: string
          reported_at?: string
          study_id?: string | null
          user_id: string
        }
        Update: {
          detail?: string
          doctor_name?: string | null
          finding_id?: string | null
          id?: string
          reason?: string
          reported_at?: string
          study_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "model_feedback_finding_id_fkey"
            columns: ["finding_id"]
            isOneToOne: false
            referencedRelation: "findings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "model_feedback_study_id_fkey"
            columns: ["study_id"]
            isOneToOne: false
            referencedRelation: "studies"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          council_body: string | null
          council_number: string | null
          council_state: string | null
          council_year: number | null
          created_at: string
          email: string
          full_name: string
          id: string
          professional_role:
            | Database["public"]["Enums"]["professional_role"]
            | null
          specialty: string | null
          system: Database["public"]["Enums"]["medical_system"] | null
          updated_at: string
          verification_status: Database["public"]["Enums"]["verification_status"]
        }
        Insert: {
          council_body?: string | null
          council_number?: string | null
          council_state?: string | null
          council_year?: number | null
          created_at?: string
          email: string
          full_name: string
          id: string
          professional_role?:
            | Database["public"]["Enums"]["professional_role"]
            | null
          specialty?: string | null
          system?: Database["public"]["Enums"]["medical_system"] | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Update: {
          council_body?: string | null
          council_number?: string | null
          council_state?: string | null
          council_year?: number | null
          created_at?: string
          email?: string
          full_name?: string
          id?: string
          professional_role?:
            | Database["public"]["Enums"]["professional_role"]
            | null
          specialty?: string | null
          system?: Database["public"]["Enums"]["medical_system"] | null
          updated_at?: string
          verification_status?: Database["public"]["Enums"]["verification_status"]
        }
        Relationships: []
      }
      studies: {
        Row: {
          accession_number: string | null
          catalog: Database["public"]["Enums"]["catalog"]
          compare_modality_slug: string | null
          compare_synthesis: Json | null
          compare_timepoints: Json | null
          created_at: string
          critical_acknowledged_at: string | null
          critical_acknowledged_by: string | null
          critical_callback_target: string | null
          detected_modality_slug: string | null
          detection_confidence: number | null
          dynamic_questions: Json | null
          edited_at: string | null
          edited_by_doctor: boolean
          error_message: string | null
          foundation_model_caveat: string | null
          id: string
          images_count: number
          information_gaps: Json | null
          is_compare_mode: boolean
          is_dicom: boolean
          is_live_capture: boolean
          is_multi_modality: boolean
          live_capture_kind: string
          live_capture_pass: number
          live_capture_video_path: string | null
          live_follow_up_answers: Json | null
          live_follow_up_questions: Json | null
          live_holoscan_measurements: Json | null
          live_photo_paths: Json
          modal_job_id: string | null
          modality_category: string
          modality_label: string
          modality_slug: string
          multi_modality_combined_qa: Json | null
          multi_modality_legs: Json | null
          multi_modality_synthesis: Json | null
          narrative: string | null
          original_report: Json | null
          overall_confidence: number | null
          patient_ref_short: string | null
          patient_summary: string | null
          progress: Json
          questionnaire_answers: Json | null
          referring_physician: string | null
          report: Json | null
          report_hash: string | null
          report_locked: boolean
          report_signature: string | null
          review_confirmed_at: string | null
          reviewing_doctor_note: string | null
          status: Database["public"]["Enums"]["study_status"]
          storage_paths: Json
          study_instance_uid: string | null
          tier: Database["public"]["Enums"]["tier"]
          updated_at: string
          user_id: string
          videos_count: number
          web_citations: Json | null
        }
        Insert: {
          accession_number?: string | null
          catalog: Database["public"]["Enums"]["catalog"]
          compare_modality_slug?: string | null
          compare_synthesis?: Json | null
          compare_timepoints?: Json | null
          created_at?: string
          critical_acknowledged_at?: string | null
          critical_acknowledged_by?: string | null
          critical_callback_target?: string | null
          detected_modality_slug?: string | null
          detection_confidence?: number | null
          dynamic_questions?: Json | null
          edited_at?: string | null
          edited_by_doctor?: boolean
          error_message?: string | null
          foundation_model_caveat?: string | null
          id?: string
          images_count?: number
          information_gaps?: Json | null
          is_compare_mode?: boolean
          is_dicom?: boolean
          is_live_capture?: boolean
          is_multi_modality?: boolean
          live_capture_kind?: string
          live_capture_pass?: number
          live_capture_video_path?: string | null
          live_follow_up_answers?: Json | null
          live_follow_up_questions?: Json | null
          live_holoscan_measurements?: Json | null
          live_photo_paths?: Json
          modal_job_id?: string | null
          modality_category: string
          modality_label: string
          modality_slug: string
          multi_modality_combined_qa?: Json | null
          multi_modality_legs?: Json | null
          multi_modality_synthesis?: Json | null
          narrative?: string | null
          original_report?: Json | null
          overall_confidence?: number | null
          patient_ref_short?: string | null
          patient_summary?: string | null
          progress?: Json
          questionnaire_answers?: Json | null
          referring_physician?: string | null
          report?: Json | null
          report_hash?: string | null
          report_locked?: boolean
          report_signature?: string | null
          review_confirmed_at?: string | null
          reviewing_doctor_note?: string | null
          status?: Database["public"]["Enums"]["study_status"]
          storage_paths?: Json
          study_instance_uid?: string | null
          tier: Database["public"]["Enums"]["tier"]
          updated_at?: string
          user_id: string
          videos_count?: number
          web_citations?: Json | null
        }
        Update: {
          accession_number?: string | null
          catalog?: Database["public"]["Enums"]["catalog"]
          compare_modality_slug?: string | null
          compare_synthesis?: Json | null
          compare_timepoints?: Json | null
          created_at?: string
          critical_acknowledged_at?: string | null
          critical_acknowledged_by?: string | null
          critical_callback_target?: string | null
          detected_modality_slug?: string | null
          detection_confidence?: number | null
          dynamic_questions?: Json | null
          edited_at?: string | null
          edited_by_doctor?: boolean
          error_message?: string | null
          foundation_model_caveat?: string | null
          id?: string
          images_count?: number
          information_gaps?: Json | null
          is_compare_mode?: boolean
          is_dicom?: boolean
          is_live_capture?: boolean
          is_multi_modality?: boolean
          live_capture_kind?: string
          live_capture_pass?: number
          live_capture_video_path?: string | null
          live_follow_up_answers?: Json | null
          live_follow_up_questions?: Json | null
          live_holoscan_measurements?: Json | null
          live_photo_paths?: Json
          modal_job_id?: string | null
          modality_category?: string
          modality_label?: string
          modality_slug?: string
          multi_modality_combined_qa?: Json | null
          multi_modality_legs?: Json | null
          multi_modality_synthesis?: Json | null
          narrative?: string | null
          original_report?: Json | null
          overall_confidence?: number | null
          patient_ref_short?: string | null
          patient_summary?: string | null
          progress?: Json
          questionnaire_answers?: Json | null
          referring_physician?: string | null
          report?: Json | null
          report_hash?: string | null
          report_locked?: boolean
          report_signature?: string | null
          review_confirmed_at?: string | null
          reviewing_doctor_note?: string | null
          status?: Database["public"]["Enums"]["study_status"]
          storage_paths?: Json
          study_instance_uid?: string | null
          tier?: Database["public"]["Enums"]["tier"]
          updated_at?: string
          user_id?: string
          videos_count?: number
          web_citations?: Json | null
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          chat_msgs_per_scan: number
          code: Database["public"]["Enums"]["plan_code"]
          context_window_msgs: number
          created_at: string
          daily_scan_addon: number
          description: string | null
          display_order: number
          emergency_pool: number
          features: Json
          id: string
          is_public: boolean
          max_tokens_per_reply: number
          monthly_scan_quota: number
          name: string
          price_inr_monthly: number
          priority_queue: boolean
          updated_at: string
        }
        Insert: {
          chat_msgs_per_scan?: number
          code: Database["public"]["Enums"]["plan_code"]
          context_window_msgs?: number
          created_at?: string
          daily_scan_addon?: number
          description?: string | null
          display_order?: number
          emergency_pool?: number
          features?: Json
          id?: string
          is_public?: boolean
          max_tokens_per_reply?: number
          monthly_scan_quota?: number
          name: string
          price_inr_monthly?: number
          priority_queue?: boolean
          updated_at?: string
        }
        Update: {
          chat_msgs_per_scan?: number
          code?: Database["public"]["Enums"]["plan_code"]
          context_window_msgs?: number
          created_at?: string
          daily_scan_addon?: number
          description?: string | null
          display_order?: number
          emergency_pool?: number
          features?: Json
          id?: string
          is_public?: boolean
          max_tokens_per_reply?: number
          monthly_scan_quota?: number
          name?: string
          price_inr_monthly?: number
          priority_queue?: boolean
          updated_at?: string
        }
        Relationships: []
      }
      suppressed_emails: {
        Row: {
          created_at: string
          email: string
          id: string
          metadata: Json | null
          reason: string
        }
        Insert: {
          created_at?: string
          email: string
          id?: string
          metadata?: Json | null
          reason: string
        }
        Update: {
          created_at?: string
          email?: string
          id?: string
          metadata?: Json | null
          reason?: string
        }
        Relationships: []
      }
      usage_counters: {
        Row: {
          created_at: string
          day_marker: string
          emergency_requests_pending: number
          free_emergency_auto_grants: number
          free_emergency_used: number
          period_start: string
          scans_this_month: number
          scans_today: number
          updated_at: string
          user_id: string
        }
        Insert: {
          created_at?: string
          day_marker?: string
          emergency_requests_pending?: number
          free_emergency_auto_grants?: number
          free_emergency_used?: number
          period_start?: string
          scans_this_month?: number
          scans_today?: number
          updated_at?: string
          user_id: string
        }
        Update: {
          created_at?: string
          day_marker?: string
          emergency_requests_pending?: number
          free_emergency_auto_grants?: number
          free_emergency_used?: number
          period_start?: string
          scans_this_month?: number
          scans_today?: number
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
      user_roles: {
        Row: {
          created_at: string
          id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: []
      }
      user_subscriptions: {
        Row: {
          cancel_at_period_end: boolean
          cancelled_at: string | null
          created_at: string
          current_period_end: string
          current_period_start: string
          id: string
          plan_code: Database["public"]["Enums"]["plan_code"]
          razorpay_customer_id: string | null
          razorpay_mode: string | null
          razorpay_subscription_id: string | null
          status: Database["public"]["Enums"]["subscription_status"]
          updated_at: string
          user_id: string
        }
        Insert: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_code?: Database["public"]["Enums"]["plan_code"]
          razorpay_customer_id?: string | null
          razorpay_mode?: string | null
          razorpay_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id: string
        }
        Update: {
          cancel_at_period_end?: boolean
          cancelled_at?: string | null
          created_at?: string
          current_period_end?: string
          current_period_start?: string
          id?: string
          plan_code?: Database["public"]["Enums"]["plan_code"]
          razorpay_customer_id?: string | null
          razorpay_mode?: string | null
          razorpay_subscription_id?: string | null
          status?: Database["public"]["Enums"]["subscription_status"]
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      access_code_seats_used: { Args: never; Returns: number }
      delete_email: {
        Args: { message_id: number; queue_name: string }
        Returns: boolean
      }
      enqueue_email: {
        Args: { payload: Json; queue_name: string }
        Returns: number
      }
      has_role: {
        Args: {
          _role: Database["public"]["Enums"]["app_role"]
          _user_id: string
        }
        Returns: boolean
      }
      move_to_dlq: {
        Args: {
          dlq_name: string
          message_id: number
          payload: Json
          source_queue: string
        }
        Returns: number
      }
      read_email_batch: {
        Args: { batch_size: number; queue_name: string; vt: number }
        Returns: {
          message: Json
          msg_id: number
          read_ct: number
        }[]
      }
    }
    Enums: {
      app_role: "admin" | "clinician"
      applicant_kind: "clinic" | "institution"
      camp_application_status:
        | "submitted"
        | "in_review"
        | "approved"
        | "rejected"
      catalog: "nvidia_backed" | "research_assisted" | "hybrid_nvidia_quaasx108"
      emergency_request_status:
        | "auto_granted"
        | "pending_review"
        | "approved"
        | "rejected"
      medical_system:
        | "allopathy"
        | "ayurveda"
        | "homeopathy"
        | "siddha"
        | "unani"
        | "dental"
      plan_code: "free" | "pro" | "pro_plus" | "enterprise"
      professional_role:
        | "radiologist"
        | "hospital"
        | "nursing_home"
        | "clinician_general"
        | "other"
      severity: "low" | "medium" | "high" | "critical"
      study_status:
        | "draft"
        | "uploading"
        | "questionnaire"
        | "analyzing"
        | "awaiting_review"
        | "delivered"
        | "error"
      subscription_status: "active" | "past_due" | "cancelled" | "pending"
      tier: "A" | "B" | "C" | "H"
      urgency: "routine" | "urgent" | "stat"
      verification_status: "pending" | "verified" | "rejected" | "manual_review"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
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
      app_role: ["admin", "clinician"],
      applicant_kind: ["clinic", "institution"],
      camp_application_status: [
        "submitted",
        "in_review",
        "approved",
        "rejected",
      ],
      catalog: [
        "nvidia_backed",
        "research_assisted",
        "hybrid_nvidia_quaasx108",
      ],
      emergency_request_status: [
        "auto_granted",
        "pending_review",
        "approved",
        "rejected",
      ],
      medical_system: [
        "allopathy",
        "ayurveda",
        "homeopathy",
        "siddha",
        "unani",
        "dental",
      ],
      plan_code: ["free", "pro", "pro_plus", "enterprise"],
      professional_role: [
        "radiologist",
        "hospital",
        "nursing_home",
        "clinician_general",
        "other",
      ],
      severity: ["low", "medium", "high", "critical"],
      study_status: [
        "draft",
        "uploading",
        "questionnaire",
        "analyzing",
        "awaiting_review",
        "delivered",
        "error",
      ],
      subscription_status: ["active", "past_due", "cancelled", "pending"],
      tier: ["A", "B", "C", "H"],
      urgency: ["routine", "urgent", "stat"],
      verification_status: ["pending", "verified", "rejected", "manual_review"],
    },
  },
} as const
