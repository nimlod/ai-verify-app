import React, { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'

// Supabase クライアント初期化
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY
const supabase = createClient(supabaseUrl, supabaseKey)

export default function Dashboard() {
  const [items, setItems] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchApproved = async () => {
      try {
        const { data, error } = await supabase
          .from('approved_outputs')
          .select('*')
          .order('created_at', { ascending: false })

        if (error) throw error
        setItems(data || [])
      } catch (err) {
        console.error('Error fetching approved outputs:', err)
      } finally {
        setLoading(false)
      }
    }
    fetchApproved()
  }, [])

  if (loading) return <p>Loading...</p>

  return (
    <div className="space-y-8 p-6 bg-gray-50 min-h-screen">
      <h1 className="text-3xl font-bold text-gray-900">My Approved Works</h1>

      {items.length === 0 ? (
        <p className="text-gray-500">No approved works yet.</p>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-8">
          {items.map(work => (
            <div
              key={work.id}
              className="bg-white rounded-2xl shadow-md hover:shadow-xl transition-all border border-gray-200 overflow-hidden flex flex-col"
            >
              {/* 動画プレビュー */}
              {work.file_url && (
                <video
                  src={work.file_url}
                  controls
                  className="w-full aspect-video object-cover"
                />
              )}

              {/* カード下部 */}
              <div className="p-5 flex flex-col flex-1">
                <h3 className="text-lg font-semibold text-gray-900 mb-1 truncate">
                  {work.project_name || 'Untitled Project'}
                </h3>

                <p className="text-sm text-gray-500 mb-3">
                  {new Date(work.created_at).toLocaleString()}
                </p>

                <div className="mt-auto flex justify-between items-center">
                  <span
                    className={`text-xs font-semibold px-3 py-1 rounded-full shadow-sm ${
                      work.status === 'approved'
                        ? 'bg-gradient-to-r from-green-400 to-green-500 text-white'
                        : work.status === 'pending'
                        ? 'bg-gradient-to-r from-yellow-400 to-yellow-500 text-white'
                        : 'bg-gradient-to-r from-red-400 to-red-500 text-white'
                    }`}
                  >
                    {work.status || 'approved'}
                  </span>

                  {work.file_url && (
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(
                          window.location.origin + work.file_url
                        )
                        alert('Share URL copied!')
                      }}
                      className="text-xs bg-blue-50 hover:bg-blue-100 text-blue-600 px-3 py-1 rounded-md border border-blue-200 transition"
                    >
                      Copy URL
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
