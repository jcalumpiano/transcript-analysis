'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';

interface TranscriptResult {
  transcript: {
    id: string;
    title: string;
    content: string;
    created_at: string;
  };
  notes: {
    id: string;
    cleaned_notes: string;
    status: 'processing' | 'completed' | 'failed';
    error_message?: string;
  } | null;
  actionItems: Array<{
    id: string;
    description: string;
    owner: string | null;
    due_date: string | null;
  }>;
  decisions: Array<{
    id: string;
    decision_text: string;
    rationale: string | null;
  }>;
}

export default function ResultsPage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<TranscriptResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  const fetchResults = async () => {
    try {
      const response = await fetch(`/api/transcript/${id}`);
      if (!response.ok) {
        throw new Error('Failed to fetch results');
      }
      const result = await response.json();
      setData(result);

      // Stop auto-refresh if processing is complete or failed
      if (result.notes?.status !== 'processing') {
        setAutoRefresh(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchResults();
  }, [id]);

  // Auto-refresh every 3 seconds while processing
  useEffect(() => {
    if (!autoRefresh) return;

    const interval = setInterval(fetchResults, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <a href="/" className="text-xl font-bold text-blue-600">
              Meeting Notes AI
            </a>
          </div>
        </nav>

        <main className="max-w-4xl mx-auto px-4 py-12">
          <div className="text-center">
            <div className="inline-block animate-spin text-4xl">⏳</div>
            <p className="mt-4 text-gray-600">Loading results...</p>
          </div>
        </main>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <a href="/" className="text-xl font-bold text-blue-600">
              Meeting Notes AI
            </a>
          </div>
        </nav>

        <main className="max-w-4xl mx-auto px-4 py-12">
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error || 'No data found'}
          </div>
          <a href="/" className="mt-4 inline-block text-blue-600 hover:underline">
            ← Back to Home
          </a>
        </main>
      </div>
    );
  }

  const isProcessing = data.notes?.status === 'processing';
  const isFailed = data.notes?.status === 'failed';

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <a href="/" className="text-xl font-bold text-blue-600">
            Meeting Notes AI
          </a>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-4 py-12">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold mb-2 text-gray-900">{data.transcript.title}</h1>
          <p className="text-gray-600">
            Created {new Date(data.transcript.created_at).toLocaleString()}
          </p>
          <p className="text-sm text-gray-500 mt-2">ID: {id}</p>
        </div>

        {/* Status Badge */}
        <div className="mb-8 flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isProcessing && (
              <span className="inline-flex items-center gap-2 bg-yellow-50 text-yellow-700 px-4 py-2 rounded-lg">
                <span className="inline-block animate-spin">⟳</span>
                Processing...
              </span>
            )}
            {!isProcessing && !isFailed && (
              <span className="inline-flex items-center gap-2 bg-green-50 text-green-700 px-4 py-2 rounded-lg">
                ✓ Complete
              </span>
            )}
            {isFailed && (
              <span className="inline-flex items-center gap-2 bg-red-50 text-red-700 px-4 py-2 rounded-lg">
                ✗ Failed
              </span>
            )}
          </div>
          <button
            onClick={fetchResults}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 font-medium text-gray-900"
          >
            Refresh
          </button>
        </div>

        {/* Error Message */}
        {isFailed && data.notes?.error_message && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg mb-8">
            {data.notes.error_message}
          </div>
        )}

        {/* Original Transcript */}
        <div className="bg-white p-8 rounded-lg shadow mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-900">Original Transcript</h2>
          <div className="bg-gray-50 p-4 rounded text-sm text-gray-700 overflow-auto max-h-64">
            {data.transcript.content}
          </div>
        </div>

        {/* Cleaned Notes */}
        <div className="bg-white p-8 rounded-lg shadow mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-900">Cleaned Notes</h2>
          {isProcessing ? (
            <p className="text-gray-600 italic">Processing transcript...</p>
          ) : isFailed ? (
            <p className="text-red-600">Failed to process notes</p>
          ) : data.notes?.cleaned_notes ? (
            <div className="prose text-gray-700 whitespace-pre-wrap">
              {data.notes.cleaned_notes}
            </div>
          ) : (
            <p className="text-gray-600">No notes available</p>
          )}
        </div>

        {/* Action Items */}
        <div className="bg-white p-8 rounded-lg shadow mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-900">Action Items</h2>
          {isProcessing ? (
            <p className="text-gray-600 italic">Extracting action items...</p>
          ) : data.actionItems.length > 0 ? (
            <div className="space-y-3">
              {data.actionItems.map((item) => (
                <div
                  key={item.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-blue-50"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-medium text-gray-900">{item.description}</p>
                      {item.owner && (
                        <p className="text-sm text-gray-600 mt-1">Owner: {item.owner}</p>
                      )}
                    </div>
                    {item.due_date && (
                      <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-3 py-1 rounded-full whitespace-nowrap ml-4">
                        Due: {new Date(item.due_date).toLocaleDateString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No action items found</p>
          )}
        </div>

        {/* Decisions */}
        <div className="bg-white p-8 rounded-lg shadow mb-8">
          <h2 className="text-xl font-bold mb-4 text-gray-900">Decisions</h2>
          {isProcessing ? (
            <p className="text-gray-600 italic">Identifying decisions...</p>
          ) : data.decisions.length > 0 ? (
            <div className="space-y-3">
              {data.decisions.map((decision) => (
                <div
                  key={decision.id}
                  className="border border-gray-200 rounded-lg p-4 hover:bg-blue-50"
                >
                  <p className="font-medium text-gray-900">{decision.decision_text}</p>
                  {decision.rationale && (
                    <p className="text-sm text-gray-600 mt-2 italic">
                      Rationale: {decision.rationale}
                    </p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <p className="text-gray-600">No decisions recorded</p>
          )}
        </div>

        {/* Navigation */}
        <div className="flex gap-4">
          <a
            href="/upload"
            className="flex-1 text-center bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            Analyze Another Transcript
          </a>
          <a
            href="/"
            className="flex-1 text-center px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 text-gray-900"
          >
            Back to Home
          </a>
        </div>
      </main>
    </div>
  );
}
