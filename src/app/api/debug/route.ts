import { NextResponse } from "next/server";
import { supabase } from "@/lib/supabase";

export async function GET() {
  try {
    // Test 1: Check Supabase connection
    const { data: tables, error: tablesError } = await supabase
      .from("transcripts")
      .select("*")
      .limit(1);

    if (tablesError) {
      return NextResponse.json({
        status: "error",
        issue: "Supabase connection",
        error: tablesError.message,
      });
    }

    // Test 2: Check environment variables
    const envCheck = {
      supabaseUrl: !!process.env.NEXT_PUBLIC_SUPABASE_URL,
      supabaseAnonKey: !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
      qstashToken: !!process.env.QSTASH_TOKEN,
      baseUrl: process.env.NEXT_PUBLIC_BASE_URL || "not set",
    };

    return NextResponse.json({
      status: "ok",
      supabaseConnection: "working",
      environment: envCheck,
    });
  } catch (error) {
    return NextResponse.json({
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    });
  }
}
