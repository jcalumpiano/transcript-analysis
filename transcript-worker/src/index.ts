import { createClient } from '@supabase/supabase-js';
import { Receiver } from '@upstash/qstash';
import { url, z } from 'zod';
import { DurableObject } from 'cloudflare:workers';
import { Database } from '../lib/database.types';

interface TranscriptProcessingJob {
  transcriptId: string;
  content: string;
  title: string;
}

function getStateStub(env: Env, transcriptId: string) {
  const id = env.TRANSCRIPT_STATE.idFromName(transcriptId);
  return env.TRANSCRIPT_STATE.get(id);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    // New: status polling endpoint for the frontend
    if (request.method === 'GET' && url.pathname.startsWith('/status/')) {
      const transcriptId = url.pathname.replace('/status/', '');
      if (!transcriptId) return new Response('Missing transcript ID', { status: 400 });
      const stub = getStateStub(env, transcriptId);
      return stub.fetch(new Request('https://internal/state'));
    }

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

      // Mark as processing
      const stub = getStateStub(env, transcriptId);
      await stub.fetch(new Request('https://internal/state', {
        method: 'PUT',
        body: JSON.stringify({ status: 'processing' }),
      }));

      // Initialize Supabase client
      const supabase = createClient<Database>(
        env.SUPABASE_URL,
        env.SUPABASE_SERVICE_ROLE_KEY
      );

      try {
        const processingResults = await processTranscript(env, content);
        await saveResultsToSupabase(supabase, transcriptId, processingResults);

        // Mark as complete
        await stub.fetch(new Request('https://internal/state', {
          method: 'PUT',
          body: JSON.stringify({ status: 'complete' }),
        }));

        return Response.json({ success: true, transcriptId, results: processingResults });
      } catch (processingError) {
        const errorMessage = processingError instanceof Error
          ? processingError.message
          : 'Unknown error';

        // Mark as error
        await stub.fetch(new Request('https://internal/state', {
          method: 'PUT',
          body: JSON.stringify({ status: 'error', error: errorMessage }),
        }));

        throw processingError;
      }

      // // Process transcript
      // const processingResults = await processTranscript(env, content);

      // // Save results to Supabase
      // await saveResultsToSupabase(
      //   supabase,
      //   transcriptId,
      //   processingResults
      // );

      // return new Response(
      //   JSON.stringify({
      //     success: true,
      //     transcriptId,
      //     results: processingResults,
      //   }),
      //   { status: 200 }
      // );
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

  const result = (response as { response: string }).response?.trim();
  if (!result) throw new Error('AI returned empty response for cleanTranscript');
  return result;
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
          'You extract key decisions from meeting transcripts. Output ONLY valid JSON with no extra text. For rationale, infer the reason from context even if not explicitly stated — only use null if there is absolutely no contextual clue. Format: {"decisions":[{"decision_text":"what was decided","rationale":"why it was decided or context behind it"}]}',
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
  const { error: notesError, count } = await supabase
    .from('notes')
    .update(updatePayload)
    .eq('transcript_id', transcriptId)
    .select('id', { count: 'exact', head: true });

  console.log(`Update response - error: ${notesError ? notesError.message : 'none'}, rows matched: ${count}`);

  if (notesError) {
    console.error(`Supabase error updating notes:`, notesError);
    throw new Error(`Failed to update notes: ${notesError.message}`);
  }

  if (count === 0) {
    throw new Error(`No notes row found for transcript_id=${transcriptId} — cleaned_notes not saved`);
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

export class TranscriptState extends DurableObject<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === 'GET' && url.pathname === '/state') {
      const status = (await this.ctx.storage.get<string>('status')) ?? 'pending';
      const error = (await this.ctx.storage.get<string>('error')) ?? null;
      const updatedAt = (await this.ctx.storage.get<string>('updatedAt')) ?? null;
      console.log(`[TranscriptState] GET /state → status=${status}`);
      return Response.json({ status, error, updatedAt });
    }

    if (request.method === 'PUT' && url.pathname === '/state') {
      const { status, error } = await request.json<{ status: string; error?: string }>();
      console.log(`[TranscriptState] PUT /state → status=${status}${error ? ` error=${error}` : ''}`);
      await this.ctx.storage.put('status', status);
      await this.ctx.storage.put('updatedAt', new Date().toISOString());
      if (error) {
        await this.ctx.storage.put('error', error);
      }
      return new Response('ok');
    }

    return new Response('not found', { status: 404 });
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
  TRANSCRIPT_STATE: DurableObjectNamespace<TranscriptState>;
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
