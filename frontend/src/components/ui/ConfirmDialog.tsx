import { Modal } from "./Modal";
import type { ChooseOptions, ConfirmChoice, ConfirmOptions } from "./confirm";

export function ConfirmDialog(props: {
  open: boolean;
  variant: "confirm" | "choose";
  options: ConfirmOptions | ChooseOptions | null;
  onClose: (value: boolean | ConfirmChoice) => void;
}) {
  return (
    <Modal
      open={props.open && Boolean(props.options)}
      onClose={() => props.onClose(props.variant === "choose" ? ("cancel" satisfies ConfirmChoice) : false)}
      panelClassName="surface max-w-md p-5"
      ariaLabel={props.options?.title ?? "确认"}
    >
      {props.options ? (
        <>
          <div className="font-content text-xl text-ink">{props.options.title}</div>
          {props.options.description ? <div className="mt-2 text-sm text-subtext">{props.options.description}</div> : null}
          <div className="mt-5 flex justify-end gap-2">
            <button
              className="btn btn-secondary"
              onClick={() => props.onClose(props.variant === "choose" ? ("cancel" satisfies ConfirmChoice) : false)}
              type="button"
            >
              {props.options.cancelText ?? "取消"}
            </button>
            {props.variant === "choose" ? (
              <button
                className={(props.options as ChooseOptions).secondaryDanger ? "btn btn-danger" : "btn btn-secondary"}
                onClick={() => props.onClose("secondary" satisfies ConfirmChoice)}
                type="button"
              >
                {(props.options as ChooseOptions).secondaryText}
              </button>
            ) : null}
            <button
              className={props.options.danger ? "btn btn-danger" : "btn btn-primary"}
              onClick={() => props.onClose(props.variant === "choose" ? ("confirm" satisfies ConfirmChoice) : true)}
              type="button"
            >
              {props.options.confirmText ?? "确认"}
            </button>
          </div>
        </>
      ) : null}
    </Modal>
  );
}
