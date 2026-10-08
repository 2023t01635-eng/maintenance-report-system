type StatusBadgeProps = {
  status: "checking" | "online" | "offline";
};

const statusLabels: Record<StatusBadgeProps["status"], string> = {
  checking: "Checking",
  online: "API Online",
  offline: "API Offline"
};

export function StatusBadge({ status }: StatusBadgeProps) {
  return <span className={`status-badge status-badge--${status}`}>{statusLabels[status]}</span>;
}
