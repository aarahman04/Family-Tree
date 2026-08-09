export function Footer() {
  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto flex max-w-3xl flex-col gap-2 px-4 py-6 text-xs text-slate-600 sm:px-6">
        <p>
          Open source, free to use. Everything runs in your browser — your file is never uploaded
          anywhere.
        </p>
        {/* TODO: link to the public GitHub repository once it's published. */}
      </div>
    </footer>
  );
}
