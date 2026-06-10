import { create } from 'zustand';
import { Modal } from './Modal';
import { Button } from './Button';

interface ConfirmOptions {
  title: string;
  message?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  danger?: boolean;
}

interface ConfirmState {
  open: boolean;
  opts: ConfirmOptions;
  resolve: ((v: boolean) => void) | null;
}

const useConfirmStore = create<ConfirmState>(() => ({
  open: false,
  opts: { title: '' },
  resolve: null,
}));

/** Imperative confirm: `if (await confirm({...})) { ... }`. */
export function confirm(opts: ConfirmOptions): Promise<boolean> {
  return new Promise((resolve) => {
    useConfirmStore.setState({ open: true, opts, resolve });
  });
}

export function ConfirmHost() {
  const { open, opts, resolve } = useConfirmStore();
  const close = (v: boolean) => {
    resolve?.(v);
    useConfirmStore.setState({ open: false, resolve: null });
  };
  return (
    <Modal
      open={open}
      onClose={() => close(false)}
      title={opts.title}
      footer={
        <>
          <Button variant="ghost" onClick={() => close(false)}>
            {opts.cancelLabel || 'Cancelar'}
          </Button>
          <Button variant={opts.danger ? 'danger' : 'primary'} onClick={() => close(true)}>
            {opts.confirmLabel || 'Confirmar'}
          </Button>
        </>
      }
    >
      <p className="text-slate-500 dark:text-slate-300">{opts.message}</p>
    </Modal>
  );
}
