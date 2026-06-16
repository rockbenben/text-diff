declare module "diff" {
  export interface Change {
    count?: number;
    value: string;
    added?: boolean;
    removed?: boolean;
  }

  export interface ArrayChange<T> {
    count?: number;
    value: T[];
    added?: boolean;
    removed?: boolean;
  }

  export interface ArrayOptions<T> {
    comparator?: (left: T, right: T) => boolean;
  }

  export function diffChars(oldStr: string, newStr: string): Change[];
  export function diffArrays<T>(oldArr: T[], newArr: T[], options?: ArrayOptions<T>): ArrayChange<T>[];

  /** Build a unified diff (patch) string for two versions of a file. */
  export function createPatch(fileName: string, oldStr: string, newStr: string, oldHeader?: string, newHeader?: string, options?: { context?: number }): string;
}
