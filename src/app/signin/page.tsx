import { Button, buttonVariants } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Logo } from "@/components/Logo";

export default function SignInPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <nav className="flex items-center justify-between px-6 md:px-10 py-6 max-w-6xl mx-auto w-full">
        <a href="/" className="flex items-center gap-3">
          <Logo size={32} />
        </a>
        <a href="/" className={buttonVariants({ variant: "ghost", size: "sm" })}>Back to home</a>
      </nav>
      <div className="flex-1 flex items-center justify-center p-6">
        <Card className="glass-card w-full max-w-md">
          <CardHeader className="text-center">
            <div className="mx-auto w-fit"><Logo size={48} /></div>
            <CardTitle className="text-2xl mt-4 text-white">Sign in to Olantis</CardTitle>
            <CardDescription className="text-zinc-400">Secure authentication via WorkOS. Your portfolios are private.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <a href="/login" className={buttonVariants({ className: "w-full" })}>Continue to WorkOS →</a>
          <a href="/api/demo" className={buttonVariants({ variant: "outline", className: "w-full bg-white/5 border-white/10 hover:bg-white/10" })}>Try demo with sample data →</a>
            <p className="text-xs text-center text-zinc-600">No password stored • Neon + Drizzle</p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
