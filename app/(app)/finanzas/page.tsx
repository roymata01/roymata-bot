export default function FinanzasPage() {
  return (
    <div className="h-full w-full overflow-hidden">
      <iframe
        src="/finanzas/index.html"
        className="h-full w-full border-0"
        title="Finanzas Personales"
        allow="clipboard-write"
      />
    </div>
  );
}
