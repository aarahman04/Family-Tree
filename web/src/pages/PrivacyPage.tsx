export function PrivacyPage() {
  return (
    <div className="flex flex-col gap-8">
      <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Privacy</h1>

      <section className="rounded-lg border border-green-200 bg-green-50 p-5 dark:border-green-900 dark:bg-green-950/40">
        <p className="font-medium text-green-800 dark:text-green-300">
          Your family tree file never leaves your device. Everything on this page happens entirely
          in your browser.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          No uploads to a server
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          When you select or drop an FTZ file, it's read directly by your browser and processed in a
          background thread on your own device. The file's contents — names, dates, notes,
          relationships — are never transmitted to this site's server or to any third party. This
          site has no backend that receives file data at all.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          No tracking, no analytics
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          This site does not use analytics scripts, tracking pixels, or third-party cookies.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          No personal data stored
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          Nothing about your family tree is saved between visits. Refreshing the page clears
          everything. There are no accounts, no sign-in, and nothing is written to a database
          anywhere.
        </p>
      </section>

      <section>
        <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
          If this ever changes
        </h2>
        <p className="mt-2 text-slate-600 dark:text-slate-400">
          If a future version of this project adds any server-side processing (for example, an
          optional larger-file conversion service), that change will be documented here honestly,
          including exactly what data would be sent and why — never silently.
        </p>
      </section>
    </div>
  );
}
