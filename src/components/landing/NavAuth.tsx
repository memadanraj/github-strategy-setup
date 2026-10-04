import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";

export function NavAuth() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);

  return (
    <div className="ml-auto flex items-center gap-2">
      {!signedIn && (
        <Button variant="ghost" size="sm" asChild><Link to="/auth">Sign in</Link></Button>
      )}
      <Button variant="signal" size="sm" className="rounded-full" asChild>
        <Link to={signedIn ? "/dashboard" : "/auth"}>{signedIn ? "Open studio" : "Start Creating"}</Link>
      </Button>
    </div>
  );
}
