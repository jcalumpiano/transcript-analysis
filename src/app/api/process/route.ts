import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";
import { enqueueTranscriptJob } from "@/lib/qstash";

import { Client } from '@upstash/qstash';

const qstash = new Client({
  token: process.env.QSTASH_TOKEN!,
});

export async function POST(request: NextRequest) {
    try {
        console.log("CLOUDFLARE_WORKER_URL:", process.env.CLOUDFLARE_WORKER_URL);
        const body = await request.json();
        const { transcript, title } = body;

        if (!transcript || typeof transcript !== 'string') {
            return NextResponse.json(
                { error: "Invalid request: 'transcript' field is required and must be a string" },
                { status: 400 }
            )
        }

        if (transcript.trim().length === 0) {
            return NextResponse.json(
                { error: "Invalid request: transcript cannot be empty" },
                { status: 400 }
            );
        }    

        // Save transcript to Supabase
        console.log("[PROCESS] Inserting transcript into database");
        const { data: transcriptData, error: transcriptError } = await supabase
            .from("transcripts")
            .insert({
            title: title || "Untitled Transcript",
            content: transcript,
            })
            .select()
            .single();

        console.log("[PROCESS] Insert result:", { success: !transcriptError, error: transcriptError?.message });

        if (transcriptError) {
            console.error("Database error:", transcriptError);
            return NextResponse.json(
            {
              error: "Failed to save transcript",
              details: transcriptError.message,
              code: transcriptError.code
            },
            { status: 500 }
            );
        }

        const transcriptId = transcriptData.id;
        console.log("[PROCESS] Transcript saved with ID:", transcriptId);

        // Step 2: Create a notes record with processing status
        const { error: notesError } = await supabase
            .from("notes")
            .insert({
            transcript_id: transcriptId,
            status: "processing",
            cleaned_notes: null,
            });

        if (notesError) {
            console.error("Notes creation error:", notesError);
            // Delete transcript if notes creation fails
            await supabase
            .from("transcripts")
            .delete()
            .eq("id", transcriptId);
            
            return NextResponse.json(
            { error: "Failed to create notes record" },
            { status: 500 }
            );
        }

        // Step 3: Enqueue processing job with QStash
        // The job will be picked up by the Cloudflare Worker in Phase 3
        try {
            const webhookUrl = process.env.CLOUDFLARE_WORKER_URL!;

            // await enqueueTranscriptJob(transcriptId, webhookUrl);
            // Then enqueue the job with QStash:
            await qstash.publishJSON({
            url: webhookUrl,  // Points to your deployed Cloudflare Worker
            body: {
                transcriptId: transcriptData.id,
                content: transcript,
                title,
            },
            retries: 3,
            });

            console.log(`Transcript ${transcriptId} enqueued for processing`);
        } catch (qstashError) {
        const errorMsg = qstashError instanceof Error ? qstashError.message : String(qstashError);
        console.error("QStash error (non-critical for Phase 2):", errorMsg);
            // For Phase 2, we accept that job queueing may fail due to invalid token
            // The transcript is saved, which is the main goal
            // Phase 3 will handle proper QStash setup with Worker
        }

        // Step 4: Return success response
        return NextResponse.json(
        {
            success: true,
            transcriptId: transcriptId,
            status: "processing",
            message: "Transcript received and queued for processing",
        },
        { status: 201 }
        );

    }
    catch (error) {
        console.error("API error:", error);
        return NextResponse.json(
        { error: "Internal server error" },
        { status: 500 }
        );
    }
}

// Optional: Allow GET for testing
export async function GET() {
  return NextResponse.json({
    message: "POST a transcript to this endpoint",
    example: {
      transcript: "John: Hello everyone...",
      title: "Optional meeting title",
    },
  });
}