'use client';

import { Component, type ReactNode } from 'react';

type Props = { children: ReactNode; title?: string; resetKey?: string };
type State = { failed: boolean; resetKey?: string };

/** A chart failure leaves the surrounding figures, records and navigation usable. */
export class ChartErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { failed: false, resetKey: props.resetKey };
  }

  static getDerivedStateFromError(): Partial<State> {
    return { failed: true };
  }

  static getDerivedStateFromProps(props: Props, state: State): Partial<State> | null {
    return props.resetKey !== state.resetKey ? { failed: false, resetKey: props.resetKey } : null;
  }

  render() {
    if (!this.state.failed) return this.props.children;

    return (
      <div className="flex h-full min-h-32 w-full flex-col items-center justify-center gap-3 rounded-lg border border-dashed p-4 text-center" aria-label={`${this.props.title || 'Chart'} recovery`}>
        <p role="alert" className="text-sm text-muted-foreground">This chart could not be displayed.</p>
        <button type="button" className="rounded-md border bg-background px-3 py-2 text-sm font-medium transition hover:bg-secondary focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2" onClick={() => this.setState({ failed: false })}>
          Retry chart
        </button>
      </div>
    );
  }
}
