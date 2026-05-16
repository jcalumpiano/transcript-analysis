import { createClient } from '@supabase/supabase-js';
import { verifySignature } from '@upstash/qstash/nextjs';
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

      // Verify QStash signature for security
      const isValid = await verifySignature({
        signature: request.headers.get('upstash-signature') || '',
        body: bodyText,
        secret: env.QSTASH_CURRENT_SIGNING_KEY,
      });

      if (!isValid) {
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
      const processingResults = await processTranscript(content);

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

      // Try to update the notes record with error status
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      return new Response(
        JSON.stringify({
          success: false,
          error: errorMessage,
        }),
        { status: 500 }
      );
    }
  },
} satisfies ExportedHandler<Env>;

// Process the transcript and extract notes, action items, and decisions
async function processTranscript(content: string): Promise<ProcessingResults> {
  const cleanedNotes = cleanTranscript(content);
  const actionItems = extractActionItems(content);
  const decisions = extractDecisions(content);

  return {
    cleanedNotes,
    actionItems,
    decisions,
  };
}

// Remove filler words and clean up transcript
function cleanTranscript(content: string): string {
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

  return cleaned;
}

// Extract action items from transcript
function extractActionItems(content: string): ActionItem[] {
  const actionItems: ActionItem[] = [];

  // Patterns for action items:
  // "John will do X by Friday"
  // "Sarah: I'll handle X"
  // "Mike needs to X"
  const patterns = [
    /(\w+)\s+will\s+(.+?)(?:by|until|before)\s+(.+?)(?:\.|,|$)/gi,
    /(\w+):\s+(?:I'll|I will|I'm going to)\s+(.+?)(?:\.|,|$)/gi,
    /(\w+)\s+(?:needs to|should|must)\s+(.+?)(?:by|until)?\s+(.+?)(?:\.|,|$)/gi,
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const owner = match[1];
      const description = match[2]?.trim() || match[2];
      const dueDate = match[3]?.trim() || null;

      if (description && description.length > 3) {
        actionItems.push({
          description: description.toLowerCase(),
          owner: owner.toLowerCase(),
          due_date: parseDueDate(dueDate),
        });
      }
    }
  });

  // Remove duplicates
  return Array.from(new Map(
    actionItems.map(item => [item.description, item])
  ).values());
}

// Extract decisions from transcript
function extractDecisions(content: string): Decision[] {
  const decisions: Decision[] = [];

  // Patterns for decisions:
  // "We decided to X"
  // "We're going with X"
  // "The decision is X"
  // "We'll use X"
  const patterns = [
    /(?:we\s+)?(?:decided|decided on|will go with|chose|selected|agreed on)\s+(.+?)(?:\.|,|and|so)/gi,
    /(?:the\s+)?decision\s+(?:is|was)\s+(.+?)(?:\.|,|$)/gi,
    /(?:we\s+)?(?:will use|will implement|will adopt)\s+(.+?)(?:\.|,|$)/gi,
  ];

  patterns.forEach(pattern => {
    let match;
    while ((match = pattern.exec(content)) !== null) {
      const decisionText = match[1]?.trim();

      if (decisionText && decisionText.length > 5) {
        decisions.push({
          decision_text: decisionText.toLowerCase(),
          rationale: null,
        });
      }
    }
  });

  // Remove duplicates
  return Array.from(new Map(
    decisions.map(decision => [decision.decision_text, decision])
  ).values());
}

// Parse due dates from text (e.g., "Friday", "next week", "3 days")
function parseDueDate(dateStr: string | null): string | null {
  if (!dateStr) return null;

  const now = new Date();
  const dateStr_lower = dateStr.toLowerCase();

  // Map days to offsets
  const daysOfWeek: { [key: string]: number } = {
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
    sunday: 0,
  };

  // Check for day of week
  for (const [day, offset] of Object.entries(daysOfWeek)) {
    if (dateStr_lower.includes(day)) {
      const daysAhead = offset - now.getDay();
      const dueDate = new Date(now.setDate(now.getDate() + (daysAhead > 0 ? daysAhead : 7)));
      return dueDate.toISOString().split('T')[0];
    }
  }

  // Check for "next week" or "week"
  if (dateStr_lower.includes('week')) {
    const dueDate = new Date(now.setDate(now.getDate() + 7));
    return dueDate.toISOString().split('T')[0];
  }

  // Check for number of days
  const daysMatch = dateStr.match(/(\d+)\s+days?/i);
  if (daysMatch) {
    const days = parseInt(daysMatch[1]);
    const dueDate = new Date(now.setDate(now.getDate() + days));
    return dueDate.toISOString().split('T')[0];
  }

  return null;
}

// Save processing results to Supabase
async function saveResultsToSupabase(
  supabase: any,
  transcriptId: string,
  results: ProcessingResults
): Promise<void> {
  // Update notes record with cleaned transcript
  const { error: notesError } = await supabase
    .from('notes')
    .update({
      cleaned_notes: results.cleanedNotes,
      status: 'completed',
      updated_at: new Date().toISOString(),
    })
    .eq('transcript_id', transcriptId);

  if (notesError) throw new Error(`Failed to update notes: ${notesError.message}`);

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
  SUPABASE_URL: string;
  SUPABASE_SERVICE_ROLE_KEY: string;
  QSTASH_CURRENT_SIGNING_KEY: string;
  QSTASH_NEXT_SIGNING_KEY: string;
  ENVIRONMENT: string;
}

interface ActionItem {
  description: string;
  owner: string;
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
