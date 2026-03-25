import { Drawer } from "../ui/Drawer";
import { UI_COPY } from "../../lib/uiCopy";

export function AppShellHelpDrawer(props: { open: boolean; onClose: () => void }) {
  return (
    <Drawer
      open={props.open}
      onClose={props.onClose}
      ariaLabel={UI_COPY.help.title}
      panelClassName="h-full w-full max-w-xl border-l border-border bg-canvas p-6 shadow-sm"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.18em] text-subtext">作者帮助</div>
          <div className="mt-2 font-content text-2xl text-ink">{UI_COPY.help.title}</div>
          <div className="mt-1 text-xs text-subtext">{UI_COPY.help.subtitle}</div>
        </div>
        <button className="btn btn-secondary" aria-label="关闭" onClick={props.onClose} type="button">
          关闭
        </button>
      </div>

      <div className="mt-4 grid gap-4">
        <section className="grid gap-2">
          <div className="text-sm font-semibold text-ink">{UI_COPY.help.termsTitle}</div>
          <div className="grid gap-2">
            {UI_COPY.help.terms.map((term) => (
              <div key={term.label} className="rounded-atelier border border-border bg-surface p-3">
                <div className="text-sm text-ink">{term.label}</div>
                <div className="mt-1 text-xs text-subtext">{term.description}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid gap-2">
          <div className="text-sm font-semibold text-ink">{UI_COPY.help.tipsTitle}</div>
          <ul className="list-disc pl-5 text-xs text-subtext">
            {UI_COPY.help.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
        </section>
      </div>
    </Drawer>
  );
}
