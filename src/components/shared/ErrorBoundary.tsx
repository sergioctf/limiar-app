"use client";

import React, { ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends React.Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error("ErrorBoundary caught:", error, errorInfo);
  }

  reset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        this.props.fallback ?? (
          <div className="card p-6 space-y-4 max-w-md mx-auto mt-8">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-lg bg-red-500/20 flex items-center justify-center">
                <AlertTriangle className="w-5 h-5 text-red-400" />
              </div>
              <h2 className="font-bold text-surface-100">Algo deu errado</h2>
            </div>
            <p className="text-sm text-surface-400">
              Desculpe, encontramos um erro ao carregar esta seção.
            </p>
            {process.env.NODE_ENV === "development" && this.state.error && (
              <pre className="text-xs bg-surface-900 p-2 rounded overflow-auto max-h-40 text-red-300">
                {this.state.error.message}
              </pre>
            )}
            <button
              onClick={this.reset}
              className="btn-secondary flex items-center gap-2 w-full justify-center"
            >
              <RefreshCw className="w-4 h-4" />
              Tentar novamente
            </button>
          </div>
        )
      );
    }

    return this.props.children;
  }
}
