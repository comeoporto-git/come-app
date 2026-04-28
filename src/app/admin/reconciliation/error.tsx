"use client";

export default function ReconciliationError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-screen bg-[#667470] flex items-center justify-center">
      <div className="bg-white rounded-2xl shadow-lg p-8 max-w-md w-full mx-4 text-center space-y-4">
        <p className="text-4xl">⚠️</p>
        <h1 className="text-lg font-bold text-gray-800">Erro ao carregar reconciliação</h1>
        <p className="text-sm text-gray-500">
          {error.message || "Ocorreu um erro inesperado."}
        </p>
        {error.digest && (
          <p className="text-xs text-gray-300 font-mono">ID: {error.digest}</p>
        )}
        <button
          onClick={reset}
          className="mt-2 px-5 py-2 bg-[#32373c] text-white text-sm font-semibold rounded-xl hover:bg-[#32373c]/80 transition-colors"
        >
          Tentar novamente
        </button>
      </div>
    </div>
  );
}
