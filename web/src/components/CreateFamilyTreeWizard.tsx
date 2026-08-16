import { useState } from "react";
import type { FamilyTree, Gender } from "../../../src/models/types.js";
import { buildNewTree } from "../lib/newTree.js";

interface CreateFamilyTreeWizardProps {
  onCreated: (tree: FamilyTree) => void;
  onCancel: () => void;
}

const inputClass =
  "w-full rounded-md border border-slate-500 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500 dark:border-slate-500 dark:bg-slate-800 dark:text-slate-100 dark:placeholder-slate-400";
const labelClass = "block text-sm font-medium text-slate-700 dark:text-slate-300";

/**
 * Two-step "start a tree from scratch" flow. Produces a normal manual FamilyTree via
 * buildNewTree and hands it back through onCreated — there is no special downstream path, so the
 * result behaves exactly like an imported tree.
 */
export function CreateFamilyTreeWizard({ onCreated, onCancel }: CreateFamilyTreeWizardProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [gender, setGender] = useState<Gender>("unknown");
  const [birthDate, setBirthDate] = useState("");
  const [deathDate, setDeathDate] = useState("");
  const [living, setLiving] = useState(true);
  const [notes, setNotes] = useState("");

  const canContinue = name.trim().length > 0;
  const canCreate = firstName.trim().length > 0 || lastName.trim().length > 0;

  function handleCreate() {
    if (!canCreate) return;
    onCreated(
      buildNewTree({
        name,
        description,
        person: { firstName, lastName, gender, birthDate, deathDate, living, notes },
      })
    );
  }

  return (
    <section
      className="rounded-2xl border border-slate-200 bg-white p-6 dark:border-slate-800 dark:bg-slate-900"
      aria-labelledby="wizard-heading"
    >
      <div className="mb-4 flex items-center justify-between">
        <h2
          id="wizard-heading"
          className="text-lg font-semibold text-slate-900 dark:text-slate-100"
        >
          Create a new family tree
        </h2>
        <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
          Step {step} of 2
        </span>
      </div>

      {step === 1 ? (
        <div className="flex flex-col gap-4">
          <div>
            <label htmlFor="tree-name" className={labelClass}>
              Tree name <span className="text-red-500 dark:text-red-400">*</span>
            </label>
            <input
              id="tree-name"
              className={inputClass}
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Khan Family"
            />
          </div>
          <div>
            <label htmlFor="tree-desc" className={labelClass}>
              Description <span className="text-slate-400 dark:text-slate-500">(optional)</span>
            </label>
            <textarea
              id="tree-desc"
              className={inputClass}
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="flex justify-between">
            <button
              type="button"
              onClick={onCancel}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={!canContinue}
              onClick={() => setStep(2)}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
            >
              Next: first person →
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-sm text-slate-600 dark:text-slate-400">
            Add the first person — the root of your tree. You can add everyone else in the editor.
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="fn" className={labelClass}>
                First name
              </label>
              <input
                id="fn"
                className={inputClass}
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="ln" className={labelClass}>
                Last name
              </label>
              <input
                id="ln"
                className={inputClass}
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
              />
            </div>
          </div>
          <div>
            <label htmlFor="gender" className={labelClass}>
              Gender
            </label>
            <select
              id="gender"
              className={inputClass}
              value={gender}
              onChange={(e) => setGender(e.target.value as Gender)}
            >
              <option value="unknown">Unspecified</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label htmlFor="birth" className={labelClass}>
                Birth date
              </label>
              <input
                id="birth"
                type="date"
                className={inputClass}
                value={birthDate}
                onChange={(e) => setBirthDate(e.target.value)}
              />
            </div>
            <div>
              <label htmlFor="death" className={labelClass}>
                Death date
              </label>
              <input
                id="death"
                type="date"
                className={inputClass}
                value={deathDate}
                onChange={(e) => setDeathDate(e.target.value)}
                disabled={living}
              />
            </div>
          </div>
          <label className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
            <input type="checkbox" checked={living} onChange={(e) => setLiving(e.target.checked)} />
            Living
          </label>
          <div>
            <label htmlFor="notes" className={labelClass}>
              Notes <span className="text-slate-400 dark:text-slate-500">(optional)</span>
            </label>
            <textarea
              id="notes"
              className={inputClass}
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
          <div className="flex justify-between">
            <button
              type="button"
              onClick={() => setStep(1)}
              className="rounded-md border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 dark:border-slate-600 dark:text-slate-300 dark:hover:bg-slate-800"
            >
              ← Back
            </button>
            <button
              type="button"
              disabled={!canCreate}
              onClick={handleCreate}
              className="rounded-md bg-emerald-700 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-800 disabled:cursor-not-allowed disabled:bg-slate-300 dark:bg-emerald-500 dark:text-slate-950 dark:hover:bg-emerald-400 dark:disabled:bg-slate-700 dark:disabled:text-slate-400"
            >
              Create tree
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
