import { supabase } from './supabase';

export async function saveTranscript(title: string, content: string) {
  const { data, error } = await supabase
    .from('transcripts')
    .insert([{ title, content }])
    .select()
    .single();

  if (error) throw error;
  return data;
}

export async function getTranscriptWithResults(transcriptId: string) {
  const { data: transcript, error: transcriptError } = await supabase
    .from('transcripts')
    .select('*')
    .eq('id', transcriptId)
    .single();

  if (transcriptError) throw transcriptError;

  const { data: notes } = await supabase
    .from('notes')
    .select('*')
    .eq('transcript_id', transcriptId)
    .single();

  const { data: actionItems } = await supabase
    .from('action_items')
    .select('*')
    .eq('transcript_id', transcriptId);

  const { data: decisions } = await supabase
    .from('decisions')
    .select('*')
    .eq('transcript_id', transcriptId);

  return {
    transcript,
    notes: notes || null,
    actionItems: actionItems || [],
    decisions: decisions || [],
  };
}

export async function getAllTranscripts() {
  const { data, error } = await supabase
    .from('transcripts')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw error;
  return data;
}
