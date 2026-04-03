const phaseStyles: Record<string, { bg: string; text: string; dot: string }> = {
  SANDBOX_PHASE_READY: {
    bg: "bg-emerald-500/10",
    text: "text-emerald-400",
    dot: "bg-emerald-400",
  },
  SANDBOX_PHASE_PROVISIONING: {
    bg: "bg-amber-500/10",
    text: "text-amber-400",
    dot: "bg-amber-400",
  },
  SANDBOX_PHASE_ERROR: {
    bg: "bg-red-500/10",
    text: "text-red-400",
    dot: "bg-red-400",
  },
  SANDBOX_PHASE_DELETING: {
    bg: "bg-zinc-500/10",
    text: "text-zinc-400",
    dot: "bg-zinc-400",
  },
};

const phaseLabels: Record<string, string> = {
  SANDBOX_PHASE_READY: "Ready",
  SANDBOX_PHASE_PROVISIONING: "Provisioning",
  SANDBOX_PHASE_ERROR: "Error",
  SANDBOX_PHASE_DELETING: "Deleting",
  SANDBOX_PHASE_UNKNOWN: "Unknown",
  SANDBOX_PHASE_UNSPECIFIED: "Unknown",
};

export default function StatusBadge({ phase }: { phase: string }) {
  const style = phaseStyles[phase] || phaseStyles.SANDBOX_PHASE_ERROR;
  const label = phaseLabels[phase] || phase;

  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-medium ${style.bg} ${style.text}`}
    >
      <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
      {label}
    </span>
  );
}
