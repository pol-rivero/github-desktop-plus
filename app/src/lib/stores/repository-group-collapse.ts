import { getStringArray, setStringArray } from '../local-storage'

const CollapsedRepositoryGroupsKey = 'collapsed-repository-groups'

/**
 * The keys of the repository list groups that the user has collapsed in the sidebar.
 */
export function getCollapsedRepositoryGroups(): ReadonlySet<string> {
  return new Set(getStringArray(CollapsedRepositoryGroupsKey))
}

/**
 * Collapses or expands the given groups, leaving every other group untouched,
 * and returns the resulting set.
 */
export function setRepositoryGroupsCollapsed(
  groupKeys: Iterable<string>,
  collapsed: boolean,
  knownGroupKeys: ReadonlySet<string>
): ReadonlySet<string> {
  // The stored value is re-read rather than taken from the caller so that two
  // open windows don't overwrite each other's changes.
  const collapsedGroups = new Set(
    [...getCollapsedRepositoryGroups()].filter(key => knownGroupKeys.has(key))
  )

  for (const groupKey of groupKeys) {
    if (collapsed) {
      collapsedGroups.add(groupKey)
    } else {
      collapsedGroups.delete(groupKey)
    }
  }

  setStringArray(CollapsedRepositoryGroupsKey, [...collapsedGroups])

  return collapsedGroups
}
