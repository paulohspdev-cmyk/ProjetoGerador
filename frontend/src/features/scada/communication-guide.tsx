export function PagePurpose({ role, text }: { role: string; text: string }) {
  return (
    <section className="border-b border-border bg-transparent px-1 py-2.5">
      <p className="text-xs font-semibold text-muted-foreground">{role}</p>
      <p className="mt-1 max-w-4xl text-sm leading-snug text-foreground/90">{text}</p>
    </section>
  );
}
