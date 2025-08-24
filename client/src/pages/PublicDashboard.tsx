import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { supabase } from "../lib/supabase";

export default function PublicDashboard() {
  const { username } = useParams();  // URLの :username を取得
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      if (!username) return;

      // profiles.username で join
      const { data, error } = await supabase
        .from("approved_outputs")
        .select(`
          id,
          project,
          file_url,
          status,
          created_at,
          profiles!inner(username)
        `)
        .eq("profiles.username", username)   // 公開ユーザー名でフィルタ
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Error fetching data:", error.message);
      } else {
        setItems(data || []);
      }
      setLoading(false);
    };

    fetchData();
  }, [username]);

  if (loading) return <p className="p-4">Loading...</p>;

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">{username} さんの公開作品</h1>

      {items.length === 0 && (
        <p className="text-gray-500">公開された動画はありません。</p>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {items.map((item) => (
          <div key={item.id} className="bg-white shadow rounded-lg p-4">
            <video
              src={item.file_url}
              controls
              className="w-full rounded"
            />
            <h2 className="mt-2 font-semibold">{item.project}</h2>
            <p className="text-sm text-gray-500">
              {new Date(item.created_at).toLocaleString()}
            </p>
            <span
              className={`inline-block mt-1 px-2 py-1 text-xs rounded ${
                item.status === "approved"
                  ? "bg-green-200 text-green-800"
                  : "bg-red-200 text-red-800"
              }`}
            >
              {item.status}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}
