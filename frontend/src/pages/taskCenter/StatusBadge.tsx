import { Badge } from "../../components/ui/Badge";
import { humanizeChangeSetStatus, humanizeTaskStatus } from "../../lib/humanize";

type StatusBadgeProps = {
  status: string;
  kind: "change_set" | "task";
};

function statusTone(status: string): "ok" | "warn" | "bad" | "info" {
  const s = String(status || "").trim();
  if (s === "failed") return "bad";
  if (s === "running") return "warn";
  if (s === "queued" || s === "proposed") return "info";
  return "ok";
}

export function StatusBadge(props: StatusBadgeProps) {
  const tone = statusTone(props.status);
  const badgeTone = tone === "bad" ? "danger" : tone === "warn" ? "warning" : tone === "info" ? "info" : "success";
  const label = props.kind === "change_set" ? humanizeChangeSetStatus(props.status) : humanizeTaskStatus(props.status);
  return <Badge tone={badgeTone}>{label}</Badge>;
}
