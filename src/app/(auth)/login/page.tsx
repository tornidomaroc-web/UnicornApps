import { login, signup, signInWithGoogle } from './actions'
import { Button } from '@/components/ui/button'
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'

export default function LoginPage({
  searchParams,
}: {
  searchParams: { error?: string; message?: string }
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12 dark:bg-zinc-950">
      <Card className="w-full max-w-md shadow-lg border-zinc-200 dark:border-zinc-800">
        <CardHeader className="space-y-1">
          <CardTitle className="text-2xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            Sign in
          </CardTitle>
          <CardDescription className="text-zinc-500 dark:text-zinc-400">
            Enter your email and password to access your account.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <form action={login} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                name="email"
                type="email"
                placeholder="name@example.com"
                required
                className="bg-white dark:bg-zinc-900"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor="password">Password</Label>
              </div>
              <Input
                id="password"
                name="password"
                type="password"
                required
                className="bg-white dark:bg-zinc-900"
              />
            </div>
            {searchParams.error && (
              <div className="rounded-md bg-destructive/15 p-3 text-sm text-destructive">
                {searchParams.error}
              </div>
            )}
            {searchParams.message && (
              <div className="rounded-md bg-zinc-100 p-3 text-sm text-zinc-800 dark:bg-zinc-800 dark:text-zinc-200">
                {searchParams.message}
              </div>
            )}
            <Button type="submit" className="w-full" formAction={login}>
              Sign In
            </Button>
            <Button
              type="submit"
              variant="outline"
              className="w-full"
              formAction={signup}
            >
              Sign Up
            </Button>
          </form>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <span className="w-full border-t border-zinc-200 dark:border-zinc-800" />
            </div>
            <div className="relative flex justify-center text-xs uppercase">
              <span className="bg-zinc-50 px-2 text-zinc-500 dark:bg-zinc-950 dark:text-zinc-400">
                Or continue with
              </span>
            </div>
          </div>

          <form action={signInWithGoogle}>
            <Button variant="outline" type="submit" className="w-full bg-white dark:bg-zinc-900">
              <svg
                className="mr-2 h-4 w-4"
                aria-hidden="true"
                focusable="false"
                data-prefix="fab"
                data-icon="google"
                role="img"
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 488 512"
              >
                <path
                  fill="currentColor"
                  d="M488 261.8C488 403.3 391.1 504 248 504 110.8 504 0 393.2 0 256S110.8 8 248 8c66.8 0 123 24.5 166.3 64.9l-67.5 64.9C258.5 52.6 94.3 116.6 94.3 256c0 86.5 69.1 156.6 153.7 156.6 98.2 0 135-70.4 140.8-106.9H248v-85.3h236.1c2.3 12.7 3.9 24.9 3.9 41.4z"
                ></path>
              </svg>
              Google
            </Button>
          </form>
        </CardContent>
        <CardFooter>
          <p className="px-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
            By clicking continue, you agree to our{" "}
            <a href="#" className="underline underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-50">
              Terms of Service
            </a>{" "}
            and{" "}
            <a href="#" className="underline underline-offset-4 hover:text-zinc-900 dark:hover:text-zinc-50">
              Privacy Policy
            </a>
            .
          </p>
        </CardFooter>
      </Card>
    </div>
  )
}
