import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import type { ReactNode, ButtonHTMLAttributes } from 'react';
import { clsx } from 'clsx';
import { cva } from 'class-variance-authority';
import { twMerge } from 'tailwind-merge';

export const cn = (...args: Parameters<typeof clsx>) => twMerge(clsx(args));
const buttonVariants = cva('button', { variants: { variant: { primary: 'button-primary', secondary: 'button-secondary', ghost: 'button-ghost', danger: 'button-danger' } }, defaultVariants: { variant: 'primary' } });
export function Button({ className, variant = 'primary', ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger' }) {
  return <button className={cn(buttonVariants({ variant }), className)} {...props} />;
}
export function Modal({ title, description, children, onClose }: { title: string; description?: string; children: ReactNode; onClose: () => void }) {
  return <Dialog.Root open onOpenChange={open => { if (!open) onClose(); }}><Dialog.Portal>
    <Dialog.Overlay className="dialog-overlay" />
    <Dialog.Content className="dialog-content">
      <div className="dialog-head"><div><Dialog.Title className="dialog-title">{title}</Dialog.Title><Dialog.Description className="dialog-description">{description || 'Fill in the details below.'}</Dialog.Description></div><Dialog.Close asChild><button className="icon-button" aria-label="Close"><X size={19} /></button></Dialog.Close></div>
      {children}
    </Dialog.Content>
  </Dialog.Portal></Dialog.Root>;
}
export function Field({ label, children }: { label: string; children: ReactNode }) { return <label className="field"><span>{label}</span>{children}</label>; }
export function Empty({ title, text, action }: { title: string; text: string; action?: ReactNode }) {
  return <div className="empty"><div className="empty-icon">✳</div><h3>{title}</h3><p>{text}</p>{action}</div>;
}
