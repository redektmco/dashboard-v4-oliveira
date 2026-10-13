export default function PublicReportNotFound() {
  return (
    <div className="flex min-h-dvh items-center justify-center px-4">
      <div className="max-w-[380px] rounded-xl border border-white/10 bg-ink-900 px-6 py-8 text-center">
        <h1 className="font-display text-[18px] font-semibold text-white">Link indisponível</h1>
        <p className="mt-2 text-[13px] text-ink-400">Este relatório não existe mais ou o link foi desligado. Peça um novo à equipe da V4.</p>
      </div>
    </div>
  );
}
