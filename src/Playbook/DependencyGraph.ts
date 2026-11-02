/**
 * DependencyGraph — deterministic cycle detection over playbook references.
 *
 * Playbook steps may reference other playbooks (procedures and checklists are
 * leaves). Before a resolution expands anything, it must prove the reference
 * graph is acyclic: a playbook that references itself directly or transitively
 * would otherwise loop. Nodes are identified as `id@version` strings; traversal
 * follows the given child order, so the same input always yields the same
 * result.
 */

/**
 * Static helper for cycle detection on the playbook reference graph.
 */
export class DependencyGraph {

    /**
     * Detect a cycle reachable from a root node.
     * @param {string} root - The root node key (e.g. "id@version").
     * @param {(node: string) => string[]} childrenOf - Child playbook keys of a node, in order.
     * @returns {string[]|undefined} The cycle path (first repeated node closes it), or undefined.
     */
    public static detectCycle(root: string, childrenOf: (node: string) => string[]): string[]|undefined {
        return DependencyGraph._dfs(root, childrenOf, [], new Set<string>(), new Set<string>());
    }

    /**
     * Depth-first search tracking the active path to spot a back edge.
     * @param {string} node - The current node.
     * @param {(node: string) => string[]} childrenOf - Child lookup.
     * @param {string[]} path - The active DFS path.
     * @param {Set<string>} onPath - Nodes currently on the path.
     * @param {Set<string>} done - Fully explored nodes.
     * @returns {string[]|undefined} A cycle path, or undefined.
     */
    protected static _dfs(node: string, childrenOf: (node: string) => string[], path: string[], onPath: Set<string>, done: Set<string>): string[]|undefined {
        if (onPath.has(node)) {
            return [...path.slice(path.indexOf(node)), node];
        }

        if (done.has(node)) {
            return undefined;
        }

        path.push(node);
        onPath.add(node);

        for (const child of childrenOf(node)) {
            const cycle = DependencyGraph._dfs(child, childrenOf, path, onPath, done);

            if (cycle !== undefined) {
                return cycle;
            }
        }

        path.pop();
        onPath.delete(node);
        done.add(node);
        return undefined;
    }

}