"use client";

import { Component, type ReactNode } from "react";
import type { PreviewFile } from "./preview-modal";
import { DownloadCard } from "./download-card";

/**
 * Catches render/runtime crashes inside a viewer (a corrupt PDF, an unexpected
 * library throw, …) and swaps in the DownloadCard instead of letting the whole
 * modal go white. Async fetch failures are handled inside each viewer, but this
 * guards the synchronous render path.
 */
interface Props {
  file: PreviewFile;
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ViewerErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error("Preview viewer crashed:", error);
  }

  render() {
    if (this.state.hasError) {
      return <DownloadCard file={this.props.file} reason="Aperçu indisponible" />;
    }
    return this.props.children;
  }
}
