/**
 * Flattens ClickUp's Space > Folder > List hierarchy into one pickable list.
 *
 * Merchants think "which list does this task go in", not "which folder is that
 * list in", so the rules UI offers Space then List and hides the folder level.
 * Foldered lists keep the folder in their label so two lists with the same name
 * stay distinguishable.
 */

export type ClickUpList = { id: string; name: string };
export type ClickUpFolder = { id: string; name: string; lists?: ClickUpList[] };

export type PickableList = { id: string; label: string };

export function mergeSpaceLists(
  folders: ClickUpFolder[],
  folderlessLists: ClickUpList[]
): PickableList[] {
  const folderless = folderlessLists.map((list) => ({
    id: list.id,
    label: list.name,
  }));

  const foldered = folders.flatMap((folder) =>
    (folder.lists ?? []).map((list) => ({
      id: list.id,
      label: `${folder.name} / ${list.name}`,
    }))
  );

  return [...folderless, ...foldered];
}
