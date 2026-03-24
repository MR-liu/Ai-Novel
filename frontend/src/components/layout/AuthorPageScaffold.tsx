import clsx from "clsx";
import { Link } from "react-router-dom";

import { useAppMode } from "../../contexts/AppModeContext";
import { EditorialMetaSummary, type EditorialMetaItem } from "./EditorialMeta";

type EditorialHeroProps = {
  kicker: string;
  title: string;
  subtitle: string;
  items?: EditorialMetaItem[];
  variant?: "default" | "compact";
};

type AuthorPageIntroProps = {
  title: string;
  subtitle: string;
  whenToUse: string;
  outcome: string;
  risk: string;
  variant?: "default" | "compact";
};

type AuthorTab = {
  key: string;
  label: string;
  to: string;
};

export function EditorialHero(props: EditorialHeroProps) {
  const variant = props.variant ?? "default";

  return (
    <section className={clsx("editorial-hero", variant === "compact" && "editorial-hero-compact")}>
      <div className="editorial-kicker">{props.kicker}</div>
      <div className="editorial-title">{props.title}</div>
      <div className="editorial-subtitle">{props.subtitle}</div>
      <div className="editorial-rule" />
      <EditorialMetaSummary items={props.items ?? []} variant={variant === "compact" ? "inline" : "grid"} />
    </section>
  );
}

export function AuthorPageIntro(props: AuthorPageIntroProps) {
  const { mode } = useAppMode();

  return (
    <EditorialHero
      kicker={mode === "studio" ? "工作室工作台" : "作者工作台"}
      title={props.title}
      subtitle={props.subtitle}
      variant={props.variant}
      items={[
        { key: "when", label: "现在可以做什么", value: props.whenToUse },
        { key: "outcome", label: "你会得到什么", value: props.outcome },
        { key: "risk", label: "风险或限制", value: props.risk },
      ]}
    />
  );
}

export function AuthorPageTabs(props: { current: string; tabs: AuthorTab[] }) {
  return (
    <div className="author-tabs">
      {props.tabs.map((tab) => (
        <Link
          key={tab.key}
          className={clsx(
            "author-tab-link",
            props.current === tab.key
              ? "border-accent/30 bg-accent/10 text-ink"
              : "border-border bg-surface text-subtext hover:bg-canvas hover:text-ink",
          )}
          to={tab.to}
        >
          {tab.label}
        </Link>
      ))}
    </div>
  );
}

export function ModeSelectionPanel() {
  const { setMode } = useAppMode();

  return (
    <div className="mx-auto grid max-w-6xl gap-6">
      <section className="launch-hero">
        <div className="relative z-10 max-w-3xl">
          <div className="editorial-kicker">AI Novel V3</div>
          <div className="mt-3 font-content text-4xl leading-tight text-ink sm:text-5xl">先选你的创作方式，再进入这本小说的工作节奏。</div>
          <div className="mt-4 max-w-2xl text-sm leading-7 text-subtext sm:text-[15px]">
            新版本不再只是切导航，而是切换整套工作氛围。专注模式像作者书桌，工作室模式像研究台。你之后随时都能切换。
          </div>
          <div className="editorial-rule" />
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        <button
          className="panel-interactive p-6 text-left"
          onClick={() => setMode("focus")}
          type="button"
          aria-label="选择专注模式"
        >
          <div className="editorial-kicker">Focus Paper</div>
          <div className="mt-3 font-content text-3xl text-ink">专注模式</div>
          <div className="mt-3 text-sm leading-7 text-subtext">
            资料、大纲、写作、校对、发布都围绕作者主线展开。适合想长时间停留在正文与创作节奏里的人。
          </div>
          <div className="mt-5 grid gap-2 text-xs text-subtext">
            <div>更大的留白和更少的系统噪音。</div>
            <div>AI 与底层能力默认退到后方，不抢正文注意力。</div>
            <div>适合从“想继续写哪一章”开始思考，而不是从“要配什么参数”开始。</div>
          </div>
        </button>

        <button
          className="panel-interactive p-6 text-left"
          onClick={() => setMode("studio")}
          type="button"
          aria-label="选择工作室模式"
        >
          <div className="editorial-kicker">Studio Ledger</div>
          <div className="mt-3 font-content text-3xl text-ink">工作室模式</div>
          <div className="mt-3 text-sm leading-7 text-subtext">
            模型、检索、任务、连续性底座和排障能力都会回到台前。适合长篇、多资料、强控制力和系统化写作场景。
          </div>
          <div className="mt-5 grid gap-2 text-xs text-subtext">
            <div>更强的分区、更清晰的研究台和工具链视角。</div>
            <div>适合处理资料治理、生成调试和复杂连续性问题。</div>
            <div>不是更难用，而是把深层能力留在一个更明确的位置。</div>
          </div>
        </button>
      </div>
    </div>
  );
}

export function StudioModeRequiredPanel() {
  const { setMode } = useAppMode();

  return (
    <section className="editorial-hero">
      <div className="editorial-kicker">Studio Only</div>
      <div className="editorial-title">此区域属于工作室模式</div>
      <div className="editorial-subtitle">
        这里承载模型、资料检索、底层任务和系统治理能力。如果你现在只想继续写作，保持专注模式即可；如果要做更深的配置或排障，再切过来。
      </div>
      <div className="mt-6 flex flex-wrap gap-2">
        <button className="btn btn-primary" onClick={() => setMode("studio")} type="button">
          切换到工作室模式
        </button>
      </div>
    </section>
  );
}
