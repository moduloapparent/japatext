import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { completeAuthRedirect, getSupabase } from "../lib/supabase";

/** Completes the magic-link redirect and returns to the app. */
export function AuthCallback() {
  const navigate = useNavigate();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) {
      navigate("/", { replace: true });
      return;
    }
    (async () => {
      const result = await completeAuthRedirect();
      if (result.error) {
        setError(result.error);
        return;
      }
      const { data } = await supabase.auth.getSession();
      if (!data.session) {
        setError("ログインセッションを確立できませんでした。リンクをもう一度お試しください。");
        return;
      }
      navigate("/", { replace: true });
    })();
  }, [navigate]);

  if (error) {
    return (
      <div className="login-page">
        <div className="login-card">
          <h1>ログインに失敗しました</h1>
          <p className="login-error">{error}</p>
        </div>
      </div>
    );
  }

  return <div className="app-loading">ログイン処理中…</div>;
}
