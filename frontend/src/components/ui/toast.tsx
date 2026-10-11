import { Toaster as Sonner, toast } from 'sonner';

/** Toasts reuse the verb of the action that caused them ("Memory archived"). */
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      theme="dark"
      toastOptions={{
        classNames: {
          toast:
            'group !rounded-panel !border !border-border-strong !bg-surface-overlay !text-text !shadow-overlay !font-sans !text-dense',
          description: '!text-text-muted',
          actionButton: '!bg-accent !text-primary-foreground',
          cancelButton: '!bg-surface-raised !text-text-muted',
          success: '[&_[data-icon]]:!text-success',
          error: '[&_[data-icon]]:!text-danger',
          warning: '[&_[data-icon]]:!text-warning',
        },
      }}
    />
  );
}

export { toast };
