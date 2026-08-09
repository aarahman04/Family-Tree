import { useAutoFocus } from "../hooks/useAutoFocus.js";
import { TechnicalDetails } from "./TechnicalDetails.js";

interface ErrorPanelProps {
  userMessage: string;
  technicalDetails: string;
  onTryAgain: () => void;
}

export function ErrorPanel({ userMessage, technicalDetails, onTryAgain }: ErrorPanelProps) {
  const ref = useAutoFocus<HTMLDivElement>();

  return (
    <div
      ref={ref}
      tabIndex={-1}
      className="flex flex-col gap-4 rounded-lg border border-red-200 bg-red-50 p-5"
      role="alert"
    >
      <p className="flex items-start gap-2 text-sm font-medium text-red-800">
        <span aria-hidden="true">✗</span>
        <span>{userMessage}</span>
      </p>

      <TechnicalDetails>{technicalDetails}</TechnicalDetails>

      <button
        type="button"
        onClick={onTryAgain}
        className="w-fit rounded-md border border-red-300 bg-white px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100"
      >
        Try another file
      </button>
    </div>
  );
}
