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

  // If it doesn't start with npm: and it's not a JSR package, add npm: prefix
  if (!dep.startsWith("npm:")) {
    return `npm:${dep}`;
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

  // Process dependencies
  if (packageJson.dependencies) {
    for (const [name, version] of Object.entries(packageJson.dependencies)) {
      // Check if the version is already a full package spec (like npm:@jsr/...)
      if (version.includes("@jsr/") || version.startsWith("npm:")) {
        imports[name] = convertDependency(version);
      } else {
        imports[name] = `npm:${name}@${version}`;
        imports[name + "/"] = `npm:/${name}@${version}/`;
      }
    }
  }

  // Process peerDependencies
  if (packageJson.peerDependencies) {
    for (
      const [name, version] of Object.entries(packageJson.peerDependencies)
    ) {
      // Check if the version is already a full package spec (like npm:@jsr/...)
      if (version.includes("@jsr/") || version.startsWith("npm:")) {
        imports[name] = convertDependency(version);
      } else {
        // Regular version string, construct the full package spec
        imports[name] = `npm:${name}@${version}`;
        imports[name + "/"] = `npm:/${name}@${version}/`;
      }
    }
  }

  return { imports };
}
