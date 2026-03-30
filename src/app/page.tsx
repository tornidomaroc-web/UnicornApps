import Link from "next/link";

export default function Home() {
  return (
    <div className="flex flex-col items-center justify-center py-20 px-4 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl text-slate-900">
        Transform Product Images into <br />
        <span className="text-indigo-600">SEO-Optimized Content</span>
      </h1>
      <p className="mt-6 text-lg leading-8 text-slate-600 max-w-2xl">
        The ultimate B2B SaaS tool for e-commerce marketers. Scale your content 
        production effortlessly with the power of Gemini AI.
      </p>
      <div className="mt-10 flex items-center justify-center gap-x-6">
        <Link
          href="/dashboard"
          className="rounded-md bg-indigo-600 px-3.5 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-indigo-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-600"
        >
          Get Started
        </Link>
        <Link href="/demo" className="text-sm font-semibold leading-6 text-slate-900">
          View Demo <span aria-hidden="true">→</span>
        </Link>
      </div>
    </div>
  );
}
