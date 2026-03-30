import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { logout } from "@/app/(auth)/login/actions";
import { Button } from "@/components/ui/button";

export default async function Navbar() {
  const supabase = createClient();
  
  if (!supabase) {
    return (
      <nav className="fixed top-0 w-full z-50 border-b border-zinc-200/50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md text-red-500 flex justify-center py-4 text-sm font-semibold">
        UnicornApps (Config Error)
      </nav>
    );
  }

  const { data: { user } } = await supabase.auth.getUser();

  return (
    <nav className="fixed top-0 w-full z-50 border-b border-zinc-200/50 dark:border-zinc-800/50 bg-white/80 dark:bg-zinc-950/80 backdrop-blur-md transition-all">
      <div className="container mx-auto max-w-7xl px-4 h-16 flex items-center justify-between">
        <div className="flex items-center gap-8">
          <Link href="/" className="font-extrabold text-xl tracking-tight text-zinc-900 dark:text-zinc-50 flex items-center gap-2">
            <span className="bg-primary text-white w-6 h-6 flex items-center justify-center rounded-md text-sm">U</span>
            UnicornApps
          </Link>
          
          <div className="hidden md:flex items-center gap-6 text-sm font-medium text-zinc-600 dark:text-zinc-400">
            <Link href="/" className="hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Home</Link>
            <Link href="/features" className="hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Features</Link>
            <Link href="/pricing" className="hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">Pricing</Link>
            <Link href="/about" className="hover:text-zinc-900 dark:hover:text-zinc-50 transition-colors">About</Link>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <>
              <Link href="/dashboard" className="hidden sm:block text-sm font-medium text-zinc-600 hover:text-primary dark:text-zinc-400 dark:hover:text-primary transition-colors">
                Dashboard
              </Link>
              <form action={logout}>
                <Button variant="outline" size="sm" type="submit" className="h-9 px-4 rounded-full font-medium">
                  Log out
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="hidden sm:block text-sm font-medium text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-50 transition-colors">
                Log in
              </Link>
              <Link href="/login">
                <Button size="sm" className="h-9 px-4 rounded-full font-medium shadow-sm transition-transform active:scale-95">
                  Get Started
                </Button>
              </Link>
            </>
          )}
        </div>
      </div>
    </nav>
  );
}
