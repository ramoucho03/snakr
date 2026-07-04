/** Minimal identity of a drive item, passed to the action dialogs. */
export interface TargetItem {
  id: string;
  type: "FILE" | "FOLDER";
  name: string;
}
