/**
 * 颜色全部映射到 CSS Variables（src/styles/index.css），主色由「系统配置」运行时写入。
 * 禁止依赖 dark: 前缀 —— 统一走变量，保证主色可配置。
 */
const c = (name) => `rgb(var(--c-${name}) / <alpha-value>)`;
const soft = (name) => `rgb(var(--c-${name}) / 0.12)`;

/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        bg: c('bg'),
        card: c('card'),
        muted: c('muted'),
        hover: c('hover'),
        line: { DEFAULT: c('border'), strong: c('border-strong') },
        fg: { DEFAULT: c('text'), muted: c('text-muted'), subtle: c('text-subtle'), inverse: c('text-inverse') },
        primary: { DEFAULT: c('primary'), soft: soft('primary'), text: c('primary-text'), hover: c('primary-hover'), on: c('on-primary') },
        success: { DEFAULT: c('success'), soft: soft('success') },
        warning: { DEFAULT: c('warning'), soft: soft('warning') },
        danger: { DEFAULT: c('danger'), soft: soft('danger') },
        info: { DEFAULT: c('info'), soft: soft('info') },
      },
      borderRadius: { sm: 'var(--radius-sm)', md: 'var(--radius-md)', lg: 'var(--radius-lg)', xl: 'var(--radius-lg)', '2xl': 'calc(var(--radius-lg) + 4px)' },
      boxShadow: { sm: 'var(--shadow-sm)', md: 'var(--shadow-md)', lg: 'var(--shadow-lg)' },
      transitionDuration: { DEFAULT: '200ms' },
      transitionTimingFunction: { DEFAULT: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
      keyframes: {
        'fade-in': { from: { opacity: 0 }, to: { opacity: 1 } },
        'pop-in': { from: { opacity: 0, transform: 'scale(.94) translateY(8px)' }, to: { opacity: 1, transform: 'scale(1) translateY(0)' } },
        'slide-left': { from: { transform: 'translateX(100%)' }, to: { transform: 'translateX(0)' } },
        'slide-right': { from: { transform: 'translateX(-100%)' }, to: { transform: 'translateX(0)' } },
        'toast-in': { from: { opacity: 0, transform: 'translateX(24px)' }, to: { opacity: 1, transform: 'translateX(0)' } },
        shimmer: { '100%': { transform: 'translateX(100%)' } },
        'route-in': { from: { opacity: 0, transform: 'translateY(6px)' }, to: { opacity: 1, transform: 'translateY(0)' } },
      },
      animation: {
        'fade-in': 'fade-in .2s ease-out both',
        'pop-in': 'pop-in .32s cubic-bezier(.34,1.56,.64,1) both',
        'slide-left': 'slide-left .32s cubic-bezier(.34,1.2,.64,1) both',
        'slide-right': 'slide-right .28s cubic-bezier(.2,.8,.2,1) both',
        'toast-in': 'toast-in .3s cubic-bezier(.34,1.4,.64,1) both',
        shimmer: 'shimmer 1.4s infinite',
        'route-in': 'route-in .22s ease-out both',
      },
    },
  },
  plugins: [],
};
