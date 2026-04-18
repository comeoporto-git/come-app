"use client";

import { useState, useTransition } from "react";
import { togglePermissionAction } from "@/actions/permissions";
import type { Feature } from "@/lib/permissions";

type Props = {
  features: Feature[];
  roles: string[];
  permissions: Record<string, Record<string, boolean>>;
  defaults: Record<string, Record<string, boolean>>;
};

export function PermissionsMatrix({ features, roles, permissions, defaults }: Props) {
  const [perms, setPerms] = useState(permissions);
  const [pending, startTransition] = useTransition();
  const [errors, setErrors] = useState<Record<string, string>>({});

  function toggle(featureKey: string, role: string) {
    const current = perms[featureKey]?.[role] ?? false;
    const next = !current;
    const key = `${featureKey}:${role}`;

    setPerms((prev) => ({
      ...prev,
      [featureKey]: { ...prev[featureKey], [role]: next },
    }));
    setErrors((prev) => { const n = { ...prev }; delete n[key]; return n; });

    startTransition(async () => {
      const result = await togglePermissionAction(featureKey, role, next);
      if (result.error) {
        // Revert on error
        setPerms((prev) => ({
          ...prev,
          [featureKey]: { ...prev[featureKey], [role]: current },
        }));
        setErrors((prev) => ({ ...prev, [key]: result.error! }));
      }
    });
  }

  const roleColors: Record<string, string> = {
    "Admin":       "text-purple-700",
    "Guide":       "text-[#667470]",
    "Super Guide": "text-blue-600",
    "Accountant":  "text-orange-600",
    "Chef":        "text-red-600",
  };

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b border-gray-100">
            <th className="text-left text-xs font-semibold text-gray-500 py-3 pr-4 w-64">
              Funcionalidade
            </th>
            {roles.map((role) => (
              <th key={role} className={`text-center text-xs font-semibold py-3 px-3 min-w-[90px] ${roleColors[role] ?? "text-gray-600"}`}>
                {role}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-gray-50">
          {features.map((feature) => (
            <tr key={feature.key} className="group hover:bg-gray-50/50">
              <td className="py-3 pr-4">
                <p className="font-medium text-gray-800 text-sm">{feature.label}</p>
                <p className="text-xs text-gray-400 mt-0.5 leading-tight">{feature.description}</p>
              </td>
              {roles.map((role) => {
                const enabled = perms[feature.key]?.[role] ?? false;
                const isDefault = defaults[feature.key]?.[role] ?? false;
                const isCustom = enabled !== isDefault;
                const errKey = `${feature.key}:${role}`;
                const hasError = !!errors[errKey];

                return (
                  <td key={role} className="text-center py-3 px-3">
                    <div className="flex flex-col items-center gap-1">
                      <button
                        onClick={() => toggle(feature.key, role)}
                        disabled={pending}
                        title={hasError ? errors[errKey] : isCustom ? "Clica para repor padrão" : ""}
                        className={`
                          w-7 h-7 rounded-full border-2 flex items-center justify-center
                          transition-all duration-150 disabled:opacity-60
                          ${hasError
                            ? "border-red-400 bg-red-50"
                            : enabled
                              ? "border-[#667470] bg-[#667470] hover:bg-[#597568] hover:border-[#597568]"
                              : "border-gray-200 bg-white hover:border-gray-400"
                          }
                        `}
                      >
                        {enabled && (
                          <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                          </svg>
                        )}
                      </button>
                      {isCustom && !hasError && (
                        <span className="text-[10px] text-orange-500 font-medium">custom</span>
                      )}
                    </div>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>

      <p className="text-xs text-gray-400 mt-6">
        <span className="inline-block w-2 h-2 rounded-full bg-[#667470] mr-1.5 align-middle" />
        Acesso activo
        <span className="mx-3 text-gray-200">·</span>
        <span className="text-orange-500 font-medium">custom</span> — diferente do padrão
        <span className="mx-3 text-gray-200">·</span>
        As alterações são guardadas imediatamente. A segurança das páginas mantém-se no código.
      </p>
    </div>
  );
}
