import { createClient } from '@supabase/supabase-js';
import { Receiver } from '@upstash/qstash';
import { z } from 'zod';

import { Database } from '../lib/database.types';

interface TranscriptProcessingJob {
  transcriptId: string;
  content: string;
  title: string;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    // Only accept POST requests
    if (request.method !== 'POST') {
      return new Response('Method not allowed', { status: 405 });
    }

    try {
      // Read body once and reuse it
      const bodyText = await request.text();

      const receiver = new Receiver({
        currentSigningKey: env.QSTASH_CURRENT_SIGNING_KEY,
        nextSigningKey: env.QSTASH_NEXT_SIGNING_KEY,
      });

      try {
        await receiver.verify({
          signature: request.headers.get('upstash-signature') ?? '',
          body: bodyText,
        });
      } catch {
        return new Response('Unauthorized: Invalid signature', { status: 401 });
      }

      const body = JSON.parse(bodyText) as TranscriptProcessingJob;
      const { transcriptId, content, title } = body;

      // Validate required fields
      if (!transcriptId || !content) {
        return new Response(
          JSON.stringify({ error: 'Missing transcriptId or content' }),
          { status: 400 }
        );
      }

      // Initialize Supabase client
      const supabase = createClient<Database>(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );

      // Process transcript
      const processingResults = await processTranscript(env, content);

      // Save results to Supabase
      await saveResultsToSupabase(
        supabase,
        transcriptId,
        processingResults
      );

      return new Response(
        JSON.stringify({
          success: true,
          transcriptId,
          results: processingResults,
        }),
        { status: 200 }
      );
    } catch (error) {
      console.error('Worker error:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const errorStack = error instanceof Error ? error.stack : '';

      console.error('Full error:', { message: errorMessage, stack: errorStack });

      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
          details: errorStack,
        }),
        { status: 500 }
      );
    }
  },
} satisfies ExportedHandler<Env>;

// Process the transcript and extract notes, action items, and decisions
async function processTranscript(env: Env, content: string): Promise<ProcessingResults> {
  const [cleanedNotes, actionItems, decisions] = await Promise.all([
    cleanTranscript(env.AI, content),
    extractActionItems(env.AI, content),
    extractDecisions(env.AI, content),
  ]);

  return { cleanedNotes, actionItems, decisions };
}

// Remove filler words and clean up transcript
async function cleanTranscript(ai: Ai, content: string): Promise<string> {
  const fillerWords = [
    '\\bum\\b', '\\buh\\b', '\\blike\\b', '\\byou know\\b',
    '\\bbasically\\b', '\\bactually\\b', '\\bkind of\\b', '\\bsort of\\b',
    '\\bso\\b', '\\byeah\\b', '\\byep\\b', '\\bok\\b'
  ];

  let cleaned = content;

  // Remove filler words (case-insensitive)
  fillerWords.forEach(word => {
    const regex = new RegExp(word, 'gi');
    cleaned = cleaned.replace(regex, '');
  });

  // Clean up multiple spaces and line breaks
  cleaned = cleaned
    .replace(/\s{2,}/g, ' ')
    .replace(/\n{2,}/g, '\n')
    .trim();

  const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      {
        role: 'system',
        content:
          'You are a meeting notes assistant. Summarize the key points from the transcript into 3–7 concise bullet points. Output only the bullet points, no preamble.',
      },
      {
        role: 'user',
        content: `Transcript:\n${cleaned}`,
      },
    ],
  });

  return (response as { response: string }).response.trim();
}

const ActionItemSchema = z.object({
  action_items: z.array(
    z.object({
      description: z.string(),
      owner: z.string().nullable(),
      due_date: z.string().nullable(),
    })
  ),
});

