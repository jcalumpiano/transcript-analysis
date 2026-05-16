'use client';

import { useEffect, useState } from 'react';

interface Transcript {
  id: string;
  title: string;
  created_at: string;
}

export default function Home() {
  const [recentTranscripts, setRecentTranscripts] = useState<Transcript[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchRecent = async () => {
      try {
        const response = await fetch('/api/transcripts');
        if (response.ok) {
          const data = await response.json();
          setRecentTranscripts(data.slice(0, 5));
        }
      } catch (error) {
        console.error('Failed to fetch recent transcripts:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchRecent();
  }, []);

  return (
    <div className="min-h-screen bg-gradient-to-b from-blue-50 to-white">
      <nav className="bg-white shadow-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <h1 className="text-2xl font-bold text-blue-600">Meeting Notes AI</h1>
        </div>
      </nav>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        <div className="max-w-2xl">
          <h2 className="text-4xl font-bold mb-4 text-gray-900">
            Turn Messy Transcripts into Structured Notes
          </h2>
          <p className="text-lg text-gray-600 mb-8">
            Upload a meeting transcript and get cleaned notes, action items, and key decisions in seconds.
          </p>

          <a
            href="/upload"
            className="inline-block bg-blue-600 text-white px-8 py-3 rounded-lg font-medium hover:bg-blue-700"
          >
            Get Started
          </a>
        </div>

        <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-6">
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold text-lg mb-2">Cleaned Notes</h3>
            <p className="text-gray-600">
              AI removes filler words and organizes key points
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold text-lg mb-2">Action Items</h3>
            <p className="text-gray-600">
              Automatically extract tasks with owners and due dates
            </p>
          </div>
          <div className="bg-white p-6 rounded-lg shadow">
            <h3 className="font-semibold text-lg mb-2">Decisions</h3>
            <p className="text-gray-600">
              Identify key decisions and their rationale
            </p>
          </div>
        </div>

        {/* Recent Transcripts Section */}
        {recentTranscripts.length > 0 && (
          <div className="mt-16">
            <h2 className="text-2xl font-bold mb-6 text-gray-900">Recent Transcripts</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {recentTranscripts.map((transcript) => (
                <a
                  key={transcript.id}
                  href={`/results/${transcript.id}`}
                  className="bg-white p-6 rounded-lg shadow hover:shadow-lg transition-shadow"
                >
                  <h3 className="font-semibold text-lg mb-2 text-blue-600">
                    {transcript.title}
                  </h3>
                  <p className="text-sm text-gray-600">
                    {new Date(transcript.created_at).toLocaleDateString()}
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}

        {!loading && recentTranscripts.length === 0 && (
          <div className="mt-16 text-center">
            <p className="text-gray-600">No transcripts yet. Start by uploading one!</p>
          </div>
        )}
      </main>
    </div>
  );
}
