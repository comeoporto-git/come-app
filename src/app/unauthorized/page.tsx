import Link from "next/link";

export default function UnauthorizedPage() {
  return (
    <main className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <div className="text-center space-y-3">
        <div className="text-5xl">🚫</div>
        <h1 className="text-xl font-bold text-gray-900">Acesso negado</h1>
        <p className="text-sm text-gray-500">Não tens permissão para aceder a esta página.</p>
        <Link href="/" className="inline-block text-sm text-orange-600 hover:underline mt-2">
          Voltar ao início
        </Link>
      </div>
    </main>
  );
}
