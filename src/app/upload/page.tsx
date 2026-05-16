'use client';

import { FormEvent, useState } from 'react';
import { useRouter } from 'next/navigation';

export default function UploadPage() {
  const [file, setFile] = useState<File | null>(null);
  const [transcript, setTranscript] = useState('');
  const [title, setTitle] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [transcriptId, setTranscriptId] = useState<string | null>(null);
  const router = useRouter();

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      if (!transcript.trim()) {
        throw new Error('Transcript cannot be empty');
      }

      const response = await fetch('/api/process', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          title: title || 'Untitled Meeting',
          transcript: transcript,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to submit transcript');
      }

      const data = await response.json();
      setTranscriptId(data.transcriptId);
      setTranscript('');
      setTitle('');

      // Redirect to results page after 2 seconds
      setTimeout(() => {
        router.push(`/results/${data.transcriptId}`);
      }, 2000);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setLoading(false);
    }
  };

  if (transcriptId) {
    return (
      <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
        <nav className="bg-white shadow-sm">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
            <a href="/" className="text-xl font-bold text-blue-600">
              Meeting Notes AI
            </a>
          </div>
        </nav>

        <main className="max-w-2xl mx-auto px-4 py-12">
          <div className="bg-white p-8 rounded-lg shadow">
            <div className="text-center">
              <h2 className="text-2xl font-bold text-green-600 mb-4">
                ✓ Transcript Submitted
              </h2>
              <p className="text-gray-600 mb-4">
                Transcript ID: <code className="bg-gray-100 px-2 py-1 rounded">{transcriptId}</code>
              </p>
              <p className="text-gray-600 mb-6">
                Processing your transcript... Redirecting to results page.
              </p>
              <a
                href={`/results/${transcriptId}`}
                className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700"
              >
                View Results
              </a>
            </div>
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <a href="/" className="text-xl font-bold text-blue-600">
            Meeting Notes AI
          </a>
        </div>
      </nav>

      <main className="max-w-2xl mx-auto px-4 py-12">
        <div className="bg-white p-8 rounded-lg shadow">
          <h1 className="text-3xl font-bold mb-2 text-gray-900">Upload Meeting Transcript</h1>
          <p className="text-gray-600 mb-8">
            Paste your meeting transcript below. The AI will clean it up, extract action items, and identify decisions.
          </p>

          <form onSubmit={handleSubmit} className="space-y-6">
            {/* Title Input */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Meeting Title (optional)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g., Q2 Planning Meeting"
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-gray-900"
              />
            </div>

            {/* File Upload Input (optional) */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Upload File (optional)
              </label>
              <input
                type="file"
                accept=".txt,.pdf"
                onChange={(e) => {
                  const selectedFile = e.target.files?.[0];
                  if (selectedFile) {
                    setFile(selectedFile);
                    const reader = new FileReader();
                    reader.onload = (event) => {
                      setTranscript(event.target?.result as string);
                    };
                    reader.readAsText(selectedFile);
                  }
                }}
                className="block w-full text-sm text-gray-500
                  file:mr-4 file:py-2 file:px-4
                  file:rounded-lg file:border-0
                  file:text-sm file:font-medium
                  file:bg-blue-50 file:text-blue-700
                  hover:file:bg-blue-100"
              />
            </div>

            {/* Transcript Textarea */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Transcript *
              </label>
              <textarea
                value={transcript}
                onChange={(e) => setTranscript(e.target.value)}
                placeholder="Paste your meeting transcript here..."
                rows={12}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent font-mono text-sm text-gray-900"
              />
              <p className="text-sm text-gray-500 mt-2">
                {transcript.length} characters
              </p>
            </div>

            {/* Error Message */}
            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
                {error}
              </div>
            )}

            {/* Submit Button */}
            <div className="flex gap-4">
              <button
                type="submit"
                disabled={loading || !transcript.trim()}
                className="flex-1 bg-blue-600 text-white px-6 py-3 rounded-lg font-medium hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {loading ? 'Processing...' : 'Analyze Transcript'}
              </button>
              <a
                href="/"
                className="px-6 py-3 border border-gray-300 rounded-lg font-medium hover:bg-gray-50 text-gray-900"
              >
                Cancel
              </a>
            </div>
          </form>
        </div>

        {/* Example Section */}
        <div className="mt-12 bg-white p-8 rounded-lg shadow">
          <h2 className="text-lg font-bold mb-4 text-gray-900">Example Transcript</h2>
          <p className="text-sm text-gray-600 mb-4">
            Try pasting something like this to see how the AI analyzes meetings:
          </p>
          <pre className="bg-gray-50 p-4 rounded text-xs overflow-auto text-gray-900">
{`John: Hey team, thanks for joining. We need to decide 
on the new pricing model.
Sarah: I think we should go with tiered pricing like 
competitors.
John: Makes sense. Sarah, can you research competitor 
pricing by Friday?
Sarah: Sure, I'll get that done.
Mike: We should also update the website. I'll handle 
that next week.
John: Great. So to recap - we're doing tiered pricing, 
Sarah researches by Friday, and Mike updates the website.`}
          </pre>
        </div>
      </main>
    </div>
  );
}
