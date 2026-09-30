import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter } from 'react-router-dom';
import App from './App';
import ErrorBoundary from './components/ErrorBoundary';
import { useStore } from './store/useStore';
import { applyTheme, applyBrandColor } from './utils/theme';
import './styles/index.css';

// 启动时把 theme 写入 <html data-theme>，并注入默认主色（随后由 /api/settings/public 覆盖）
const { theme, brand } = useStore.getState();
applyTheme(theme);
applyBrandColor(brand.primaryColor, theme === 'dark');

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <BrowserRouter>
      <App />
    </BrowserRouter>
  </ErrorBoundary>,
);
