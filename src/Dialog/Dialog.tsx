import { useCallback, useRef, useEffect } from "react";
import { RemoveScroll } from "react-remove-scroll";

import classes from "./Dialog.module.css";

type Props = {
    isOpen?: boolean;
    children: React.ReactNode | React.ReactNode[];
    onClose?: VoidFunction;
};

export const Dialog: React.FC<Props> = ({
    isOpen = false,
    children,
    onClose,
}: Props): React.ReactElement => {
    const dialogRef = useRef<HTMLDialogElement>(null);

    useEffect((): void => {
        const dialogElement = dialogRef.current;
        if (!dialogElement) {
            return;
        }
        if (isOpen) {
            if (dialogElement.hasAttribute("open")) {
                return;
            }
            dialogElement.showModal();
        } else {
            if (!dialogElement.hasAttribute("open")) {
                return;
            }
            dialogElement.close();
        }
    }, [isOpen]);

    const handleClickDialog = useCallback(
        (): void => {
            onClose?.();
        },
        [onClose]
    );

    const handleClickContent = useCallback(
        (event: React.MouseEvent<HTMLDivElement>): void => {
            // clickイベントの伝搬を止める。
            event.stopPropagation();
        },
        []
    );

    return (
        <RemoveScroll removeScrollBar enabled={isOpen}>
            <dialog
                className={classes["dialog"]}
                ref={dialogRef}
                onClick={handleClickDialog}
            >
                <div className={classes["content"]} onClick={handleClickContent} >
                    {children}
                </div>
            </dialog>
        </RemoveScroll>
    );
};
