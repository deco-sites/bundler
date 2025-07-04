interface PackageJson {
  dependencies?: Record<string, string>;
  peerDependencies?: Record<string, string>;
}

interface DenoJson {
  imports: Record<string, string>;
}

const JSR_PACKAGE_REGEX = /^(?:npm:)?@jsr\/([^_]+)__([^@]+)@(.+)$/;

/**
 * Converts a package.json dependency to deno.json import map format
 *
 * @example
 * JSR package with npm: prefix
 * convertDependency("npm:@jsr/deco__actors@0.33.1") // => "jsr:@deco/actors@0.33.1"
 *
 * @example
 * Regular npm package
 * convertDependency("lodash@4.17.21") // => "npm:lodash@4.17.21"
 */
function convertDependency(dep: string): string {
  // Check if it's a JSR package (full package spec)
  const jsrMatch = dep.match(JSR_PACKAGE_REGEX);
  if (jsrMatch) {
    const [, scope, name, version] = jsrMatch;
    return `jsr:@${scope}/${name}@${version}`;
  }

  // Already has npm: prefix and is not a JSR package
  return dep;
}

/**
 * Converts package.json dependencies to deno.json import map format
 *
 * @param packageJson - The package.json content
 * @returns A deno.json object with imports
 */
export function convertToDenoJson(packageJson: PackageJson): DenoJson {
  const imports: Record<string, string> = {};

  const deps = {
    ...packageJson.dependencies,
    ...packageJson.peerDependencies,
  };

  // Process dependencies
  for (const [name, dep] of Object.entries(deps)) {
    // Check if the version is already a full package spec (like npm:@jsr/...)
    if (dep.startsWith("npm:")) {
      const jsrMatch = dep.match(JSR_PACKAGE_REGEX);
      if (!jsrMatch) {
        continue;
      }
      const [, scope, name, version] = jsrMatch;

      imports[name] = `jsr:@${scope}/${name}@${version}`;
      imports[name + "/"] = `jsr:/@${scope}/${name}@${version}/`;
    } else {
      imports[name] = `npm:${name}@${dep}`;
      imports[name + "/"] = `npm:/${name}@${dep}/`;
    }
  }

  return { imports };
}
