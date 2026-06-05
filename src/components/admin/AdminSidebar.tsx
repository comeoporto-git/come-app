"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { signOut } from "next-auth/react";
import { AddExpenseModal } from "@/components/AddExpenseModal";
import type { Fornecedor } from "@/lib/notion";

type NavItem = {
  label: string;
  href: string;
  exact?: boolean;
};

const nav: { group: string | null; items: NavItem[] }[] = [
  {
    group: null,
    items: [{ label: "Dashboard", href: "/admin", exact: true }],
  },
  {
    group: "Operações",
    items: [
      { label: "Serviços", href: "/admin/servicos" },
      { label: "Gestão", href: "/admin/gestao-servicos" },
      { label: "Analytics", href: "/admin/analytics" },
    ],
  },
  {
    group: "CRM & Vendas",
    items: [
      { label: "Pipeline", href: "/admin/crm", exact: true },
      { label: "Clientes", href: "/admin/crm/clients" },
      { label: "Contactos", href: "/admin/crm/contacts" },
      { label: "Semana", href: "/admin/crm/weekly" },
      { label: "Prospecção", href: "/admin/crm/prospecting" },
      { label: "Google Contacts", href: "/admin/crm/google-contacts" },
    ],
  },
  {
    group: "Financeiro",
    items: [
      { label: "Transações", href: "/admin/transacoes" },
      { label: "Banco", href: "/admin/banco" },
      { label: "Faturas", href: "/admin/invoices" },
      { label: "Fat. Clientes", href: "/admin/faturas-clientes" },
      { label: "Transferências", href: "/admin/transferencias" },
      { label: "Reconciliação", href: "/admin/reconciliation" },
      { label: "Em Falta", href: "/admin/em-falta" },
    ],
  },
  {
    group: "Fornecedores",
    items: [
      { label: "Lista", href: "/admin/fornecedores" },
    ],
  },
  {
    group: "Equipa",
    items: [
      { label: "Toda a Equipa", href: "/admin/equipa" },
      { label: "Utilizadores", href: "/admin/users" },
      { label: "Permissões", href: "/admin/permissoes" },
    ],
  },
];

type Props = {
  userName: string;
  userEmail: string;
  userImage: string | null;
  fornecedores?: Fornecedor[];
};

export function AdminSidebar({ userName, userEmail, userImage, fornecedores = [] }: Props) {
  const pathname = usePathname();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [expenseOpen, setExpenseOpen] = useState(false);

  function isActive(item: NavItem) {
    if (item.exact) return pathname === item.href;
    return pathname === item.href || pathname.startsWith(item.href + "/");
  }

  const sidebarContent = (
    <div className="flex flex-col h-full bg-[#111514]">
      {/* Logo */}
      <div className="px-4 py-[14px] border-b border-white/10 flex items-center gap-2.5">
        <Image
          src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
          alt="COME"
          width={72}
          height={28}
          className="object-contain invert opacity-75"
        />
        <span className="text-[10px] font-semibold text-white/30 uppercase tracking-widest">
          Admin
        </span>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-2">
        {nav.map((section, si) => (
          <div key={si} className={si > 0 ? "mt-5" : ""}>
            {section.group && (
              <p className="px-3 mb-1.5 text-[10px] font-semibold text-white/30 uppercase tracking-widest">
                {section.group}
              </p>
            )}
            <div className="space-y-0.5">
              {section.items.map((item) => {
                const active = isActive(item);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`flex items-center px-3 py-[7px] rounded-lg text-[13px] font-medium transition-colors ${
                      active
                        ? "bg-white/10 text-white"
                        : "text-white/55 hover:text-white/90 hover:bg-white/5"
                    }`}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          </div>
        ))}
      </nav>

      {/* Quick actions */}
      <div className="px-3 pb-3 flex gap-2">
        <button
          onClick={() => setExpenseOpen(true)}
          className="flex-1 bg-white text-[#32373c] text-[13px] font-semibold py-2 rounded-xl hover:bg-white/90 active:scale-95 transition-all"
        >
          + Despesa
        </button>
        <Link
          href="/admin/gestao-servicos/novo"
          onClick={() => setMobileOpen(false)}
          className="flex-1 bg-white text-[#32373c] text-[13px] font-semibold py-2 rounded-xl hover:bg-white/90 active:scale-95 transition-all text-center"
        >
          + Serviço
        </Link>
      </div>

      {/* User */}
      <div className="border-t border-white/10 px-4 py-3 space-y-2">
        <div className="flex items-center gap-2.5 min-w-0">
          {userImage ? (
            <Image
              src={userImage}
              alt=""
              width={28}
              height={28}
              className="rounded-full flex-none"
            />
          ) : (
            <div className="w-7 h-7 flex-none rounded-full bg-white/15 flex items-center justify-center text-[12px] text-white font-medium">
              {(userName || userEmail).charAt(0).toUpperCase()}
            </div>
          )}
          <div className="min-w-0">
            <p className="text-[12px] text-white/80 font-medium truncate leading-tight">
              {userName || userEmail}
            </p>
            {userName && (
              <p className="text-[11px] text-white/35 truncate leading-tight">{userEmail}</p>
            )}
          </div>
        </div>
        <button
          onClick={() => signOut({ callbackUrl: "/login" })}
          className="text-[12px] text-white/40 hover:text-white/70 transition-colors"
        >
          Sair
        </button>
      </div>
    </div>
  );

  return (
    <>
      {expenseOpen && (
        <AddExpenseModal
          tourId={null}
          fornecedores={fornecedores}
          userRole="Admin"
          onClose={() => setExpenseOpen(false)}
        />
      )}

      {/* Desktop sidebar — fixed */}
      <aside className="hidden md:flex fixed inset-y-0 left-0 w-[220px] flex-col z-30 shadow-xl">
        {sidebarContent}
      </aside>

      {/* Mobile: fixed top bar */}
      <div className="md:hidden fixed top-0 inset-x-0 h-12 bg-[#111514] z-30 flex items-center px-4 gap-3 shadow-md">
        <button
          onClick={() => setMobileOpen(true)}
          className="text-white/60 hover:text-white p-1 -ml-1"
          aria-label="Abrir menu"
        >
          <svg viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
            <path
              fillRule="evenodd"
              d="M3 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm0 5a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1z"
              clipRule="evenodd"
            />
          </svg>
        </button>
        <Image
          src="https://comeoporto.com/wp-content/uploads/2023/08/cropped-COME-Porto-Food-Tours-Logo-Black-.png"
          alt="COME"
          width={56}
          height={22}
          className="object-contain invert opacity-75"
        />
      </div>

      {/* Mobile drawer overlay */}
      {mobileOpen && (
        <>
          <div
            className="md:hidden fixed inset-0 bg-black/50 z-40"
            onClick={() => setMobileOpen(false)}
          />
          <aside className="md:hidden fixed inset-y-0 left-0 w-[260px] z-50 flex flex-col shadow-2xl">
            {sidebarContent}
          </aside>
        </>
      )}
    </>
  );
}
