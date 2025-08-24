import { useState } from "react";
import { supabase } from "../lib/supabase"; // パスはプロジェクトに合わせて修正
import { useNavigate } from "react-router-dom";

export default function SignUp() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      // 1. Supabase Auth にユーザー作成
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: { username }, // metadata に保存
        },
      });

      if (error) {
        alert(error.message);
        setLoading(false);
        return;
      }

      // 2. profiles テーブルに保存
      if (data.user) {
        const { error: insertError } = await supabase
          .from("profiles")
          .insert([{ id: data.user.id, username }]);

        if (insertError) {
          console.error("プロフィール保存エラー:", insertError.message);
          alert("プロフィール保存に失敗しました");
        }
      }

      alert("登録完了！確認メールをチェックしてください。");
      navigate("/login"); // サインアップ後にログイン画面へ
    } catch (err) {
      console.error("SignUp Error:", err);
      alert("予期せぬエラーが発生しました");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-lg w-full max-w-md">
        <h1 className="text-2xl font-bold mb-6 text-center">Sign Up</h1>
        <form onSubmit={handleSignUp} className="space-y-4">
          <input
            type="text"
            placeholder="Username"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            className="border p-2 w-full rounded"
            required
          />
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border p-2 w-full rounded"
            required
          />
          <input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="border p-2 w-full rounded"
            required
          />
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-blue-500 hover:bg-blue-600 text-white py-2 rounded transition"
          >
            {loading ? "Signing Up..." : "Sign Up"}
          </button>
        </form>
      </div>
    </div>
  );
}
