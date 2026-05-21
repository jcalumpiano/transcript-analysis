const WORKER_URL = process.env.NEXT_PUBLIC_WORKER_URL!; // add to .env.local

export async function getTranscriptStatus(transcriptId: string) {
  const res = await fetch(`${WORKER_URL}/status/${transcriptId}`);
  if (!res.ok) throw new Error('Failed to fetch status');
  return res.json() as Promise<{
    status: 'pending' | 'processing' | 'complete' | 'error';
    error: string | null;
    updatedAt: string | null;
  }>;
}
