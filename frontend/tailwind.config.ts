import type { Config } from 'tailwindcss';
import animate from 'tailwindcss-animate';

const c = (token: string) => `rgb(var(--${token}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: { sm: '640px', md: '768px', lg: '1024px', xl: '1280px', '2xl': '1440px' },
    extend: {
      colors: {
        bg: c('bg'),
        sidebar: c('sidebar'),
        surface: { DEFAULT: c('surface'), raised: c('surface-raised'), overlay: c('surface-overlay') },
        border: { DEFAULT: c('border'), strong: c('border-strong') },
        text: { DEFAULT: c('text'), muted: c('text-muted'), faint: c('text-faint') },
        accent: { DEFAULT: c('accent'), 2: c('accent-2') },
        keyword: c('keyword'),
        success: c('success'),
        warning: c('warning'),
        danger: c('danger'),
        mode: { keyword: c('keyword'), semantic: c('accent-2'), hybrid: c('accent') },
        type: {
          semantic: c('type-semantic'),
          episodic: c('type-episodic'),
          taxonomic: c('type-taxonomic'),
          procedural: c('type-procedural'),
        },
        // shadcn/ui names
        background: c('background'),
        foreground: c('foreground'),
        popover: { DEFAULT: c('popover'), foreground: c('popover-foreground') },
        primary: { DEFAULT: c('primary'), foreground: c('primary-foreground') },
        secondary: { DEFAULT: c('secondary'), foreground: c('secondary-foreground') },
        muted: { DEFAULT: c('muted'), foreground: c('muted-foreground') },
        destructive: { DEFAULT: c('destructive'), foreground: c('destructive-foreground') },
        input: c('input'),
        ring: c('ring'),
      },
      fontFamily: {
        sans: ['Geist', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['Geist Mono', 'ui-monospace', 'SFMono-Regular', 'monospace'],
      },
      fontSize: {
        title: ['22px', { lineHeight: '28px', fontWeight: '600', letterSpacing: '-0.01em' }],
        section: ['15px', { lineHeight: '22px', fontWeight: '600' }],
        body: ['14px', { lineHeight: '20px', fontWeight: '400' }],
        dense: ['13px', { lineHeight: '18px', fontWeight: '400' }],
        caption: ['12px', { lineHeight: '16px', fontWeight: '500' }],
        metric: ['28px', { lineHeight: '34px', fontWeight: '600', letterSpacing: '-0.02em' }],
      },
      borderRadius: {
        control: 'var(--radius-control)',
        panel: 'var(--radius-panel)',
        overlay: 'var(--radius-overlay)',
        sm: 'var(--radius-control)',
        md: 'var(--radius-control)',
        lg: 'var(--radius-panel)',
        xl: 'var(--radius-overlay)',
      },
      boxShadow: { overlay: 'var(--shadow-overlay)' },
      spacing: { header: 'var(--header-h)', sidebar: 'var(--sidebar-w)', rail: 'var(--sidebar-rail-w)' },
      maxWidth: { content: '1440px', prose: '72ch' },
      height: { row: '44px', 'row-dense': '36px' },
      transitionTimingFunction: { out: 'var(--ease-out)' },
      transitionDuration: { fast: '120ms', base: '160ms' },
      keyframes: {
        'row-in': { from: { opacity: '0', transform: 'translateY(4px)' }, to: { opacity: '1', transform: 'none' } },
        'draw-line': { from: { strokeDashoffset: 'var(--len)' }, to: { strokeDashoffset: '0' } },
        shimmer: { '0%': { opacity: '0.5' }, '50%': { opacity: '0.9' }, '100%': { opacity: '0.5' } },
      },
      animation: {
        'row-in': 'row-in 180ms var(--ease-out) both',
        'draw-line': 'draw-line 400ms var(--ease-out) both',
        shimmer: 'shimmer 1.6s ease-in-out infinite',
      },
    },
  },
  plugins: [animate],
} satisfies Config;
