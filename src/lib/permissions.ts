import { getDb } from "@/lib/db";

export type Role = "Admin" | "Guide" | "Super Guide" | "Accountant" | "Chef" | "Driver";

export const ALL_ROLES: Role[] = ["Admin", "Guide", "Super Guide", "Accountant", "Chef", "Driver"];

export type Feature = {
  key: string;
  label: string;
  description: string;
  path: string;        // canonical admin path for this feature
  defaultRoles: Role[];
};

/** All platform features with their default role access. */
export const FEATURES: Feature[] = [
  {
    key: "tours_guide",
    label: "Guia de Tours",
    description: "Ver tours do dia e registar despesas",
    path: "/guide",
    defaultRoles: ["Admin", "Guide", "Super Guide", "Chef", "Driver"],
  },
  {
    key: "invoices",
    label: "Faturas em Falta",
    description: "Gerir despesas sem fatura associada",
    path: "/admin/invoices",
    defaultRoles: ["Admin", "Super Guide"],
  },
  {
    key: "transfers",
    label: "Transferências em Falta",
    description: "Gerir reembolsos pendentes ao guia",
    path: "/admin/em-falta",
    defaultRoles: ["Admin"],
  },
  {
    key: "bank",
    label: "Banco",
    description: "Ligar conta bancária e sincronizar movimentos",
    path: "/admin/banco",
    defaultRoles: ["Admin"],
  },
  {
    key: "reconciliation",
    label: "Reconciliação Bancária",
    description: "Reconciliar movimentos com faturas",
    path: "/admin/reconciliation",
    defaultRoles: ["Admin"],
  },
  {
    key: "accounting",
    label: "Portal Contabilidade",
    description: "Ver faturas, movimentos e exportar CSV",
    path: "/accountant",
    defaultRoles: ["Admin", "Accountant"],
  },
  {
    key: "bank_transactions",
    label: "Movimentos Bancários",
    description: "Ver histórico de transações bancárias no portal",
    path: "/admin/bank-transactions",
    defaultRoles: ["Admin", "Accountant"],
  },
  {
    key: "service_management",
    label: "Gestão de Serviços",
    description: "Configurar tipos de tour e serviço",
    path: "/admin/gestao-servicos",
    defaultRoles: ["Admin"],
  },
  {
    key: "user_management",
    label: "Utilizadores",
    description: "Gerir contas e roles da equipa",
    path: "/admin/users",
    defaultRoles: ["Admin"],
  },
  {
    key: "permissions",
    label: "Permissões",
    description: "Ver e editar o que cada role pode aceder",
    path: "/admin/permissoes",
    defaultRoles: ["Admin"],
  },
];

// ── DB helpers ────────────────────────────────────────────────────────────────

async function ensureTable() {
  const sql = getDb();
  await sql`
    CREATE TABLE IF NOT EXISTS role_permissions (
      id          SERIAL PRIMARY KEY,
      feature_key TEXT NOT NULL,
      role        TEXT NOT NULL,
      enabled     BOOLEAN NOT NULL DEFAULT true,
      updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      UNIQUE (feature_key, role)
    )
  `;
}

type PermRow = { feature_key: string; role: string; enabled: boolean };

/**
 * Returns a map of feature_key → role → enabled (boolean).
 * Merges DB overrides on top of FEATURES defaults.
 */
export async function getRolePermissions(): Promise<Record<string, Record<string, boolean>>> {
  try {
    const sql = getDb();
    await ensureTable();
    const rows = (await sql`SELECT feature_key, role, enabled FROM role_permissions`) as PermRow[];

    const overrides: Record<string, Record<string, boolean>> = {};
    for (const row of rows) {
      if (!overrides[row.feature_key]) overrides[row.feature_key] = {};
      overrides[row.feature_key][row.role] = row.enabled;
    }

    const result: Record<string, Record<string, boolean>> = {};
    for (const feature of FEATURES) {
      result[feature.key] = {};
      for (const role of ALL_ROLES) {
        const override = overrides[feature.key]?.[role];
        result[feature.key][role] =
          override !== undefined ? override : feature.defaultRoles.includes(role);
      }
    }
    return result;
  } catch {
    // Fallback to defaults if DB is unavailable
    const result: Record<string, Record<string, boolean>> = {};
    for (const feature of FEATURES) {
      result[feature.key] = {};
      for (const role of ALL_ROLES) {
        result[feature.key][role] = feature.defaultRoles.includes(role);
      }
    }
    return result;
  }
}

/** Upsert a single permission override. */
export async function setPermission(
  featureKey: string,
  role: string,
  enabled: boolean,
): Promise<void> {
  const sql = getDb();
  await ensureTable();
  await sql`
    INSERT INTO role_permissions (feature_key, role, enabled)
    VALUES (${featureKey}, ${role}, ${enabled})
    ON CONFLICT (feature_key, role) DO UPDATE
      SET enabled = ${enabled}, updated_at = NOW()
  `;
}

/** Reset a feature+role back to its hardcoded default. */
export async function resetPermission(featureKey: string, role: string): Promise<void> {
  const sql = getDb();
  await ensureTable();
  await sql`DELETE FROM role_permissions WHERE feature_key = ${featureKey} AND role = ${role}`;
}
