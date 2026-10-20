import type { ReactNode } from 'react';

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-dvh justify-center px-4 py-16">
      <div className="w-full max-w-[360px]">
        <p className="mb-8 text-xl font-medium">Leon</p>
        {children}
      </div>
    </main>
  );
}
