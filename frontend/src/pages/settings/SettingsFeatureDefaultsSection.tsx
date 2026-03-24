import { UI_COPY } from "../../lib/uiCopy";
import { FeedbackCallout, FeedbackDisclosure } from "../../components/ui/Feedback";

import { SETTINGS_COPY } from "./settingsCopy";

type SettingsFeatureDefaultsSectionProps = {
  writingMemoryInjectionEnabled: boolean;
  onChangeWritingMemoryInjectionEnabled: (enabled: boolean) => void;
  onResetWritingMemoryInjectionEnabled: () => void;
};

export function SettingsFeatureDefaultsSection(props: SettingsFeatureDefaultsSectionProps) {
  return (
    <section className="panel p-6" aria-label={UI_COPY.featureDefaults.ariaLabel} role="region">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="grid gap-1">
          <div className="font-content text-xl text-ink">{UI_COPY.featureDefaults.title}</div>
          <div className="text-xs text-subtext">{UI_COPY.featureDefaults.subtitle}</div>
          <div className="text-xs text-subtext">
            {SETTINGS_COPY.featureDefaults.status(props.writingMemoryInjectionEnabled)}
          </div>
        </div>
        <span className="manuscript-chip">{props.writingMemoryInjectionEnabled ? "默认开启注入" : "默认关闭注入"}</span>
      </div>

      <FeedbackDisclosure
        className="mt-4 rounded-atelier border border-border bg-canvas p-4"
        summaryClassName="px-0 py-0"
        bodyClassName="pt-4"
        title={
          <div className="grid gap-1">
            <div className="text-sm text-ink">展开默认开关设置</div>
            <div className="text-xs text-subtext">
              这里定义的是新章节进入写作时的默认状态，用来减少重复操作，不会覆盖你在单章里的临时判断。
            </div>
          </div>
        }
      >
        <div className="grid gap-2">
          <label className="flex items-center gap-2 text-sm text-ink">
            <input
              className="checkbox"
              id="settings_writing_memory_injection_default"
              name="writing_memory_injection_default"
              checked={props.writingMemoryInjectionEnabled}
              onChange={(e) => props.onChangeWritingMemoryInjectionEnabled(e.target.checked)}
              aria-label="settings_writing_memory_injection_default"
              type="checkbox"
            />
            {UI_COPY.featureDefaults.memoryInjectionLabel}
          </label>
          <div className="text-[11px] text-subtext">{UI_COPY.featureDefaults.memoryInjectionHint}</div>

          <div className="mt-2 flex flex-wrap items-center gap-2">
            <button
              className="btn btn-secondary btn-sm"
              onClick={props.onResetWritingMemoryInjectionEnabled}
              type="button"
            >
              {UI_COPY.featureDefaults.reset}
            </button>
            <div className="text-[11px] text-subtext">{UI_COPY.featureDefaults.resetHint}</div>
          </div>

          <FeedbackCallout className="mt-3 text-xs" title="默认值不会阻断写作">
            {UI_COPY.featureDefaults.autoUpdateHint}
          </FeedbackCallout>
        </div>
      </FeedbackDisclosure>
    </section>
  );
}
