export type Database = {
  public: {
    Tables: {
      transcripts: {
        Row: {
          id: string;
          title: string | null;
          content: string;
          created_at: string;
        };
        Insert: {
          id?: string;
          title?: string | null;
          content: string;
          created_at?: string;
        };
        Update: {
          id?: string;
          title?: string | null;
          content?: string;
          created_at?: string;
        };
      };
      notes: {
        Row: {
          id: string;
          transcript_id: string;
          cleaned_notes: string | null;
          status: 'processing' | 'completed' | 'failed';
          error_message: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          transcript_id: string;
          cleaned_notes?: string | null;
          status?: 'processing' | 'completed' | 'failed';
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          transcript_id?: string;
          cleaned_notes?: string | null;
          status?: 'processing' | 'completed' | 'failed';
          error_message?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      action_items: {
        Row: {
          id: string;
          transcript_id: string;
          description: string;
          owner: string | null;
          due_date: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          transcript_id: string;
          description: string;
          owner?: string | null;
          due_date?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          transcript_id?: string;
          description?: string;
          owner?: string | null;
          due_date?: string | null;
          created_at?: string;
        };
      };
      decisions: {
        Row: {
          id: string;
          transcript_id: string;
          decision_text: string;
          rationale: string | null;
          created_at: string;
        };
        Insert: {
          id?: string;
          transcript_id: string;
          decision_text: string;
          rationale?: string | null;
          created_at?: string;
        };
        Update: {
          id?: string;
          transcript_id?: string;
          decision_text?: string;
          rationale?: string | null;
          created_at?: string;
        };
      };
    };
    Views: {};
    Functions: {};
    Enums: {};
  };
};
