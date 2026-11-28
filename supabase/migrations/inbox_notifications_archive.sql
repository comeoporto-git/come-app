-- Notificações automáticas (Vercel, GitHub, newsletters…): as de rotina são
-- marcadas como lidas e arquivadas numa etiqueta do Gmail; as importantes
-- ficam na caixa, com estrela, e destacadas na app (status "attention").
ALTER TABLE inbox_settings
  ADD COLUMN IF NOT EXISTS auto_archive_notifications boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS notifications_label text NOT NULL DEFAULT 'Notificações';
