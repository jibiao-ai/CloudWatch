import React from 'react';
import { ServerErrorPage } from '../pages/ErrorPages';

export default class ErrorBoundary extends React.Component {
  state = { error: null };
  static getDerivedStateFromError(error) { return { error }; }
  componentDidCatch(error, info) { console.error('[ErrorBoundary]', error, info?.componentStack); }
  render() { return this.state.error ? <ServerErrorPage /> : this.props.children; }
}
