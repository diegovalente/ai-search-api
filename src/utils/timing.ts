/**
 * Simple timer utility for measuring operation durations.
 */
export class Timer {
  private startTime: number;
  private marks: Map<string, number> = new Map();

  constructor() {
    this.startTime = performance.now();
  }

  /**
   * Mark a named checkpoint.
   */
  mark(name: string): void {
    this.marks.set(name, performance.now() - this.startTime);
  }

  /**
   * Get elapsed time since start in milliseconds.
   */
  elapsed(): number {
    return Math.round(performance.now() - this.startTime);
  }

  /**
   * Get duration for a specific mark.
   */
  getMark(name: string): number | undefined {
    const mark = this.marks.get(name);
    return mark !== undefined ? Math.round(mark) : undefined;
  }

  /**
   * Get all timings as an object.
   */
  getTimings(): { llm?: number; validation?: number; total: number } {
    return {
      llm: this.getMark('llm'),
      validation: this.getMark('validation'),
      total: this.elapsed(),
    };
  }
}

