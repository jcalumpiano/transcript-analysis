import { NextRequest, NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    console.log("[TRANSCRIPT_GET] Fetching transcript with ID:", id);

    // Validate ID format
    if (!id || typeof id !== "string") {
      return NextResponse.json(
        { error: "Invalid transcript ID" },
        { status: 400 }
      );
    }

    // Step 1: Fetch transcript
    const { data: transcript, error: transcriptError } = await supabase
      .from("transcripts")
      .select("*")
      .eq("id", id)
      .single();

    console.log("[TRANSCRIPT_GET] Transcript result:", { found: !!transcript, error: transcriptError?.message });

    if (transcriptError) {
      if (transcriptError.code === "PGRST116") {
        return NextResponse.json(
          { error: "Transcript not found" },
          { status: 404 }
        );
      }
      console.error("Transcript fetch error:", transcriptError);
      return NextResponse.json(
        { error: "Failed to fetch transcript" },
        { status: 500 }
      );
    }

    // Step 2: Fetch notes
    const { data: notes, error: notesError } = await supabase
      .from("notes")
      .select("*")
      .eq("transcript_id", id)
      .single();

    if (notesError && notesError.code !== "PGRST116") {
      console.error("Notes fetch error:", notesError);
    }

    // Step 3: Fetch action items
    const { data: actionItems, error: actionItemsError } = await supabase
      .from("action_items")
      .select("*")
      .eq("transcript_id", id)
      .order("created_at", { ascending: false });

    if (actionItemsError) {
      console.error("Action items fetch error:", actionItemsError);
    }

    // Step 4: Fetch decisions
    const { data: decisions, error: decisionsError } = await supabase
      .from("decisions")
      .select("*")
      .eq("transcript_id", id)
      .order("created_at", { ascending: false });

    if (decisionsError) {
      console.error("Decisions fetch error:", decisionsError);
    }

    // Step 5: Return combined response
    return NextResponse.json({
      transcript: {
        id: transcript.id,
        title: transcript.title,
        content: transcript.content,
        createdAt: transcript.created_at,
      },
      notes: notes
        ? {
            id: notes.id,
            status: notes.status,
            cleanedNotes: notes.cleaned_notes,
            errorMessage: notes.error_message,
            createdAt: notes.created_at,
            updatedAt: notes.updated_at,
          }
        : {
            status: "processing",
            cleanedNotes: null,
            errorMessage: null,
          },
      actionItems: (actionItems || []).map((item) => ({
        id: item.id,
        description: item.description,
        owner: item.owner,
        dueDate: item.due_date,
        createdAt: item.created_at,
      })),
      decisions: (decisions || []).map((decision) => ({
        id: decision.id,
        decisionText: decision.decision_text,
        rationale: decision.rationale,
        createdAt: decision.created_at,
      })),
    });
  } catch (error) {
    console.error("API error:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}