import { Moon, Sun } from "lucide-react";
import { useMemo, useState } from "react";

import { readThemePreference, writeThemeMode } from "../../services/theme";

export function ThemeToggle() {
  const initial = useMemo(
    () => readThemePreference()?.mode ?? (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    [],
  );
  const [mode, setMode] = useState<"light" | "dark">(initial);

  const Icon = mode === "dark" ? Sun : Moon;
  const label = mode === "dark" ? "切换到亮色" : "切换到暗色";

  return (
    <button
      className="btn btn-secondary btn-icon"
      onClick={() => {
        const next = mode === "dark" ? "light" : "dark";
        setMode(next);
        writeThemeMode(next);
      }}
      aria-label={label}
      title={label}
      type="button"
    >
      <span className="inline-flex ui-transition-fast">
        <Icon size={18} />
      </span>
    </button>
  );
}
