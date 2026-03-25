import clsx from "clsx";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

export type MarkdownRendererProps = {
  content: string;
  className?: string;
};

export function MarkdownRenderer(props: MarkdownRendererProps) {
  return (
    <div className={clsx(props.className)}>
      <ReactMarkdown remarkPlugins={[remarkGfm]}>{props.content}</ReactMarkdown>
    </div>
  );
}
