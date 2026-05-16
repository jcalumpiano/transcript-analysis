import { Client } from "@upstash/qstash";

// Initialize QStash client
const token = process.env.QSTASH_TOKEN;

if (!token) {
  console.warn("QSTASH_TOKEN not set - job queueing will fail");
}

const qstash = new Client({
  token: token || "dummy-token-for-testing",
});

/**
 * Enqueue a transcript processing job
 * @param transcriptId - UUID of the transcript to process
 * @param webhookUrl - URL where the Worker will receive the job
 */
export async function enqueueTranscriptJob(
  transcriptId: string,
  webhookUrl: string
) {
  try {
    const response = await qstash.publish({
      url: webhookUrl,
      body: JSON.stringify({
        transcriptId,
        timestamp: new Date().toISOString(),
      }),
      headers: {
        "Content-Type": "application/json",
      },
      timeout: 3600, // 1 hour timeout for processing
    });

    console.log("Job enqueued:", response);
    return response;
  } catch (error) {
    console.error("Failed to enqueue job:", error);
    throw error;
  }
}

/**
 * Verify QStash signature for incoming webhook requests
 * Used in Phase 3 when the Worker calls back to your API
 */
export async function verifyQStashSignature(
  _body: string,
  signature: string
): Promise<boolean> {
  try {
    // QStash provides signature verification
    // For now, we'll implement basic verification
    return signature.length > 0; // Placeholder
  } catch (error) {
    console.error("Signature verification failed:", error);
    return false;
  }
}
