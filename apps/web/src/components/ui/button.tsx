import { Slot } from '@radix-ui/react-slot';
import { cva, type VariantProps } from 'class-variance-authority';
import { Loader2 } from 'lucide-react';
import { forwardRef, type ButtonHTMLAttributes } from 'react';
import { cn } from '@/lib/utils';

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl text-sm font-semibold transition-all duration-200 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-500 disabled:pointer-events-none disabled:opacity-55 [&_svg]:size-4 [&_svg]:shrink-0',
  {
    variants: {
      variant: {
        primary: 'bg-brand-700 text-white shadow-sm hover:bg-brand-800 active:bg-brand-900',
        teal: 'bg-teal-600 text-white shadow-sm hover:bg-teal-700',
        secondary: 'bg-white text-brand-800 ring-1 ring-line hover:bg-brand-50 hover:ring-brand-200',
        ghost: 'text-brand-800 hover:bg-brand-50',
        danger: 'bg-danger text-white hover:bg-red-800',
        link: 'text-brand-700 underline-offset-4 hover:underline px-0',
        inverse: 'bg-white text-brand-900 hover:bg-brand-50 shadow-sm',
        outlineLight: 'text-white ring-1 ring-white/35 hover:bg-white/10',
      },
      size: { sm: 'h-9 px-3.5', md: 'h-10 px-4', lg: 'h-12 px-6 text-base', icon: 'size-10' },
    },
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild, loading, disabled, children, ...props }, ref) => {
    const Comp = asChild ? Slot : 'button';
    return (
      <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" aria-hidden />}
            {children}
          </>
        )}
      </Comp>
    );
  },
);
Button.displayName = 'Button';