// Extract action items from transcript
async function extractActionItems(ai: Ai, content: string): Promise<ActionItem[]> {
  const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      {
        role: 'system',
        content:
          'You extract action items from meeting transcripts. Output ONLY valid JSON with no extra text. Format: {"action_items":[{"description":"task description","owner":"person name or null","due_date":"YYYY-MM-DD or null"}]}',
      },
      {
        role: 'user',
        content: `Extract all action items from this transcript:\n${content}`,
      },
    ],
  });

  const raw = (response as { response: string }).response.trim();

  try {
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}') + 1;
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd));
    const validated = ActionItemSchema.parse(parsed);
    return validated.action_items.map(item => ({
      ...item,
      due_date: isValidISODate(item.due_date) ? item.due_date : null,
    }));
  } catch {
    return [];
  }
}

function isValidISODate(date: string | null):
boolean {
  if (!date) return false;
  const iso8601Regex = /^\d{4}-\d{2}-\d{2}$/;
  if (!iso8601Regex.test(date)) return false;
  const parsed = new Date(date + 'T00:00:00Z');
  return !isNaN(parsed.getTime());
}

const DecisionSchema = z.object({
  decisions: z.array(
    z.object({
      decision_text: z.string(),
      rationale: z.string().nullable(),
    })
  ),
});

// Extract decisions from transcript
async function extractDecisions(ai: Ai, content: string): Promise<Decision[]> {
  const response = await ai.run('@cf/meta/llama-3.1-8b-instruct', {
    messages: [
      {
        role: 'system',
        content:
          'You extract key decisions from meeting transcripts. Output ONLY valid JSON with no extra text. Format: {"decisions":[{"decision_text":"what was decided","rationale":"why or null"}]}',
      },
      {
        role: 'user',
        content: `Extract all key decisions from this transcript:\n${content}`,
      },
    ],
  });

  const raw = (response as { response: string }).response.trim();

  try {
    const jsonStart = raw.indexOf('{');
    const jsonEnd = raw.lastIndexOf('}') + 1;
    const parsed = JSON.parse(raw.slice(jsonStart, jsonEnd));
    const validated = DecisionSchema.parse(parsed);
    return validated.decisions;
  } catch {
    return [];
  }
}

// Save processing results to Supabase
async function saveResultsToSupabase(
  supabase: any,
  transcriptId: string,
  results: ProcessingResults
): Promise<void> {
  console.log(`Updating notes for transcriptId: ${transcriptId}`);
  const updatePayload = {
    cleaned_notes: results.cleanedNotes,
    status: 'completed',
    updated_at: new Date().toISOString(),
  };
  console.log(`Update payload:`, JSON.stringify(updatePayload));

  // Update notes record with cleaned transcript
  const { error: notesError, data: updateData } = await supabase
    .from('notes')
    .update(updatePayload)
    .eq('transcript_id', transcriptId);

  console.log(`Update response - error: ${notesError ? 'yes' : 'no'}, data:`, updateData);

  if (notesError) {
    console.error(`Supabase error updating notes:`, notesError);
    throw new Error(`Failed to update notes: ${notesError.message}`);
  }

  // Insert action items
  if (results.actionItems.length > 0) {
    const { error: actionItemsError } = await supabase
      .from('action_items')
      .insert(
        results.actionItems.map(item => ({
          transcript_id: transcriptId,
          description: item.description,
          owner: item.owner,
          due_date: item.due_date,
        }))
      );

    if (actionItemsError) {
      throw new Error(`Failed to insert action items: ${actionItemsError.message}`);
    }
  }

  // Insert decisions
  if (results.decisions.length > 0) {
    const { error: decisionsError } = await supabase
      .from('decisions')
      .insert(
        results.decisions.map(decision => ({
          transcript_id: transcriptId,
          decision_text: decision.decision_text,
          rationale: decision.rationale,
        }))
      );

    if (decisionsError) {
      throw new Error(`Failed to insert decisions: ${decisionsError.message}`);
    }
  }
}

// Types
interface Env {
  AI: Ai;
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  QSTASH_CURRENT_SIGNING_KEY: string;
  QSTASH_NEXT_SIGNING_KEY: string;
  ENVIRONMENT: string;
}

interface ActionItem {
  description: string;
  owner: string | null;
  due_date: string | null;
}

interface Decision {
  decision_text: string;
  rationale: string | null;
}

interface ProcessingResults {
  cleanedNotes: string;
  actionItems: ActionItem[];
  decisions: Decision[];
}
